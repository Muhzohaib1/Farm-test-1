import { expenseKind, type ExpenseCategory, type ISODate } from '../db/types'
import type { FarmData } from './data'

export type CostCategory = ExpenseCategory | 'animals'
export type IncomeCategory = 'sales' | 'wool'

/**
 * income: animal sales and wool.
 * running: day-to-day costs (feed, medicine, wages, ...), taken off profit.
 * livestock: animals bought, an investment that earns through sales and births.
 * capital: one-time investment in land, buildings, machinery, ...
 */
export type MoneyGroup = 'income' | 'running' | 'livestock' | 'capital'

export interface Entry {
  date: ISODate
  amount: number
  group: MoneyGroup
  category: CostCategory | IncomeCategory
  label: string
}

/**
 * Every money movement. Treatment, vaccine and dewormer costs and animal purchase
 * prices are included automatically so they don't need to be entered twice.
 */
export function ledger(data: FarmData): Entry[] {
  const e: Entry[] = []
  const tag = (id: string) => data.animalsById.get(id)?.tag ?? '?'
  for (const s of data.sales) e.push({ date: s.date, amount: s.price, group: 'income', category: 'sales', label: tag(s.animalId) })
  for (const s of data.shearings) if (s.woolIncome) e.push({ date: s.date, amount: s.woolIncome, group: 'income', category: 'wool', label: '' })
  for (const x of data.expenses) e.push({ date: x.date, amount: x.amount, group: expenseKind(x.category), category: x.category, label: x.note ?? '' })
  for (const t of data.treatments) {
    if (t.cost) e.push({ date: t.date, amount: t.cost, group: 'running', category: t.vetVisit ? 'vet' : 'medicine', label: `${tag(t.animalId)} ${t.symptoms}` })
  }
  for (const d of data.dewormings) if (d.cost) e.push({ date: d.date, amount: d.cost, group: 'running', category: 'medicine', label: d.product })
  for (const v of data.vaccinations) {
    if (v.cost) e.push({ date: v.date, amount: v.cost, group: 'running', category: 'medicine', label: data.vaccineTypes.find((t) => t.id === v.vaccineTypeId)?.name ?? '' })
  }
  for (const a of data.animals) {
    if (a.source === 'bought' && a.purchasePrice && a.purchaseDate) {
      e.push({ date: a.purchaseDate, amount: a.purchasePrice, group: 'livestock', category: 'animals', label: a.tag })
    }
  }
  return e.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export interface Summary {
  income: number
  running: number
  livestock: number
  capital: number
  /** Profit from running the farm: income minus running costs. Investments are shown separately. */
  profit: number
  byCategory: Record<string, number>
}

export function summarise(entries: Entry[], prefix: string): Summary {
  const s: Summary = { income: 0, running: 0, livestock: 0, capital: 0, profit: 0, byCategory: {} }
  for (const x of entries) {
    if (!x.date.startsWith(prefix)) continue
    s[x.group] += x.amount
    s.byCategory[x.category] = (s.byCategory[x.category] ?? 0) + x.amount
  }
  s.profit = s.income - s.running
  return s
}

export function monthly(entries: Entry[], year: string) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`
    return { month: m, ...summarise(entries, m) }
  })
}

/** All time: how much has been invested, and how much of it the farm's profit has earned back. */
export function investmentRecovery(entries: Entry[]) {
  const all = summarise(entries, '')
  const invested = all.livestock + all.capital
  const earned = Math.max(0, all.profit)
  return { invested, earned, livestock: all.livestock, capital: all.capital, pct: invested ? Math.min(100, Math.round((earned / invested) * 100)) : null }
}
