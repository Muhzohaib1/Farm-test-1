import type { Animal, ISODate, Sex, Species } from '../db/types'
import { today } from './dates'

/**
 * Tag scheme:
 *   D-01  adult female (doe / ewe) bought or registered
 *   B-01  adult male (buck / ram)
 *   K26-01 goat kid born on farm in 2026
 *   L26-01 lamb born on farm in 2026
 */
export function tagPrefix(opts: { species: Species; sex: Sex; newborn: boolean; date?: ISODate }): string {
  if (opts.newborn) {
    const yy = (opts.date ?? today()).slice(2, 4)
    return `${opts.species === 'goat' ? 'K' : 'L'}${yy}-`
  }
  return opts.sex === 'F' ? 'D-' : 'B-'
}

/** Normalise a typed tag: trim, upper-case, no spaces. */
export function normTag(t: string): string {
  return t.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Next free number for a prefix. Looks at every animal ever recorded, including
 * deleted, sold and dead ones, so numbers are never reused.
 */
export function nextTag(prefix: string, allAnimals: Pick<Animal, 'tag'>[], extraTaken: string[] = []): string {
  let max = 0
  const re = new RegExp(`^${prefix.replace(/[-]/g, '\\-')}(\\d+)$`)
  for (const t of [...allAnimals.map((a) => a.tag), ...extraTaken]) {
    const m = normTag(t).match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

/** Suggest `count` consecutive new tags for a prefix. */
export function nextTags(prefix: string, allAnimals: Pick<Animal, 'tag'>[], count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(nextTag(prefix, allAnimals, out))
  return out
}

export function tagTaken(tag: string, allAnimals: Pick<Animal, 'tag' | 'id'>[], exceptId?: string): boolean {
  const n = normTag(tag)
  return allAnimals.some((a) => a.id !== exceptId && normTag(a.tag) === n)
}

/** Natural sort so D-2 comes before D-10. */
export function compareTags(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}
