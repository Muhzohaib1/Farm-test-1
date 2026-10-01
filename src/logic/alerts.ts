import type { Animal, DrugGroup, ISODate } from '../db/types'
import { daysBetween } from '../lib/dates'
import { compareTags, normTag } from '../lib/tags'
import { MALE_REPLACE_DAYS, breedingStart, openPregnancies } from './breeding'
import { ageDays, isPresent, type FarmData } from './data'
import { FAMACHA_DUE_DAYS, famachaDue, famachaRecheck, flaggedAnimals, repeatedGroup, riskReason, vaccinesDue } from './health'
import { quarantineState } from './quarantine'
import { eidSoon, readyForBreeding, readyToSell } from './readiness'

export type Level = 'red' | 'amber' | 'green'

/**
 * One row in "Needs attention". `kind` + `params` are turned into text by the
 * screen (so it can be shown in English or Urdu). `link` is where tapping goes.
 */
export interface Alert {
  id: string
  level: Level
  kind:
    | 'vaccine_due'
    | 'famacha_due'
    | 'famacha_recheck'
    | 'quarantine'
    | 'quarantine_ready'
    | 'flagged'
    | 'birth_overdue'
    | 'birth_due'
    | 'male_replace'
    | 'separate_males'
    | 'dewormer_repeat'
    | 'duplicate_tag'
    | 'ready_breed'
    | 'ready_sell'
    | 'eid_sell'
  params: Record<string, string | number>
  tags?: string[]
  link: string
}

const tagsOf = (xs: Animal[]) => xs.map((a) => a.tag).sort(compareTags)

export const SEPARATE_FROM_DAYS = 105 // about 3.5 months
export const SEPARATE_UNTIL_DAYS = 240

export function computeAlerts(data: FarmData, now: ISODate): Alert[] {
  const out: Alert[] = []
  const present = data.animals.filter(isPresent)

  // Births overdue / due in 30 days
  for (const p of openPregnancies(data.matings, data.births, data.animalsById, now)) {
    if (p.daysToDue < 0) {
      out.push({
        id: `birth-${p.mating.id}`, level: 'red', kind: 'birth_overdue',
        params: { tag: p.female.tag, days: -p.daysToDue }, link: `/animal/${p.female.id}`,
      })
    } else if (p.daysToDue <= 30) {
      out.push({
        id: `birth-${p.mating.id}`, level: p.daysToDue <= 7 ? 'amber' : 'green', kind: 'birth_due',
        params: { tag: p.female.tag, days: p.daysToDue }, link: `/animal/${p.female.id}`,
      })
    }
  }

  // Flagged by eyelid check
  const flagged = flaggedAnimals(data.animals, data.famacha, data.dewormings, (a) => riskReason(a, data.matings, data.births, now))
  if (flagged.length) {
    out.push({
      id: 'flagged', level: 'red', kind: 'flagged', params: { n: flagged.length },
      tags: tagsOf(flagged.map((f) => f.animal)), link: '/health/deworm?flagged=1',
    })
  }

  // Quarantine
  for (const q of data.quarantine) {
    if (q.releasedDate) continue
    const a = data.animalsById.get(q.animalId)
    if (!a || a.status !== 'quarantine') continue
    const s = quarantineState(q, data.dewormings, data.vaccinations, now)
    out.push({
      id: `q-${q.id}`, level: s.canRelease ? 'green' : s.checkedToday ? 'amber' : 'red',
      kind: s.canRelease ? 'quarantine_ready' : 'quarantine',
      params: { tag: a.tag, day: Math.min(s.day, 21), left: s.daysLeft }, link: '/quarantine',
    })
  }

  // Vaccines
  for (const v of vaccinesDue(data.vaccineTypes, data.vaccinations, data.animals, now)) {
    const overdue = v.due.filter((d) => d.daysLeft < 0 || !d.last).length
    out.push({
      id: `vac-${v.type.id}`, level: overdue ? 'red' : 'amber', kind: 'vaccine_due',
      params: { name: v.type.name, n: v.due.length, soonest: v.due[0].daysLeft },
      tags: tagsOf(v.due.map((d) => d.animal)), link: `/health/vaccinate?type=${v.type.id}`,
    })
  }

  // Eyelid checks
  const fd = famachaDue(data.animals, data.famacha, now)
  if (fd.length) {
    const worst = fd.some((f) => f.days === undefined || f.days >= FAMACHA_DUE_DAYS)
    const known = fd.filter((f) => f.days !== undefined).map((f) => f.days as number)
    out.push({
      id: 'famacha', level: worst ? 'red' : 'amber', kind: 'famacha_due',
      params: { n: fd.length, days: known.length ? Math.max(...known) : -1 }, link: '/health/famacha',
    })
  }

  // Pale eyelids last time: look again about a week later
  const recheck = famachaRecheck(data.animals, data.famacha, now)
  if (recheck.length) {
    out.push({
      id: 'famacha-recheck', level: 'amber', kind: 'famacha_recheck', params: { n: recheck.length },
      tags: tagsOf(recheck), link: '/health/famacha?recheck=1',
    })
  }

  // Repeated dewormer group
  const rep: DrugGroup | null = repeatedGroup(data.dewormings)
  if (rep) out.push({ id: 'deworm-repeat', level: 'amber', kind: 'dewormer_repeat', params: { group: rep }, link: '/health' })

  // Breeding males in use for more than 2 years
  for (const m of present) {
    if (m.sex !== 'M') continue
    const used = m.breedingMale || data.matings.some((x) => x.maleId === m.id)
    if (!used) continue
    const start = breedingStart(m, data.matings)
    if (!start) continue
    const days = daysBetween(start, now)
    if (days > MALE_REPLACE_DAYS) {
      out.push({
        id: `male-${m.id}`, level: 'amber', kind: 'male_replace',
        params: { tag: m.tag, years: Math.floor((days / 365) * 10) / 10 }, link: `/animal/${m.id}`,
      })
    }
  }

  // Young males to separate from females (~4 months)
  const toSeparate = present.filter((a) => {
    if (a.sex !== 'M' || a.separatedDate || a.breedingMale) return false
    const age = ageDays(a, now)
    return age !== undefined && age >= SEPARATE_FROM_DAYS && age <= SEPARATE_UNTIL_DAYS
  })
  if (toSeparate.length) {
    out.push({
      id: 'separate', level: 'amber', kind: 'separate_males', params: { n: toSeparate.length },
      tags: tagsOf(toSeparate), link: '/animals?filter=separate',
    })
  }

  // Females ready to be put with a male
  const breedable = readyForBreeding(data, now)
  if (breedable.length) {
    out.push({ id: 'ready-breed', level: 'green', kind: 'ready_breed', params: { n: breedable.length }, tags: tagsOf(breedable), link: '/animals?filter=breed' })
  }

  // Males ready to sell (stronger reminder in the weeks before Eid ul-Adha)
  const sellable = readyToSell(data, now)
  if (sellable.length) {
    const eid = eidSoon(now)
    out.push(
      eid !== undefined
        ? { id: 'ready-sell', level: 'amber', kind: 'eid_sell', params: { n: sellable.length, days: eid }, tags: tagsOf(sellable), link: '/animals?filter=sell' }
        : { id: 'ready-sell', level: 'green', kind: 'ready_sell', params: { n: sellable.length }, tags: tagsOf(sellable), link: '/animals?filter=sell' },
    )
  }

  // Duplicate tags (possible if two phones added animals while both offline)
  const seen = new Map<string, Animal[]>()
  for (const a of data.animals) {
    const k = normTag(a.tag)
    seen.set(k, [...(seen.get(k) ?? []), a])
  }
  for (const [tag, list] of seen) {
    if (list.length > 1) {
      out.push({ id: `dup-${tag}`, level: 'red', kind: 'duplicate_tag', params: { tag }, link: `/animal/${list[1].id}` })
    }
  }

  const rank: Record<Level, number> = { red: 0, amber: 1, green: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

/** Male animals needing separation (used by the animal list filter). */
export function malesToSeparate(data: FarmData, now: ISODate): Animal[] {
  return data.animals.filter((a) => {
    if (!isPresent(a) || a.sex !== 'M' || a.separatedDate || a.breedingMale) return false
    const age = ageDays(a, now)
    return age !== undefined && age >= SEPARATE_FROM_DAYS && age <= SEPARATE_UNTIL_DAYS
  })
}
