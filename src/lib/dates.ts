import type { ISODate } from '../db/types'

const DAY = 86400000

/** Parse "YYYY-MM-DD" as a UTC date so day arithmetic ignores time zones. */
export function parse(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

export function toISO(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The farm's time zone: Pakistan Standard Time, UTC+5 all year (no daylight
 * saving). Family members abroad see the same "today" as the farm.
 */
export const FARM_UTC_OFFSET_HOURS = 5

/** Today's date at the farm (Pakistan), whatever time zone the phone is in. */
export function today(nowMs: number = Date.now()): ISODate {
  return toISO(nowMs + FARM_UTC_OFFSET_HOURS * 3600_000)
}

export function addDays(d: ISODate, days: number): ISODate {
  return toISO(parse(d) + days * DAY)
}

export function addMonths(d: ISODate, months: number): ISODate {
  const dt = new Date(parse(d))
  dt.setUTCMonth(dt.getUTCMonth() + months)
  return toISO(dt.getTime())
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parse(b) - parse(a)) / DAY)
}

/** DD/MM/YYYY */
export function fmtDate(d?: ISODate): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

/** "YYYY-MM" month key. */
export function monthKey(d: ISODate): string {
  return d.slice(0, 7)
}

export function endOfMonth(key: string): ISODate {
  const [y, m] = key.split('-').map(Number)
  return toISO(Date.UTC(y, m, 0))
}

/** The last n month keys ending with the month of `end`. */
export function lastMonths(n: number, end: ISODate = today()): string[] {
  const out: string[] = []
  const [y, m] = end.split('-').map(Number)
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1 - i, 1))
    out.push(toISO(dt.getTime()).slice(0, 7))
  }
  return out
}

export function maxDate(dates: Array<ISODate | undefined>): ISODate | undefined {
  let best: ISODate | undefined
  for (const d of dates) if (d && (!best || d > best)) best = d
  return best
}
