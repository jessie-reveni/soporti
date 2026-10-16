import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@openai/agents', () => ({
  tool: vi.fn(options => options),
}))

const { TIME_TOOL_NAMES, buildTimeTools } = await import('./time-tools.js')

function findTool(tools, name) {
  return tools.find(candidate => candidate.name === name)
}

describe('buildTimeTools', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-16T12:05:09Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds exactly the tools named in TIME_TOOL_NAMES', () => {
    expect(buildTimeTools().map(candidate => candidate.name)).toEqual(TIME_TOOL_NAMES)
  })

  it('answers in the bound zone by default and honours an explicit one', async () => {
    const getTime = findTool(buildTimeTools('Europe/Madrid'), 'get_current_time')

    expect(JSON.parse(await getTime.execute({ timezone: null })).local).toBe('2026-10-16T14:05:09+02:00')
    expect(JSON.parse(await getTime.execute({ timezone: 'Asia/Kolkata' })).local).toBe('2026-10-16T17:35:09+05:30')
  })

  it('defaults to UTC when no zone is bound', async () => {
    const getTime = findTool(buildTimeTools(), 'get_current_time')

    expect(JSON.parse(await getTime.execute({ timezone: null })).timezone).toBe('UTC')
  })

  it('names the bound zone in the timezone parameter description', () => {
    const getTime = findTool(buildTimeTools('Europe/Madrid'), 'get_current_time')

    expect(getTime.parameters.shape.timezone.description).toContain('Europe/Madrid')
  })

  it('returns an error for an unknown zone instead of throwing', async () => {
    const tools = buildTimeTools()
    const getTime = findTool(tools, 'get_current_time')
    const resolveRange = findTool(tools, 'resolve_time_range')
    const convert = findTool(tools, 'convert_time')

    expect(JSON.parse(await getTime.execute({ timezone: 'Mars/Olympus' })).error).toContain('Mars/Olympus')
    expect(
      JSON.parse(await resolveRange.execute({ range: 'last', unit: 'hour', amount: 1, timezone: 'Mars/Olympus' })).error
    ).toContain('Mars/Olympus')
    expect(
      JSON.parse(await convert.execute({ time: '2026-10-16', fromTimezone: null, toTimezone: 'Mars/Olympus' })).error
    ).toContain('Mars/Olympus')
    expect(
      JSON.parse(await convert.execute({ time: '2026-10-16', fromTimezone: 'Mars/Olympus', toTimezone: null })).error
    ).toContain('Mars/Olympus')
  })

  it('resolves a time range in UTC and in local time', async () => {
    const resolveRange = findTool(buildTimeTools('Europe/Madrid'), 'resolve_time_range')

    const result = JSON.parse(await resolveRange.execute({ range: 'last', unit: 'hour', amount: 1, timezone: null }))

    expect(result).toEqual({
      from: '2026-10-16T11:05:09.000Z',
      to: '2026-10-16T12:05:09.000Z',
      fromLocal: '2026-10-16T13:05:09+02:00',
      toLocal: '2026-10-16T14:05:09+02:00',
      timezone: 'Europe/Madrid',
    })
  })

  it('converts an epoch into the target zone and says how long ago it was', async () => {
    const convert = findTool(buildTimeTools(), 'convert_time')

    const result = JSON.parse(
      await convert.execute({ time: '1792144809', fromTimezone: null, toTimezone: 'Europe/Madrid' })
    )

    expect(result.local).toBe('2026-10-16T12:00:09+02:00')
    expect(result.relative).toBe('2 hours ago')
  })

  it('reads a wall-clock time in the source zone', async () => {
    const convert = findTool(buildTimeTools(), 'convert_time')

    const result = JSON.parse(
      await convert.execute({ time: '2026-10-16 09:30', fromTimezone: 'Europe/Madrid', toTimezone: 'UTC' })
    )

    expect(result.utc).toBe('2026-10-16T07:30:00.000Z')
  })

  it('returns an error for a time it cannot read', async () => {
    const convert = findTool(buildTimeTools(), 'convert_time')

    const result = JSON.parse(await convert.execute({ time: 'next tuesday', fromTimezone: null, toTimezone: null }))

    expect(result.error).toContain('Unrecognized time')
  })

  it('rejects an ISO string that looks like an offset but is not a date', async () => {
    const convert = findTool(buildTimeTools(), 'convert_time')

    const result = JSON.parse(await convert.execute({ time: 'garbageZ', fromTimezone: null, toTimezone: null }))

    expect(result.error).toContain('Unrecognized time')
  })
})
