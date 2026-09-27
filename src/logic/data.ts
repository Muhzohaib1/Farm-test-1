import type { Animal, TableName, Tables } from '../db/types'
import { daysBetween } from '../lib/dates'
import { normTag } from '../lib/tags'

/** Everything the screens need, loaded in memory (a small farm has at most a few thousand rows). */
export type RawData = { [K in Exclude<TableName, 'photos'>]: Tables[K][] }

export interface FarmData extends RawData {
  /** All animals ever recorded, including deleted — used so tag numbers are never reused. */
  allAnimals: Animal[]
  animalsById: Map<string, Animal>
  animalsByTag: Map<string, Animal>
}

export function buildData(raw: RawData, allAnimals: Animal[]): FarmData {
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted)
  const d = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, live(v as { deleted?: boolean }[])])) as RawData
  const animalsById = new Map(d.animals.map((a) => [a.id, a]))
  const animalsByTag = new Map(d.animals.map((a) => [normTag(a.tag), a]))
  return { ...d, allAnimals, animalsById, animalsByTag }
}

export const isPresent = (a: Animal) => a.status === 'on_farm' || a.status === 'quarantine'

/** Was the animal on the farm on this date? Used for "whole herd" records entered late. */
export function presentOn(a: Animal, date: string): boolean {
  const arrived = a.source === 'bought' ? a.purchaseDate ?? a.dob : a.dob ?? a.purchaseDate
  if (arrived && arrived > date) return false
  if (isPresent(a)) return true
  return !!a.exitDate && a.exitDate > date
}

export function ageDays(a: Pick<Animal, 'dob'>, on: string): number | undefined {
  return a.dob ? daysBetween(a.dob, on) : undefined
}

export type AgeGroup = 'young' | 'grower' | 'adult' | 'unknown'
/** under 6 months, 6–12 months, adult */
export function ageGroup(a: Pick<Animal, 'dob'>, on: string): AgeGroup {
  const d = ageDays(a, on)
  if (d === undefined) return 'unknown'
  if (d < 183) return 'young'
  if (d < 365) return 'grower'
  return 'adult'
}

export function children(data: FarmData, a: Animal): Animal[] {
  const t = normTag(a.tag)
  return data.animals.filter((c) => (c.motherTag && normTag(c.motherTag) === t) || (c.fatherTag && normTag(c.fatherTag) === t))
}
