import type { Animal, Birth, Deworming, DrugGroup, Famacha, ISODate, Mating, Vaccination, VaccineType } from '../db/types'
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

/** Why a borderline (score 3) animal should still be dewormed. */
export type RiskReason = 'young' | 'pregnant' | 'nursing'

/**
 * Groups that suffer most from worms: young animals (under 6 months), pregnant
 * females, and females that gave birth in the last 2 months.
 */
export function riskReason(a: Animal, matings: Mating[], births: Birth[], now: ISODate): RiskReason | undefined {
  const age = ageDays(a, now)
  if (age !== undefined && age < 183) return 'young'
  if (a.sex !== 'F') return undefined
  const lastBirth = births.filter((b) => b.motherId === a.id).reduce<ISODate | undefined>((m, b) => (!m || b.date > m ? b.date : m), undefined)
  if (lastBirth && daysBetween(lastBirth, now) <= 60) return 'nursing'
  const pregnant = matings.some(
    (m) => m.femaleId === a.id && !m.failed && m.date <= now && m.dueDate >= addDays(now, -14) && (!lastBirth || lastBirth < m.date),
  )
  return pregnant ? 'pregnant' : undefined
}

export interface FamachaAdvice {
  level: 'ok' | 'watch' | 'treat' | 'urgent'
  deworm: boolean
  vet: boolean
  recheckDays?: number
}

/**
 * What to do after an eyelid (FAMACHA) check:
 * 1–2 healthy; 3 borderline (treat only animals at risk); 4 anaemic, deworm;
 * 5 severely anaemic, deworm and call the vet.
 */
export function famachaAdvice(score: number, risk?: RiskReason): FamachaAdvice {
  if (score <= 2) return { level: 'ok', deworm: false, vet: false }
  if (score === 3) return risk ? { level: 'treat', deworm: true, vet: false, recheckDays: 7 } : { level: 'watch', deworm: false, vet: false, recheckDays: 7 }
  if (score === 4) return { level: 'treat', deworm: true, vet: false, recheckDays: 7 }
  return { level: 'urgent', deworm: true, vet: true, recheckDays: 7 }
}

/** The medicine group used most recently, to suggest switching. */
export function lastGroup(dewormings: Deworming[]): DrugGroup | undefined {
  let best: Deworming | undefined
  for (const d of dewormings) if (!best || d.date > best.date || (d.date === best.date && d.createdAt > best.createdAt)) best = d
  return best?.group
}

/**
 * Animals that need deworming after their latest eyelid check and haven't been
 * dewormed since: score 4–5, or score 3 in a risk group.
 */
export function flaggedAnimals(
  animals: Animal[],
  famacha: Famacha[],
  dewormings: Deworming[],
  risk: (a: Animal) => RiskReason | undefined = () => undefined,
) {
  const last = lastFamacha(famacha)
  const out: Array<{ animal: Animal; check: Famacha }> = []
  for (const a of animals) {
    if (!isPresent(a)) continue
    const f = last.get(a.id)
    if (!f || !famachaAdvice(f.score, f.score === 3 ? risk(a) : undefined).deworm) continue
    const treated = dewormings.some((d) => d.date >= f.date && d.animalIds.includes(a.id))
    if (!treated) out.push({ animal: a, check: f })
  }
  return out
}

/** Animals with a 3–5 score that are due to be looked at again (7+ days ago). */
export function famachaRecheck(animals: Animal[], famacha: Famacha[], now: ISODate) {
  const last = lastFamacha(famacha)
  return animals.filter((a) => {
    if (!isPresent(a)) return false
    const f = last.get(a.id)
    if (!f || f.score < 3) return false
    const days = daysBetween(f.date, now)
    return days >= 7 && days < FAMACHA_WARN_DAYS
  })
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
