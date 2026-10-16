import { z } from 'zod'
import { tool } from '@openai/agents'
import { DEFAULT_TIMEZONE } from '../constants.js'
import { isValidTimezone } from '../schedules/next-run.js'
import { describeInstant, describeRelative, parseTimeInput, resolveTimeRange } from './clock.js'

export const TIME_TOOL_NAMES = ['get_current_time', 'resolve_time_range', 'convert_time']

const MAX_TIME_RANGE_AMOUNT = 1000

function unknownTimezoneError(timezone) {
  return JSON.stringify({
    error: `Unknown time zone "${timezone}". Use an IANA name such as "Europe/Madrid" or "UTC".`,
  })
}

function buildTimezoneParam(timezone) {
  return z
    .string()
    .nullable()
    .default(null)
    .describe(
      `IANA time zone such as "Europe/Madrid", "America/New_York" or "UTC". Null uses this conversation's time zone (${timezone}).`
    )
}

export function buildTimeTools(timezone = DEFAULT_TIMEZONE) {
  const timezoneParam = buildTimezoneParam(timezone)

  return [
    tool({
      name: 'get_current_time',
      description:
        "Get the current date and time. Your training data does not tell you what day it is, so call this before you work with any date: to know what 'now', 'today' or 'this morning' means, to tell how long ago something happened, or to fill the time range of a search. Returns the instant in UTC and in the requested time zone, with its UTC offset and weekday, plus the Unix epoch in seconds.",
      parameters: z.object({ timezone: timezoneParam }),
      execute: async input => {
        const zone = input.timezone ?? timezone
        if (!isValidTimezone(zone)) return unknownTimezoneError(zone)

        return JSON.stringify(describeInstant(new Date(), zone))
      },
    }),
    tool({
      name: 'resolve_time_range',
      description:
        "Turn a relative period ('the last hour', 'the last 7 days', 'today', 'yesterday', 'this week', 'last month') into an exact time range. It is computed in a time zone, with daylight saving handled. Use it instead of doing date arithmetic yourself, and pass `from` and `to` straight to any tool or query that filters by time. `from` is inclusive and `to` exclusive, both in UTC ISO 8601, with the local equivalents alongside.",
      parameters: z.object({
        range: z
          .enum(['last', 'current', 'previous'])
          .describe(
            "`last` is a rolling window of `amount` units ending now ('the last hour', 'the last 7 days'). `current` is the calendar unit we are in, from its start until now ('today', 'this week', 'this month'). `previous` is the whole calendar unit before the current one ('yesterday', 'last week', 'last month')."
          ),
        unit: z.enum(['minute', 'hour', 'day', 'week', 'month', 'year']).describe('Weeks start on Monday.'),
        amount: z
          .number()
          .int()
          .min(1)
          .max(MAX_TIME_RANGE_AMOUNT)
          .default(1)
          .describe('How many units a `last` window spans. Ignored for `current` and `previous`.'),
        timezone: timezoneParam,
      }),
      execute: async input => {
        const zone = input.timezone ?? timezone
        if (!isValidTimezone(zone)) return unknownTimezoneError(zone)

        const { from, to } = resolveTimeRange(input, zone, new Date())

        return JSON.stringify({
          from: from.toISOString(),
          to: to.toISOString(),
          fromLocal: describeInstant(from, zone).local,
          toLocal: describeInstant(to, zone).local,
          timezone: zone,
        })
      },
    }),
    tool({
      name: 'convert_time',
      description:
        "Convert a timestamp between time zones and formats. Use it to read a UTC timestamp or Unix epoch that another tool returned in the user's time zone, or to turn a wall-clock time the user gave ('since 9:30', 'on the 3rd at noon') into an exact instant. Returns the instant in UTC and in the target zone, its weekday, and how long ago or how far ahead of now it is.",
      parameters: z.object({
        time: z
          .string()
          .describe(
            "The moment to convert. One of: an ISO 8601 timestamp with Z or an offset ('2026-10-16T12:00:00Z', '2026-10-16T14:00:00+02:00'); a wall-clock date or date-time with no offset ('2026-10-16', '2026-10-16 09:30'), read in fromTimezone; or a Unix epoch in seconds or milliseconds."
          ),
        fromTimezone: buildTimezoneParam(timezone).describe(
          "Zone a wall-clock time without an offset is read in. Ignored when `time` has Z, an offset, or is an epoch. Null uses the conversation's zone."
        ),
        toTimezone: buildTimezoneParam(timezone).describe(
          "Zone to express the result in. Null uses the conversation's zone."
        ),
      }),
      execute: async input => {
        const fromZone = input.fromTimezone ?? timezone
        const toZone = input.toTimezone ?? timezone
        if (!isValidTimezone(fromZone)) return unknownTimezoneError(fromZone)
        if (!isValidTimezone(toZone)) return unknownTimezoneError(toZone)

        const instant = parseTimeInput(input.time, fromZone)
        if (!instant || Number.isNaN(instant.getTime())) {
          return JSON.stringify({
            error:
              'Unrecognized time. Pass an ISO 8601 timestamp, a "YYYY-MM-DD HH:MM" wall-clock time or a Unix epoch.',
          })
        }

        return JSON.stringify({
          ...describeInstant(instant, toZone),
          relative: describeRelative(instant, new Date()),
        })
      },
    }),
  ]
}
