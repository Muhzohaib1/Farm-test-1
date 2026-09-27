import type { Animal } from '../db/types'
import type { T } from '../i18n'
import { daysBetween } from './dates'

export function fmtPKR(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  const sign = n < 0 ? '−' : ''
  return `${sign}Rs ${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function fmtNum(n: number, digits = 1): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** "3 months", "2.5 years", "12 days" */
export function fmtAge(t: T, dob: string | undefined, on: string): string {
  if (!dob) return t('unknown')
  const d = daysBetween(dob, on)
  if (d < 60) return t('days', { n: Math.max(0, d) })
  if (d < 730) return t('months_old', { n: Math.floor(d / 30.44) })
  return t('years_old', { n: fmtNum(d / 365.25) })
}

export const speciesIcon = (s: Animal['species']) => (s === 'goat' ? '🐐' : '🐑')
export const sexIcon = (s: Animal['sex']) => (s === 'F' ? '♀' : '♂')

/** Doe / Buck / Ewe / Ram */
export function kindName(t: T, a: Pick<Animal, 'species' | 'sex'>) {
  return t(`${a.sex === 'F' ? 'female' : 'male'}_${a.species}` as 'female_goat')
}
