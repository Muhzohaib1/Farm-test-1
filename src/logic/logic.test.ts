import { describe, expect, it } from 'vitest'
import type { Animal, Base, Deworming, Famacha, Mating, Quarantine, Vaccination } from '../db/types'
import { DEFAULT_VACCINES } from '../db/db'
import { addDays, daysBetween, fmtDate, lastMonths } from '../lib/dates'
import { nextTag, nextTags, tagPrefix, tagTaken } from '../lib/tags'
import { computeAlerts } from './alerts'
import { checkInbreeding, dueDate, openPregnancies } from './breeding'
import { buildData, type RawData } from './data'
import { ledger, summarise } from './finance'
import { famachaDue, flaggedAnimals, repeatedGroup, vaccinesDue } from './health'
import { quarantineState } from './quarantine'
import { headcount, herdOverTime, last12Months } from './stats'

const NOW = '2026-09-27'
let n = 0
const base = (): Base => ({ id: `id${++n}`, createdAt: n, updatedAt: n })
const animal = (p: Partial<Animal>): Animal => ({
  ...base(), tag: `X-${n}`, species: 'goat', sex: 'F', breed: 'beetal', source: 'born', status: 'on_farm', ...p,
})
const empty = (): RawData => ({
  animals: [], tagEvents: [], matings: [], births: [], dewormings: [], famacha: [], vaccineTypes: [],
  vaccinations: [], treatments: [], deaths: [], quarantine: [], weights: [], shearings: [], sales: [], expenses: [],
})
const farm = (p: Partial<RawData>) => {
  const raw = { ...empty(), ...p }
  return buildData(raw, raw.animals)
}

describe('dates', () => {
  it('formats DD/MM/YYYY', () => expect(fmtDate('2026-03-05')).toBe('05/03/2026'))
  it('adds days across months and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
  })
  it('lists months', () => expect(lastMonths(3, '2026-01-15')).toEqual(['2025-11', '2025-12', '2026-01']))
})

describe('tags', () => {
  const herd = [{ tag: 'D-01' }, { tag: 'D-02' }, { tag: 'D-10' }, { tag: 'B-01' }, { tag: 'K26-03' }]
  it('suggests next free number, never reusing', () => {
    expect(nextTag('D-', herd)).toBe('D-11')
    expect(nextTag('B-', herd)).toBe('B-02')
    expect(nextTag('L26-', herd)).toBe('L26-01')
    expect(nextTags('K26-', herd, 2)).toEqual(['K26-04', 'K26-05'])
  })
  it('builds prefixes', () => {
    expect(tagPrefix({ species: 'goat', sex: 'M', newborn: true, date: '2026-04-01' })).toBe('K26-')
    expect(tagPrefix({ species: 'sheep', sex: 'F', newborn: true, date: '2027-01-01' })).toBe('L27-')
    expect(tagPrefix({ species: 'sheep', sex: 'F', newborn: false })).toBe('D-')
    expect(tagPrefix({ species: 'goat', sex: 'M', newborn: false })).toBe('B-')
  })
  it('detects taken tags case-insensitively', () => {
    const a = [{ id: '1', tag: 'D-01' }]
    expect(tagTaken(' d-01 ', a)).toBe(true)
    expect(tagTaken('D-01', a, '1')).toBe(false)
  })
})

describe('breeding', () => {
  it('computes due dates', () => {
    expect(dueDate('goat', '2026-01-01')).toBe('2026-05-31')
    expect(dueDate('sheep', '2026-01-01')).toBe('2026-05-28')
  })
  const dam = animal({ tag: 'D-01' })
  const sire = animal({ tag: 'B-01', sex: 'M' })
  const byTag = new Map<string, Animal>()
  it('blocks father x daughter', () => {
    const daughter = animal({ tag: 'K25-01', motherTag: 'D-01', fatherTag: 'B-01' })
    const r = checkInbreeding(daughter, sire, byTag)
    expect(r.blocked).toBe(true)
    expect(r.reasons).toContain('male_is_father')
  })
  it('blocks mother x son', () => {
    const son = animal({ tag: 'K25-02', sex: 'M', motherTag: 'D-01', fatherTag: 'B-09' })
    expect(checkInbreeding(dam, son, byTag).reasons).toEqual(['female_is_mother'])
  })
  it('blocks half siblings', () => {
    const f = animal({ tag: 'K25-03', motherTag: 'D-05', fatherTag: 'B-01' })
    const m = animal({ tag: 'K25-04', sex: 'M', motherTag: 'D-06', fatherTag: 'B-01' })
    expect(checkInbreeding(f, m, byTag)).toEqual({ blocked: true, reasons: ['same_father'] })
  })
  it('allows unrelated animals and unknown parents', () => {
    expect(checkInbreeding(animal({ tag: 'D-07' }), animal({ tag: 'B-07', sex: 'M' }), byTag)).toEqual({ blocked: false, reasons: [] })
  })
  it('warns (not blocks) on shared grandparent', () => {
    const map = new Map<string, Animal>([
      ['P1', animal({ tag: 'P1', fatherTag: 'G1' })],
      ['P2', animal({ tag: 'P2', sex: 'M', fatherTag: 'G1' })],
    ])
    const f = animal({ tag: 'C1', motherTag: 'P1' })
    const m = animal({ tag: 'C2', sex: 'M', fatherTag: 'P2' })
    expect(checkInbreeding(f, m, map)).toEqual({ blocked: false, reasons: ['shared_grandparent'] })
  })
  it('tracks open pregnancies until a birth or failure', () => {
    const f = animal({})
    const mat: Mating = { ...base(), femaleId: f.id, maleId: 'm', date: '2026-05-01', dueDate: dueDate('goat', '2026-05-01') }
    const byId = new Map([[f.id, f]])
    expect(openPregnancies([mat], [], byId, NOW)[0].daysToDue).toBe(daysBetween(NOW, mat.dueDate))
    expect(openPregnancies([{ ...mat, failed: true }], [], byId, NOW)).toHaveLength(0)
    const birth = { ...base(), motherId: f.id, date: '2026-09-20', kids: [] }
    expect(openPregnancies([mat], [birth], byId, NOW)).toHaveLength(0)
  })
})

describe('deworming resistance', () => {
  const dw = (date: string, group: Deworming['group']): Deworming => ({ ...base(), date, product: 'x', group, wholeHerd: true, animalIds: [] })
  it('warns on the third same group in a row', () => {
    const hist = [dw('2026-01-01', 'benzimidazole'), dw('2026-03-01', 'benzimidazole')]
    expect(repeatedGroup(hist, { group: 'benzimidazole', date: '2026-05-01' })).toBe('benzimidazole')
    expect(repeatedGroup(hist, { group: 'levamisole', date: '2026-05-01' })).toBeNull()
    expect(repeatedGroup(hist)).toBeNull()
  })
  it('counts treatments within a week as one round', () => {
    const hist = [dw('2026-01-01', 'macrocyclic'), dw('2026-01-03', 'macrocyclic'), dw('2026-03-01', 'macrocyclic')]
    expect(repeatedGroup(hist)).toBeNull()
  })
  it('resets after a different group', () => {
    const hist = [dw('2026-01-01', 'closantel'), dw('2026-02-01', 'closantel'), dw('2026-03-01', 'levamisole'), dw('2026-04-01', 'closantel')]
    expect(repeatedGroup(hist)).toBeNull()
  })
})

describe('health', () => {
  const vt = DEFAULT_VACCINES.map((v) => ({ ...v, createdAt: 0, updatedAt: 0 }))
  it('lists vaccines never given or overdue, skipping young and wrong species', () => {
    const adult = animal({ dob: '2024-01-01' })
    const kid = animal({ dob: '2026-09-01' })
    const vac: Vaccination = { ...base(), vaccineTypeId: 'vt-ppr', date: '2026-01-01', wholeHerd: false, animalIds: [adult.id] }
    const due = vaccinesDue(vt, [vac], [adult, kid], NOW)
    const names = due.map((d) => d.type.id)
    expect(names).not.toContain('vt-ppr') // given this year
    expect(names).toContain('vt-et') // never given
    expect(names).toContain('vt-goatpox')
    expect(names).not.toContain('vt-sheeppox')
    expect(due.every((d) => d.due.every((x) => x.animal.id !== kid.id))).toBe(true)
  })
  it('flags FAMACHA 4–5 until dewormed', () => {
    const a = animal({})
    const f: Famacha = { ...base(), animalId: a.id, date: '2026-09-01', score: 4 }
    expect(flaggedAnimals([a], [f], [])).toHaveLength(1)
    const d: Deworming = { ...base(), date: '2026-09-02', product: 'x', group: 'levamisole', wholeHerd: false, animalIds: [a.id] }
    expect(flaggedAnimals([a], [f], [d])).toHaveLength(0)
    const later: Famacha = { ...base(), animalId: a.id, date: '2026-09-10', score: 2 }
    expect(flaggedAnimals([a], [f, later], [])).toHaveLength(0)
  })
  it('eyelid check due after 14 days', () => {
    const a = animal({ dob: '2025-01-01' })
    expect(famachaDue([a], [{ ...base(), animalId: a.id, date: addDays(NOW, -10), score: 2 }], NOW)).toHaveLength(0)
    expect(famachaDue([a], [{ ...base(), animalId: a.id, date: addDays(NOW, -15), score: 2 }], NOW)).toHaveLength(1)
  })
})

describe('quarantine', () => {
  const q = (p: Partial<Quarantine>): Quarantine => ({ ...base(), animalId: 'a', startDate: '2026-09-01', dailyChecks: [], ...p })
  const all21 = Array.from({ length: 21 }, (_, i) => addDays('2026-09-01', i))
  it('counts days', () => {
    const s = quarantineState(q({}), [], [], '2026-09-08')
    expect(s.day).toBe(8)
    expect(s.daysLeft).toBe(14)
    expect(s.missedDays).toHaveLength(7)
  })
  it('only releases when everything is done and 21 days passed', () => {
    const done = { dewormed: true, vaccinated: true, liceChecked: true, dailyChecks: all21 }
    expect(quarantineState(q(done), [], [], '2026-09-21').canRelease).toBe(false) // day 21 not finished
    expect(quarantineState(q(done), [], [], '2026-09-22').canRelease).toBe(true)
    expect(quarantineState(q({ ...done, liceChecked: false }), [], [], '2026-09-22').canRelease).toBe(false)
    expect(quarantineState(q({ ...done, dailyChecks: all21.slice(1) }), [], [], '2026-09-22').canRelease).toBe(false)
  })
  it('ticks deworm/vaccinate automatically from records', () => {
    const d: Deworming = { ...base(), date: '2026-09-01', product: 'x', group: 'levamisole', wholeHerd: false, animalIds: ['a'] }
    expect(quarantineState(q({}), [d], [], '2026-09-02').dewormed).toBe(true)
  })
})

describe('alerts', () => {
  it('replace breeding male after 2 years', () => {
    const m = animal({ sex: 'M', breedingMale: true, breedingStart: '2024-08-01', tag: 'B-01' })
    const a = computeAlerts(farm({ animals: [m] }), NOW)
    expect(a.find((x) => x.kind === 'male_replace')?.params.tag).toBe('B-01')
  })
  it('separate young males around 4 months', () => {
    const young = animal({ sex: 'M', dob: addDays(NOW, -120) })
    const baby = animal({ sex: 'M', dob: addDays(NOW, -30) })
    const done = animal({ sex: 'M', dob: addDays(NOW, -120), separatedDate: NOW })
    const a = computeAlerts(farm({ animals: [young, baby, done] }), NOW).find((x) => x.kind === 'separate_males')
    expect(a?.tags).toEqual([young.tag])
  })
  it('duplicate tags from two offline phones', () => {
    const a = computeAlerts(farm({ animals: [animal({ tag: 'D-05' }), animal({ tag: 'd-05' })] }), NOW)
    expect(a.some((x) => x.kind === 'duplicate_tag')).toBe(true)
  })
  it('overdue births come first', () => {
    const f = animal({})
    const m: Mating = { ...base(), femaleId: f.id, maleId: 'x', date: '2026-03-01', dueDate: dueDate('goat', '2026-03-01') }
    const a = computeAlerts(farm({ animals: [f], matings: [m] }), NOW)
    expect(a[0].kind).toBe('birth_overdue')
  })
})

describe('stats and money', () => {
  it('headcount and mortality', () => {
    const mom = animal({ dob: '2023-01-01' })
    const k1 = animal({ dob: '2026-06-01' })
    const k2 = animal({ dob: '2026-06-01', status: 'died', exitDate: '2026-06-20' })
    const birth = { ...base(), motherId: mom.id, date: '2026-06-01', kids: [{ sex: 'F' as const, alive: true, animalId: k1.id }, { sex: 'M' as const, alive: true, animalId: k2.id }, { sex: 'M' as const, alive: false }] }
    const death = { ...base(), animalId: k2.id, date: '2026-06-20', cause: 'weak_newborn' as const }
    const data = farm({ animals: [mom, k1, k2], births: [birth], deaths: [death] })
    const h = headcount(data.animals, NOW)
    expect(h.total).toBe(2)
    expect(h.byAge.young).toBe(1)
    const y = last12Months(data, NOW)
    expect(y).toMatchObject({ bornAlive: 2, bornDead: 1, deaths: 1, newbornDeaths: 1 })
    expect(y.mortalityPct).toBeCloseTo(66.7, 1)
    const g = herdOverTime(data.animals, 6, NOW)
    expect(g.find((r) => r.month === '2026-05')?.goat).toBe(1)
    expect(g.find((r) => r.month === '2026-06')?.goat).toBe(2)
  })
  it('profit/loss includes purchases, treatments and wool', () => {
    const bought = animal({ source: 'bought', purchaseDate: '2026-02-01', purchasePrice: 40000 })
    const data = farm({
      animals: [bought],
      sales: [{ ...base(), animalId: bought.id, date: '2026-06-10', price: 75000, reason: 'eid' }],
      expenses: [{ ...base(), date: '2026-03-01', category: 'feed', amount: 10000 }],
      treatments: [{ ...base(), animalId: bought.id, date: '2026-04-01', symptoms: 'x', vetVisit: true, cost: 1500 }],
      shearings: [{ ...base(), date: '2026-05-01', animalIds: [], woolIncome: 2000 }],
    })
    const s = summarise(ledger(data), '2026')
    expect(s.income).toBe(77000)
    expect(s.cost).toBe(51500)
    expect(s.profit).toBe(25500)
    expect(s.byCategory.vet).toBe(1500)
    expect(summarise(ledger(data), '2026-06').profit).toBe(75000)
  })
})
