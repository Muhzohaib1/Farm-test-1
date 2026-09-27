import type { ISODate } from '../db/types'
import type { FarmData } from '../logic/data'
import { daysBetween, fmtDate, today } from './dates'
import { compareTags } from './tags'

export type Cell = string | number | boolean | null | undefined | { date: ISODate }
export interface Sheet {
  name: string
  headers: string[]
  rows: Cell[][]
}

const d = (x?: ISODate): Cell => (x ? { date: x } : null)

/** All data as plain tables, with tags instead of internal ids. */
export function buildSheets(data: FarmData): Sheet[] {
  const tag = (id?: string) => (id ? data.animalsById.get(id)?.tag ?? '' : '')
  const tags = (ids: string[]) => ids.map(tag).sort(compareTags).join(' ')
  const byDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => (a.date < b.date ? -1 : 1))
  const vname = (id: string) => data.vaccineTypes.find((v) => v.id === id)?.name ?? ''

  return [
    {
      name: 'Animals',
      headers: ['Tag', 'Species', 'Sex', 'Breed', 'Date of birth', 'DOB approximate', 'Mother', 'Father', 'Source', 'Purchase date', 'Purchase price (PKR)', 'Status', 'Date sold/died', 'Breeding male', 'Breeding since', 'Separated', 'Notes'],
      rows: [...data.animals].sort((a, b) => compareTags(a.tag, b.tag)).map((a) => [
        a.tag, a.species, a.sex === 'F' ? 'Female' : 'Male', a.breed, d(a.dob), a.dobApprox ? 'yes' : '', a.motherTag, a.fatherTag, a.source,
        d(a.purchaseDate), a.purchasePrice, a.status, d(a.exitDate), a.breedingMale ? 'yes' : '', d(a.breedingStart), d(a.separatedDate), a.notes,
      ]),
    },
    {
      name: 'Matings',
      headers: ['Date', 'Female', 'Male', 'Due date', 'Not pregnant', 'Inbreeding override', 'Override reason'],
      rows: byDate(data.matings).map((m) => [d(m.date), tag(m.femaleId), tag(m.maleId), d(m.dueDate), m.failed ? 'yes' : '', m.override ? 'yes' : '', m.overrideReason]),
    },
    {
      name: 'Births',
      headers: ['Date', 'Mother', 'Father', 'Born alive', 'Born dead', 'Newborn tags', 'Notes'],
      rows: byDate(data.births).map((b) => [
        d(b.date), tag(b.motherId), tag(b.fatherId), b.kids.filter((k) => k.alive).length, b.kids.filter((k) => !k.alive).length,
        b.kids.filter((k) => k.animalId).map((k) => tag(k.animalId)).join(' '), b.notes,
      ]),
    },
    {
      name: 'Deworming',
      headers: ['Date', 'Product', 'Medicine group', 'Dose', 'Whole herd', 'Animals', 'Cost (PKR)'],
      rows: byDate(data.dewormings).map((x) => [d(x.date), x.product, x.group, x.dose, x.wholeHerd ? 'yes' : '', tags(x.animalIds), x.cost]),
    },
    {
      name: 'Eyelid checks',
      headers: ['Date', 'Tag', 'FAMACHA score'],
      rows: byDate(data.famacha).map((f) => [d(f.date), tag(f.animalId), f.score]),
    },
    {
      name: 'Vaccinations',
      headers: ['Date', 'Vaccine', 'Whole herd', 'Animals', 'Cost (PKR)'],
      rows: byDate(data.vaccinations).map((v) => [d(v.date), vname(v.vaccineTypeId), v.wholeHerd ? 'yes' : '', tags(v.animalIds), v.cost]),
    },
    {
      name: 'Treatments',
      headers: ['Date', 'Tag', 'Symptoms', 'Medicine', 'Vet visit', 'Cost (PKR)', 'Notes'],
      rows: byDate(data.treatments).map((x) => [d(x.date), tag(x.animalId), x.symptoms, x.medicine, x.vetVisit ? 'yes' : '', x.cost, x.notes]),
    },
    {
      name: 'Deaths',
      headers: ['Date', 'Tag', 'Cause', 'Age (days)', 'Notes'],
      rows: byDate(data.deaths).map((x) => {
        const a = data.animalsById.get(x.animalId)
        return [d(x.date), tag(x.animalId), x.cause, a?.dob ? daysBetween(a.dob, x.date) : null, x.notes]
      }),
    },
    {
      name: 'Quarantine',
      headers: ['Tag', 'Start', 'Moved to herd', 'Dewormed', 'Vaccinated', 'Lice/ticks checked', 'Days checked'],
      rows: data.quarantine.map((q) => [tag(q.animalId), d(q.startDate), d(q.releasedDate), q.dewormed ? 'yes' : '', q.vaccinated ? 'yes' : '', q.liceChecked ? 'yes' : '', q.dailyChecks.length]),
    },
    {
      name: 'Weights',
      headers: ['Date', 'Tag', 'Weight (kg)'],
      rows: byDate(data.weights).map((w) => [d(w.date), tag(w.animalId), w.kg]),
    },
    {
      name: 'Shearing',
      headers: ['Date', 'Animals', 'Wool (kg)', 'Wool income (PKR)'],
      rows: byDate(data.shearings).map((s) => [d(s.date), tags(s.animalIds), s.woolKg, s.woolIncome]),
    },
    {
      name: 'Sales',
      headers: ['Date', 'Tag', 'Buyer', 'Price (PKR)', 'Reason'],
      rows: byDate(data.sales).map((s) => [d(s.date), tag(s.animalId), s.buyer, s.price, s.reason]),
    },
    {
      name: 'Expenses',
      headers: ['Date', 'Category', 'Amount (PKR)', 'Note'],
      rows: byDate(data.expenses).map((x) => [d(x.date), x.category, x.amount, x.note]),
    },
    {
      name: 'Tag replacements',
      headers: ['Date', 'Tag', 'Reason'],
      rows: byDate(data.tagEvents).map((x) => [d(x.date), tag(x.animalId), x.reason]),
    },
  ]
}

function csvCell(c: Cell): string {
  if (c === null || c === undefined) return ''
  const s = typeof c === 'object' ? fmtDate(c.date) : String(c)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(sheet: Sheet): string {
  // BOM so Excel shows Urdu text correctly
  return '﻿' + [sheet.headers, ...sheet.rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const stamp = () => today()

export function downloadCSV(sheet: Sheet) {
  download(new Blob([toCSV(sheet)], { type: 'text/csv;charset=utf-8' }), `rewar-${sheet.name.toLowerCase().replace(/\s+/g, '-')}-${stamp()}.csv`)
}

export async function downloadExcel(sheets: Sheet[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const bold = { fontWeight: 'bold' as const }
  const toCell = (c: Cell) => {
    if (c === null || c === undefined || c === '') return null
    if (typeof c === 'object') {
      const [y, m, day] = c.date.split('-').map(Number)
      return { value: new Date(Date.UTC(y, m - 1, day)), type: Date, format: 'dd/mm/yyyy' }
    }
    return { value: c }
  }
  const blob = await writeExcelFile(
    sheets.map((s) => ({
      sheet: s.name,
      data: [s.headers.map((h) => ({ value: h, ...bold })), ...s.rows.map((r) => r.map(toCell))],
      stickyRowsCount: 1,
      columns: s.headers.map((h) => ({ width: Math.max(12, h.length + 2) })),
    })) as never,
  ).toBlob()
  download(blob, `rewar-farm-${stamp()}.xlsx`)
}
