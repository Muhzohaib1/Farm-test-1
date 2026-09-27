import type { Animal, Birth, ISODate, Mating, Species } from '../db/types'
import { addDays, daysBetween } from '../lib/dates'
import { normTag } from '../lib/tags'

export const GESTATION_DAYS: Record<Species, number> = { goat: 150, sheep: 147 }

export function dueDate(species: Species, matingDate: ISODate): ISODate {
  return addDays(matingDate, GESTATION_DAYS[species])
}

export type InbreedingReason =
  | 'male_is_father'
  | 'female_is_mother'
  | 'same_mother'
  | 'same_father'
  | 'shared_grandparent'

export interface InbreedingResult {
  blocked: boolean // close relatives: block unless overridden
  reasons: InbreedingReason[]
}

const eq = (a?: string, b?: string) => !!a && !!b && normTag(a) === normTag(b)

/**
 * Checks the relationships the owner asked for (father/daughter, mother/son,
 * full or half siblings) and additionally warns (without blocking) about a
 * shared grandparent.
 */
export function checkInbreeding(
  female: Pick<Animal, 'tag' | 'motherTag' | 'fatherTag'>,
  male: Pick<Animal, 'tag' | 'motherTag' | 'fatherTag'>,
  byTag: Map<string, Pick<Animal, 'tag' | 'motherTag' | 'fatherTag'>>,
): InbreedingResult {
  const reasons: InbreedingReason[] = []
  if (eq(female.fatherTag, male.tag)) reasons.push('male_is_father')
  if (eq(male.motherTag, female.tag)) reasons.push('female_is_mother')
  if (eq(female.motherTag, male.motherTag)) reasons.push('same_mother')
  if (eq(female.fatherTag, male.fatherTag)) reasons.push('same_father')
  const blocked = reasons.length > 0

  const grand = (a: Pick<Animal, 'motherTag' | 'fatherTag'>) => {
    const out: string[] = []
    for (const p of [a.motherTag, a.fatherTag]) {
      if (!p) continue
      const parent = byTag.get(normTag(p))
      if (parent?.motherTag) out.push(normTag(parent.motherTag))
      if (parent?.fatherTag) out.push(normTag(parent.fatherTag))
    }
    return out
  }
  const gf = grand(female)
  const gm = grand(male)
  const sharedGrand = gf.some((g) => gm.includes(g))
  // A grandparent that is also the other animal (e.g. grandfather x granddaughter)
  const isGrandparent = gf.includes(normTag(male.tag)) || gm.includes(normTag(female.tag))
  if (!blocked && (sharedGrand || isGrandparent)) reasons.push('shared_grandparent')

  return { blocked, reasons }
}

export interface PregnancyStatus {
  mating: Mating
  female: Animal
  daysToDue: number // negative = overdue
}

/**
 * Open pregnancies: the latest mating per female that has no birth on or after
 * it, is not marked failed, and the female is still on the farm.
 */
export function openPregnancies(
  matings: Mating[],
  births: Birth[],
  animalsById: Map<string, Animal>,
  now: ISODate,
): PregnancyStatus[] {
  const latest = new Map<string, Mating>()
  for (const m of matings) {
    const cur = latest.get(m.femaleId)
    if (!cur || m.date > cur.date) latest.set(m.femaleId, m)
  }
  const out: PregnancyStatus[] = []
  for (const m of latest.values()) {
    if (m.failed) continue
    const female = animalsById.get(m.femaleId)
    if (!female || (female.status !== 'on_farm' && female.status !== 'quarantine')) continue
    const born = births.some((b) => b.motherId === m.femaleId && b.date >= m.date)
    if (born) continue
    out.push({ mating: m, female, daysToDue: daysBetween(now, m.dueDate) })
  }
  return out.sort((a, b) => a.daysToDue - b.daysToDue)
}

/** When a male started breeding: explicit start date, else his first recorded mating. */
export function breedingStart(male: Animal, matings: Mating[]): ISODate | undefined {
  if (male.breedingStart) return male.breedingStart
  let first: ISODate | undefined
  for (const m of matings) if (m.maleId === male.id && (!first || m.date < first)) first = m.date
  return first
}

export const MALE_REPLACE_DAYS = 730
