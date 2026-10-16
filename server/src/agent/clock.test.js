import { describe, it, expect } from 'vitest'
import { describeInstant, describeRelative, parseTimeInput, resolveTimeRange } from './clock.js'

const MADRID = 'Europe/Madrid'

describe('describeInstant', () => {
  it('reports the offset of each zone, daylight saving included', () => {
    const summer = new Date('2026-07-01T12:00:00Z')
    const winter = new Date('2026-01-15T12:00:00Z')

    expect(describeInstant(summer, MADRID).utcOffset).toBe('+02:00')
    expect(describeInstant(winter, MADRID).utcOffset).toBe('+01:00')
    expect(describeInstant(summer, 'UTC').utcOffset).toBe('+00:00')
    expect(describeInstant(summer, 'Asia/Kolkata').utcOffset).toBe('+05:30')
    expect(describeInstant(summer, 'America/New_York').utcOffset).toBe('-04:00')
  })

  it('describes the instant in UTC, in local time and as an epoch', () => {
    expect(describeInstant(new Date('2026-10-16T12:05:09Z'), MADRID)).toEqual({
      utc: '2026-10-16T12:05:09.000Z',
      local: '2026-10-16T14:05:09+02:00',
      timezone: MADRID,
      utcOffset: '+02:00',
      weekday: 'Friday',
      epochSeconds: 1792152309,
    })
  })

  it('takes the weekday from the zone, not from UTC', () => {
    expect(describeInstant(new Date('2026-10-16T23:30:00Z'), MADRID).weekday).toBe('Saturday')
  })
})

describe('resolveTimeRange', () => {
  const NOW = new Date('2026-10-16T12:05:09Z')

  it('resolves a rolling hour ending now', () => {
    const { from, to } = resolveTimeRange({ range: 'last', unit: 'hour', amount: 1 }, MADRID, NOW)

    expect(from.toISOString()).toBe('2026-10-16T11:05:09.000Z')
    expect(to).toEqual(NOW)
  })

  it('keeps the wall-clock time for a rolling week across a daylight saving change', () => {
    const now = new Date('2026-10-27T12:00:00Z')
    const { from, to } = resolveTimeRange({ range: 'last', unit: 'day', amount: 7 }, MADRID, now)

    expect(from.toISOString()).toBe('2026-10-20T11:00:00.000Z')
    expect((to - from) / 3_600_000).toBe(169)
  })

  it('starts the current day at local midnight', () => {
    const now = new Date('2026-10-16T22:30:00Z')
    const { from, to } = resolveTimeRange({ range: 'current', unit: 'day' }, MADRID, now)

    expect(from.toISOString()).toBe('2026-10-16T22:00:00.000Z')
    expect(to).toEqual(now)
  })

  it('starts the current week on Monday', () => {
    const sunday = new Date('2026-10-18T10:00:00Z')
    const { from } = resolveTimeRange({ range: 'current', unit: 'week' }, 'UTC', sunday)

    expect(from.toISOString()).toBe('2026-10-12T00:00:00.000Z')
  })

  it('starts the current year on January first', () => {
    const { from } = resolveTimeRange({ range: 'current', unit: 'year' }, 'UTC', NOW)

    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('floors the current minute and hour', () => {
    expect(resolveTimeRange({ range: 'current', unit: 'minute' }, 'UTC', NOW).from.toISOString()).toBe(
      '2026-10-16T12:05:00.000Z'
    )
    expect(resolveTimeRange({ range: 'current', unit: 'hour' }, 'UTC', NOW).from.toISOString()).toBe(
      '2026-10-16T12:00:00.000Z'
    )
  })

  it('resolves yesterday as the whole previous day, 25 hours long on the daylight saving day', () => {
    const now = new Date('2026-10-26T10:00:00Z')
    const { from, to } = resolveTimeRange({ range: 'previous', unit: 'day' }, MADRID, now)

    expect(from.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect((to - from) / 3_600_000).toBe(25)
  })

  it('resolves the previous month of January as December of the year before', () => {
    const now = new Date('2026-01-10T10:00:00Z')
    const { from, to } = resolveTimeRange({ range: 'previous', unit: 'month' }, 'UTC', now)

    expect(from.toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('resolves the previous minute and hour', () => {
    const minute = resolveTimeRange({ range: 'previous', unit: 'minute' }, 'UTC', NOW)
    const hour = resolveTimeRange({ range: 'previous', unit: 'hour' }, 'UTC', NOW)

    expect([minute.from.toISOString(), minute.to.toISOString()]).toEqual([
      '2026-10-16T12:04:00.000Z',
      '2026-10-16T12:05:00.000Z',
    ])
    expect([hour.from.toISOString(), hour.to.toISOString()]).toEqual([
      '2026-10-16T11:00:00.000Z',
      '2026-10-16T12:00:00.000Z',
    ])
  })

  it('clamps to the end of a shorter month instead of overflowing into the next one', () => {
    const marchEnd = new Date('2026-03-31T12:00:00Z')
    const leapDay = new Date('2028-02-29T12:00:00Z')

    expect(resolveTimeRange({ range: 'last', unit: 'month', amount: 1 }, 'UTC', marchEnd).from.toISOString()).toBe(
      '2026-02-28T12:00:00.000Z'
    )
    expect(resolveTimeRange({ range: 'last', unit: 'year', amount: 1 }, 'UTC', leapDay).from.toISOString()).toBe(
      '2027-02-28T12:00:00.000Z'
    )
  })

  it('goes back a whole number of months', () => {
    const { from } = resolveTimeRange({ range: 'last', unit: 'month', amount: 2 }, 'UTC', NOW)

    expect(from.toISOString()).toBe('2026-08-16T12:05:09.000Z')
  })
})

describe('parseTimeInput', () => {
  it('reads an ISO timestamp with Z or an offset as is', () => {
    expect(parseTimeInput('2026-10-16T12:00:00Z', MADRID).toISOString()).toBe('2026-10-16T12:00:00.000Z')
    expect(parseTimeInput('2026-10-16T14:00:00+02:00', 'UTC').toISOString()).toBe('2026-10-16T12:00:00.000Z')
  })

  it('reads a wall-clock time in the given zone, with or without seconds', () => {
    expect(parseTimeInput('2026-10-16 09:30', MADRID).toISOString()).toBe('2026-10-16T07:30:00.000Z')
    expect(parseTimeInput('2026-10-16T09:30:15', MADRID).toISOString()).toBe('2026-10-16T07:30:15.000Z')
  })

  it('reads a date alone as local midnight', () => {
    expect(parseTimeInput('2026-10-16', MADRID).toISOString()).toBe('2026-10-15T22:00:00.000Z')
  })

  it('tells epoch seconds from epoch milliseconds', () => {
    expect(parseTimeInput('1792152309', 'UTC').toISOString()).toBe('2026-10-16T12:05:09.000Z')
    expect(parseTimeInput('1792152309000', 'UTC').toISOString()).toBe('2026-10-16T12:05:09.000Z')
  })

  it('returns null for text it cannot read and for dates that do not exist', () => {
    expect(parseTimeInput('next tuesday', 'UTC')).toBeNull()
    expect(parseTimeInput('2026-02-31', 'UTC')).toBeNull()
    expect(parseTimeInput('2026-10-16 25:00', 'UTC')).toBeNull()
    expect(parseTimeInput('2026-13-01', 'UTC')).toBeNull()
    expect(parseTimeInput('2026-00-10', 'UTC')).toBeNull()
    expect(parseTimeInput('2026-99-99T99:99:99Z', 'UTC')).toBeNull()
  })
})

describe('describeRelative', () => {
  const NOW = new Date('2026-10-16T12:00:00Z')

  it('describes the past and the future in the largest whole unit', () => {
    expect(describeRelative(new Date('2026-10-16T09:00:00Z'), NOW)).toBe('3 hours ago')
    expect(describeRelative(new Date('2026-10-18T12:00:00Z'), NOW)).toBe('in 2 days')
  })

  it('says now for an instant under a second away', () => {
    expect(describeRelative(new Date('2026-10-16T12:00:00.400Z'), NOW)).toBe('now')
  })
})
