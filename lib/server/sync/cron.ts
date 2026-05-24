/** Computes the next run time for a subset of 5-field cron expressions (minute hour dom month dow). */
export function computeNextCronRun(schedule: string, after: Date = new Date()): string | null {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minuteToken, hourToken, dayToken, monthToken, weekdayToken] = parts
  if (dayToken !== "*" || monthToken !== "*" || weekdayToken !== "*") return null

  const minute = parseCronField(minuteToken, 0, 59)
  const hour = parseCronField(hourToken, 0, 23)
  if (minute === null || hour === null) return null

  const next = new Date(after)
  next.setSeconds(0, 0)
  next.setMilliseconds(0)
  next.setHours(hour, minute, 0, 0)

  if (next.getTime() <= after.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  return next.toISOString()
}

function parseCronField(token: string, min: number, max: number) {
  if (!/^\d+$/.test(token)) return null
  const value = Number(token)
  if (!Number.isInteger(value) || value < min || value > max) return null
  return value
}

export function isCronDue(nextRunAt: string | null | undefined, nowMs = Date.now()) {
  if (!nextRunAt) return true
  const parsed = Date.parse(nextRunAt)
  if (!Number.isFinite(parsed)) return true
  return parsed <= nowMs
}
