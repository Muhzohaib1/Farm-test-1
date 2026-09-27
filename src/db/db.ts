import Dexie, { type Table } from 'dexie'
import { TABLE_NAMES, type Base, type Draft, type TableName, type Tables, type VaccineType } from './types'

export interface OutboxEntry {
  key: string // `${table}:${id}`
  table: TableName
  id: string
  at: number
}

export interface Meta {
  key: string
  value: unknown
}

type FarmTables = { [K in TableName]: Table<Tables[K], string> }

class FarmDB extends Dexie {
  outbox!: Table<OutboxEntry, string>
  meta!: Table<Meta, string>
  constructor() {
    // Internal name from the app's first version. Never change it: phones would lose their saved records.
    super('rewar-farm')
    const stores: Record<string, string> = { outbox: 'key, at', meta: 'key' }
    for (const t of TABLE_NAMES) stores[t] = 'id, updatedAt'
    this.version(1).stores(stores)
  }
}

export const db = new FarmDB()

/** Typed access to a data table. */
export function tbl<K extends TableName>(name: K): FarmTables[K] {
  return db.table(name) as unknown as FarmTables[K]
}

let currentUser = 'local'
export function setCurrentUser(name: string) {
  currentUser = name
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const listeners = new Set<() => void>()
/** Called after every local write so sync can be scheduled. */
export function onLocalWrite(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function queue(table: TableName, id: string, at: number) {
  await db.outbox.put({ key: `${table}:${id}`, table, id, at })
}

/** Create a new record. */
export async function add<K extends TableName>(table: K, draft: Draft<Tables[K]>): Promise<Tables[K]> {
  const now = Date.now()
  const rec = { ...draft, id: draft.id ?? uuid(), createdAt: now, updatedAt: now, updatedBy: currentUser } as Tables[K]
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await tbl(table).put(rec as never)
    await queue(table, rec.id, now)
  })
  listeners.forEach((l) => l())
  return rec
}

/** Merge changes into an existing record. */
export async function update<K extends TableName>(table: K, id: string, changes: Partial<Tables[K]>) {
  const now = Date.now()
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    const cur = await tbl(table).get(id)
    if (!cur) throw new Error(`${table} ${id} not found`)
    await tbl(table).put({ ...cur, ...changes, id, updatedAt: now, updatedBy: currentUser } as never)
    await queue(table, id, now)
  })
  listeners.forEach((l) => l())
}

/** Soft delete: the record is kept (and synced) but hidden. */
export function remove(table: TableName, id: string) {
  return update(table, id, { deleted: true } as Partial<Base>)
}

/** Run several writes in one local transaction. */
export async function batch(fn: () => Promise<void>) {
  await db.transaction('rw', [...TABLE_NAMES.map((t) => db.table(t)), db.outbox], fn)
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key)
  return m ? (m.value as T) : fallback
}
export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value })
}

/** Default vaccines. Fixed ids so two phones seeding offline don't create duplicates. */
export const DEFAULT_VACCINES: Array<Omit<VaccineType, 'createdAt' | 'updatedAt'>> = [
  { id: 'vt-ppr', name: 'PPR', species: 'both', intervalDays: 365, minAgeDays: 90, builtin: true },
  { id: 'vt-et', name: 'Enterotoxaemia (ET)', species: 'both', intervalDays: 182, minAgeDays: 60, builtin: true },
  { id: 'vt-fmd', name: 'FMD', species: 'both', intervalDays: 182, minAgeDays: 90, builtin: true },
  { id: 'vt-hs', name: 'HS', species: 'both', intervalDays: 365, minAgeDays: 90, builtin: true, note: 'before_monsoon' },
  { id: 'vt-goatpox', name: 'Goat pox', species: 'goat', intervalDays: 365, minAgeDays: 90, builtin: true },
  { id: 'vt-sheeppox', name: 'Sheep pox', species: 'sheep', intervalDays: 365, minAgeDays: 90, builtin: true },
]

export async function seedDefaults() {
  const existing = await db.table('vaccineTypes').bulkGet(DEFAULT_VACCINES.map((v) => v.id))
  const missing = DEFAULT_VACCINES.filter((_, i) => !existing[i])
  if (!missing.length) return
  // Seeded with updatedAt 0 so any edit synced from the server wins; not queued for upload.
  await db.table('vaccineTypes').bulkPut(missing.map((v) => ({ ...v, createdAt: 0, updatedAt: 0 })))
}
