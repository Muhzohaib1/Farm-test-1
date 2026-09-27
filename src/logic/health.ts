import type { Animal, Deworming, DrugGroup, Famacha, ISODate, Vaccination, VaccineType } from '../db/types'
import { addDays, daysBetween } from '../lib/dates'
import { ageDays, isPresent } from './data'

/**
 * Worm resistance: warn when the same medicine group would be used three
 * times in a row. Pass the proposed group to check before saving, or omit it
 * to check the existing history.
 */
export function repeatedGroup(dewormings: Deworming[], proposed?: { group: DrugGroup; date: ISODate }): DrugGroup | null {
  const list = [...dewormings]
    .filter((d) => d.group !== 'other')
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((d) => ({ group: d.group, date: d.date }))
  if (proposed) {
    if (proposed.group === 'other') return null
    list.push(proposed)
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }
  // Collapse treatments given within 7 days of each other (e.g. a group of animals over two days).
  const rounds: DrugGroup[] = []
  let lastDate: ISODate | undefined
  for (const d of list) {
    if (lastDate && daysBetween(lastDate, d.date) <= 7 && rounds[rounds.length - 1] === d.group) {
      lastDate = d.date
      continue
    }
    rounds.push(d.group)
    lastDate = d.date
  }
  const tail = rounds.slice(-3)
  return tail.length === 3 && tail.every((g) => g === tail[0]) ? tail[0] : null
}

export function appliesTo(v: VaccineType, a: Animal) {
  return v.species === 'both' || v.species === a.species
}

export interface VaccineDue {
  animal: Animal
  last?: ISODate
  due: ISODate
  daysLeft: number // negative = overdue
}

/** Per vaccine: animals that are due within `soonDays` or overdue. */
export function vaccinesDue(
  types: VaccineType[],
  vaccinations: Vaccination[],
  animals: Animal[],
  now: ISODate,
  soonDays = 14,
): Array<{ type: VaccineType; due: VaccineDue[] }> {
  const out: Array<{ type: VaccineType; due: VaccineDue[] }> = []
  for (const type of types) {
    const byAnimal = new Map<string, ISODate>()
    for (const v of vaccinations) {
      if (v.vaccineTypeId !== type.id) continue
      for (const id of v.animalIds) {
        const cur = byAnimal.get(id)
        if (!cur || v.date > cur) byAnimal.set(id, v.date)
      }
    }
    const due: VaccineDue[] = []
    for (const a of animals) {
      if (!isPresent(a) || !appliesTo(type, a)) continue
      const age = ageDays(a, now)
      if (age !== undefined && age < type.minAgeDays) continue
      const last = byAnimal.get(a.id)
      const dueDate = last ? addDays(last, type.intervalDays) : now
      const daysLeft = daysBetween(now, dueDate)
      if (daysLeft <= soonDays) due.push({ animal: a, last, due: dueDate, daysLeft })
    }
    if (due.length) out.push({ type, due: due.sort((a, b) => a.daysLeft - b.daysLeft) })
  }
  return out
}

export function lastFamacha(famacha: Famacha[]): Map<string, Famacha> {
  const m = new Map<string, Famacha>()
  for (const f of famacha) {
    const cur = m.get(f.animalId)
    if (!cur || f.date > cur.date || (f.date === cur.date && f.createdAt > cur.createdAt)) m.set(f.animalId, f)
  }
  return m
}

/** Animals whose latest eyelid score is 4 or 5 and who haven't been dewormed since. */
export function flaggedAnimals(animals: Animal[], famacha: Famacha[], dewormings: Deworming[]) {
  const last = lastFamacha(famacha)
  const out: Array<{ animal: Animal; check: Famacha }> = []
  for (const a of animals) {
    if (!isPresent(a)) continue
    const f = last.get(a.id)
    if (!f || f.score < 4) continue
    const treated = dewormings.some((d) => d.date >= f.date && d.animalIds.includes(a.id))
    if (!treated) out.push({ animal: a, check: f })
  }
  return out
}

export const FAMACHA_WARN_DAYS = 14
export const FAMACHA_DUE_DAYS = 21

/** Animals whose last eyelid check is 14+ days old (or never checked). Excludes animals under 1 month. */
export function famachaDue(animals: Animal[], famacha: Famacha[], now: ISODate) {
  const last = lastFamacha(famacha)
  const out: Array<{ animal: Animal; days?: number }> = []
  for (const a of animals) {
    if (!isPresent(a)) continue
    const age = ageDays(a, now)
    if (age !== undefined && age < 30) continue
    const f = last.get(a.id)
    const days = f ? daysBetween(f.date, now) : undefined
    if (days === undefined || days >= FAMACHA_WARN_DAYS) out.push({ animal: a, days })
  }
  return out
}
