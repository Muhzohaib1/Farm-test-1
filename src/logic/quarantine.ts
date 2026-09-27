import type { Deworming, ISODate, Quarantine, Vaccination } from '../db/types'
import { addDays, daysBetween } from '../lib/dates'

export const QUARANTINE_DAYS = 21

export interface QuarantineState {
  day: number // 1-based day of quarantine
  daysLeft: number
  dewormed: boolean
  vaccinated: boolean
  liceChecked: boolean
  checkedDays: number
  missedDays: ISODate[] // past days (not today) with no daily check
  checkedToday: boolean
  canRelease: boolean
}

/** All dates from start up to (and including) the last day of quarantine or today, whichever is earlier. */
export function quarantineDays(q: Quarantine, now: ISODate): ISODate[] {
  const out: ISODate[] = []
  const n = Math.min(daysBetween(q.startDate, now) + 1, QUARANTINE_DAYS)
  for (let i = 0; i < n; i++) out.push(addDays(q.startDate, i))
  return out
}

export function quarantineState(
  q: Quarantine,
  dewormings: Deworming[],
  vaccinations: Vaccination[],
  now: ISODate,
): QuarantineState {
  const elapsed = daysBetween(q.startDate, now)
  const dewormed = !!q.dewormed || dewormings.some((d) => d.date >= q.startDate && d.animalIds.includes(q.animalId))
  const vaccinated = !!q.vaccinated || vaccinations.some((v) => v.date >= q.startDate && v.animalIds.includes(q.animalId))
  const days = quarantineDays(q, now)
  const checked = new Set(q.dailyChecks)
  const missedDays = days.filter((d) => d !== now && !checked.has(d))
  const checkedDays = days.filter((d) => checked.has(d)).length
  const allDaysChecked = elapsed >= QUARANTINE_DAYS - 1 && checkedDays >= QUARANTINE_DAYS
  return {
    day: Math.max(1, elapsed + 1),
    daysLeft: Math.max(0, QUARANTINE_DAYS - elapsed),
    dewormed,
    vaccinated,
    liceChecked: !!q.liceChecked,
    checkedDays,
    missedDays,
    checkedToday: checked.has(now),
    canRelease: elapsed >= QUARANTINE_DAYS && dewormed && vaccinated && !!q.liceChecked && allDaysChecked,
  }
}
