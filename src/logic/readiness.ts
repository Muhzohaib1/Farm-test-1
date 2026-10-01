import type { Animal, ISODate } from '../db/types'
import { daysBetween } from '../lib/dates'
import { openPregnancies } from './breeding'
import { ageDays, type FarmData } from './data'

/** Females can be bred from about 10 months, or once they reach a good weight. */
export const BREED_AGE_DAYS = 304
export const BREED_WEIGHT_KG = { dumba: 30, other: 25 }
/** Rest after giving birth before breeding again. */
export const REST_AFTER_BIRTH_DAYS = 90

/** Males ready for sale at 35 kg or 12 months. */
export const SELL_WEIGHT_KG = 35
export const SELL_AGE_DAYS = 365

/**
 * Eid ul-Adha (10 Dhul Hijjah) in Pakistan, approximate: the exact day depends
 * on the moon sighting and can move by a day.
 */
export const EID_UL_ADHA: ISODate[] = ['2026-05-27', '2027-05-17', '2028-05-06', '2029-04-25', '2030-04-14', '2031-04-03', '2032-03-23']
export const EID_WINDOW_DAYS = 56

export function latestWeights(data: FarmData): Map<string, number> {
  const best = new Map<string, { date: ISODate; kg: number }>()
  for (const w of data.weights) {
    const cur = best.get(w.animalId)
    if (!cur || w.date > cur.date) best.set(w.animalId, { date: w.date, kg: w.kg })
  }
  return new Map([...best].map(([id, v]) => [id, v.kg]))
}

/** Females on the farm that are old or heavy enough, not pregnant, and rested after their last birth. */
export function readyForBreeding(data: FarmData, now: ISODate): Animal[] {
  const pregnant = new Set(openPregnancies(data.matings, data.births, data.animalsById, now).map((p) => p.female.id))
  const kg = latestWeights(data)
  return data.animals.filter((a) => {
    if (a.sex !== 'F' || a.status !== 'on_farm' || pregnant.has(a.id)) return false
    const lastBirth = data.births.filter((b) => b.motherId === a.id).reduce<ISODate | undefined>((m, b) => (!m || b.date > m ? b.date : m), undefined)
    if (lastBirth && daysBetween(lastBirth, now) < REST_AFTER_BIRTH_DAYS) return false
    if (lastBirth) return true // has given birth before: an adult
    const age = ageDays(a, now)
    const w = kg.get(a.id)
    const target = a.breed === 'dumba' ? BREED_WEIGHT_KG.dumba : BREED_WEIGHT_KG.other
    return age === undefined || age >= BREED_AGE_DAYS || (w !== undefined && w >= target)
  })
}

/** Males (not kept for breeding) that have reached selling weight or age. */
export function readyToSell(data: FarmData, now: ISODate): Animal[] {
  const kg = latestWeights(data)
  return data.animals.filter((a) => {
    if (a.sex !== 'M' || a.status !== 'on_farm' || a.breedingMale) return false
    if (data.matings.some((m) => m.maleId === a.id)) return false // used for breeding
    const age = ageDays(a, now)
    const w = kg.get(a.id)
    return (w !== undefined && w >= SELL_WEIGHT_KG) || (age !== undefined && age >= SELL_AGE_DAYS)
  })
}

/** Days until the next Eid ul-Adha, if it is within the selling window. */
export function eidSoon(now: ISODate): number | undefined {
  for (const d of EID_UL_ADHA) {
    const days = daysBetween(now, d)
    if (days >= 0) return days <= EID_WINDOW_DAYS ? days : undefined
  }
  return undefined
}
