import type { Animal, ISODate, Species } from '../db/types'
import { addDays, daysBetween, endOfMonth, lastMonths } from '../lib/dates'
import { ageGroup, isPresent, type AgeGroup, type FarmData } from './data'

export interface Headcount {
  total: number
  bySpecies: Record<Species, { F: number; M: number; total: number }>
  byAge: Record<AgeGroup, number>
}

export function headcount(animals: Animal[], now: ISODate): Headcount {
  const h: Headcount = {
    total: 0,
    bySpecies: { goat: { F: 0, M: 0, total: 0 }, sheep: { F: 0, M: 0, total: 0 } },
    byAge: { young: 0, grower: 0, adult: 0, unknown: 0 },
  }
  for (const a of animals) {
    if (!isPresent(a)) continue
    h.total++
    h.bySpecies[a.species][a.sex]++
    h.bySpecies[a.species].total++
    h.byAge[ageGroup(a, now)]++
  }
  return h
}

export interface YearStats {
  births: number // birth events
  bornAlive: number
  bornDead: number
  deaths: number // all deaths
  newbornDeaths: number // born alive but died before 3 months
  mortalityPct: number | null // (born dead + newborn deaths) / total born
}

/** Births, deaths and newborn mortality for the 12 months up to `now`. */
export function last12Months(data: FarmData, now: ISODate): YearStats {
  const from = addDays(now, -365)
  const births = data.births.filter((b) => b.date > from && b.date <= now)
  let bornAlive = 0
  let bornDead = 0
  const kidIds = new Set<string>()
  for (const b of births) {
    for (const k of b.kids) {
      if (k.alive) {
        bornAlive++
        if (k.animalId) kidIds.add(k.animalId)
      } else bornDead++
    }
  }
  const deaths = data.deaths.filter((d) => d.date > from && d.date <= now)
  let newbornDeaths = 0
  for (const d of deaths) {
    if (!kidIds.has(d.animalId)) continue
    const a = data.animalsById.get(d.animalId)
    if (a?.dob && daysBetween(a.dob, d.date) < 90) newbornDeaths++
  }
  const total = bornAlive + bornDead
  return {
    births: births.length,
    bornAlive,
    bornDead,
    deaths: deaths.length,
    newbornDeaths,
    mortalityPct: total ? Math.round(((bornDead + newbornDeaths) / total) * 1000) / 10 : null,
  }
}

/** Date the animal joined the herd. */
export function arrival(a: Animal): ISODate | undefined {
  return a.source === 'bought' ? a.purchaseDate ?? a.dob : a.dob ?? a.purchaseDate
}

/** Month-end headcount per species for the last `months` months. */
export function herdOverTime(animals: Animal[], months = 24, now: ISODate) {
  return lastMonths(months, now).map((m) => {
    const end = m === now.slice(0, 7) ? now : endOfMonth(m)
    const row = { month: m, goat: 0, sheep: 0 }
    for (const a of animals) {
      const start = arrival(a)
      if (!start || start > end) continue
      if (!isPresent(a) && (!a.exitDate || a.exitDate <= end)) continue
      row[a.species]++
    }
    return row
  })
}
