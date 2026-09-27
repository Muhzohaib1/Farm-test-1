import type { ExpenseCategory, ISODate } from '../db/types'
import type { FarmData } from './data'

export type CostCategory = ExpenseCategory | 'animals'
export type IncomeCategory = 'sales' | 'wool'

export interface Entry {
  date: ISODate
  amount: number
  kind: 'income' | 'cost'
  category: CostCategory | IncomeCategory
  label: string
}

/**
 * Every money movement. Treatment, vaccine and dewormer costs and animal purchase
 * prices count as costs automatically so they don't need to be entered twice.
 */
export function ledger(data: FarmData): Entry[] {
  const e: Entry[] = []
  const tag = (id: string) => data.animalsById.get(id)?.tag ?? '?'
  for (const s of data.sales) e.push({ date: s.date, amount: s.price, kind: 'income', category: 'sales', label: tag(s.animalId) })
  for (const s of data.shearings) if (s.woolIncome) e.push({ date: s.date, amount: s.woolIncome, kind: 'income', category: 'wool', label: '' })
  for (const x of data.expenses) e.push({ date: x.date, amount: x.amount, kind: 'cost', category: x.category, label: x.note ?? '' })
  for (const t of data.treatments) {
    if (t.cost) e.push({ date: t.date, amount: t.cost, kind: 'cost', category: t.vetVisit ? 'vet' : 'medicine', label: `${tag(t.animalId)} ${t.symptoms}` })
  }
  for (const d of data.dewormings) if (d.cost) e.push({ date: d.date, amount: d.cost, kind: 'cost', category: 'medicine', label: d.product })
  for (const v of data.vaccinations) {
    if (v.cost) e.push({ date: v.date, amount: v.cost, kind: 'cost', category: 'medicine', label: data.vaccineTypes.find((t) => t.id === v.vaccineTypeId)?.name ?? '' })
  }
  for (const a of data.animals) {
    if (a.source === 'bought' && a.purchasePrice && a.purchaseDate) {
      e.push({ date: a.purchaseDate, amount: a.purchasePrice, kind: 'cost', category: 'animals', label: a.tag })
    }
  }
  return e.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export interface Summary {
  income: number
  cost: number
  profit: number
  byCategory: Record<string, number>
}

export function summarise(entries: Entry[], prefix: string): Summary {
  const s: Summary = { income: 0, cost: 0, profit: 0, byCategory: {} }
  for (const x of entries) {
    if (!x.date.startsWith(prefix)) continue
    if (x.kind === 'income') s.income += x.amount
    else s.cost += x.amount
    s.byCategory[x.category] = (s.byCategory[x.category] ?? 0) + x.amount
  }
  s.profit = s.income - s.cost
  return s
}

export function monthly(entries: Entry[], year: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`
    return { month: m, ...summarise(entries, m) }
  })
}
