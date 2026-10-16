import { offsetMs, shiftParts, toInstant, weekdayOf, zonedParts } from '../schedules/next-run.js'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAYS_PER_WEEK = 7
const EPOCH_MS_THRESHOLD = 100_000_000_000
const EPOCH_RE = /^\d{1,16}$/
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i
const CALENDAR_STEPS = { day: { days: 1 }, week: { days: 7 }, month: { months: 1 }, year: { months: 12 } }
const RELATIVE_UNITS = [
  { unit: 'year', ms: 365 * 24 * HOUR_MS },
  { unit: 'month', ms: 30 * 24 * HOUR_MS },
  { unit: 'week', ms: 7 * 24 * HOUR_MS },
  { unit: 'day', ms: 24 * HOUR_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'minute', ms: MINUTE_MS },
  { unit: 'second', ms: 1000 },
]

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatOffset(offset) {
  const sign = offset < 0 ? '-' : '+'
  const totalMinutes = Math.abs(offset) / MINUTE_MS

  return `${sign}${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`
}

function stepBack(parts, step) {
  if (!step.months) return shiftParts(parts, { days: -step.days })

  const target = shiftParts({ ...parts, day: 1 }, { months: -step.months })
  const daysInTargetMonth = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate()

  return { ...target, day: Math.min(parts.day, daysInTargetMonth) }
}

function scaleStep(step, amount) {
  return Object.fromEntries(Object.entries(step).map(([key, value]) => [key, value * amount]))
}

function startOfUnit(local, unit) {
  if (unit === 'minute') return local
  if (unit === 'hour') return { ...local, minute: 0 }

  const midnight = { ...local, hour: 0, minute: 0 }
  if (unit === 'day') return midnight
  if (unit === 'week') return shiftParts(midnight, { days: -((weekdayOf(local) + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK) })
  if (unit === 'month') return { ...midnight, day: 1 }

  return { ...midnight, month: 1, day: 1 }
}

export function describeInstant(instant, timezone) {
  const offset = offsetMs(instant, timezone)
  const local = new Date(instant.getTime() + offset).toISOString().slice(0, 19)
  const utcOffset = formatOffset(offset)

  return {
    utc: instant.toISOString(),
    local: `${local}${utcOffset}`,
    timezone,
    utcOffset,
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(instant),
    epochSeconds: Math.floor(instant.getTime() / 1000),
  }
}

export function resolveTimeRange({ range, unit, amount = 1 }, timezone, now) {
  const subMinute = now.getTime() % MINUTE_MS
  const local = zonedParts(now, timezone)
  const calendarStep = CALENDAR_STEPS[unit]

  if (range === 'last') {
    if (unit === 'minute') return { from: new Date(now.getTime() - amount * MINUTE_MS), to: now }
    if (unit === 'hour') return { from: new Date(now.getTime() - amount * HOUR_MS), to: now }

    const from = toInstant(stepBack(local, scaleStep(calendarStep, amount)), timezone)

    return { from: new Date(from.getTime() + subMinute), to: now }
  }

  const start = toInstant(startOfUnit(local, unit), timezone)
  if (range === 'current') return { from: start, to: now }
  if (unit === 'minute') return { from: new Date(start.getTime() - MINUTE_MS), to: start }
  if (unit === 'hour') return { from: new Date(start.getTime() - HOUR_MS), to: start }

  const previousStart = toInstant(stepBack(startOfUnit(local, unit), calendarStep), timezone)

  return { from: previousStart, to: start }
}

export function parseTimeInput(time, timezone) {
  const text = String(time).trim()

  if (EPOCH_RE.test(text)) {
    const value = Number(text)
    return new Date(value < EPOCH_MS_THRESHOLD ? value * 1000 : value)
  }

  if (EXPLICIT_OFFSET_RE.test(text)) {
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const match = WALL_CLOCK_RE.exec(text)
  if (!match) return null

  const [year, month, day, hour, minute, second] = match.slice(1).map(part => Number(part ?? 0))
  const isRealDate = new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day
  if (!isRealDate || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null

  const instant = toInstant({ year, month, day, hour, minute }, timezone)

  return new Date(instant.getTime() + second * 1000)
}

export function describeRelative(instant, now) {
  const diff = instant.getTime() - now.getTime()
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const step = RELATIVE_UNITS.find(candidate => Math.abs(diff) >= candidate.ms)

  if (!step) return formatter.format(0, 'second')

  return formatter.format(Math.trunc(diff / step.ms), step.unit)
}
