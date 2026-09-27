import { db, getMeta, onLocalWrite, setMeta, tbl, type OutboxEntry } from '../db/db'
import { TABLE_NAMES, type Base, type TableName } from '../db/types'
import { refreshRole } from '../auth/session'
import { supabase } from './supabase'

export type SyncState = 'local' | 'offline' | 'syncing' | 'ok' | 'error'
export interface SyncStatus {
  state: SyncState
  pending: number
  lastSync?: number
}

let status: SyncStatus = { state: 'local', pending: 0 }
const subs = new Set<() => void>()

function set(s: Partial<SyncStatus>) {
  status = { ...status, ...s }
  subs.forEach((f) => f())
}
export const syncStore = {
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
  get: () => status,
}

async function refreshPending() {
  set({ pending: await db.outbox.count() })
}

interface RemoteRow {
  tbl: string
  id: string
  data: Base
  updated_at: number
  deleted: boolean
  seq: number
}

const MAX_BATCH_BYTES = 900_000
/** Re-read this many sequence numbers each pull, in case a slow upload committed out of order. */
const SEQ_OVERLAP = 200

async function push() {
  const sb = supabase()!
  const entries = await db.outbox.orderBy('at').toArray()
  let batchRows: object[] = []
  let batchEntries: OutboxEntry[] = []
  let bytes = 0

  const flush = async () => {
    if (!batchRows.length) return
    const { error } = await sb.rpc('push_records', { rows: batchRows })
    if (error) throw error
    // Remove from outbox unless the record changed again while uploading.
    await db.transaction('rw', db.outbox, async () => {
      for (const e of batchEntries) {
        const cur = await db.outbox.get(e.key)
        if (cur && cur.at === e.at) await db.outbox.delete(e.key)
      }
    })
    batchRows = []
    batchEntries = []
    bytes = 0
    await refreshPending()
  }

  for (const e of entries) {
    const rec = (await tbl(e.table).get(e.id)) as Base | undefined
    if (!rec) {
      await db.outbox.delete(e.key)
      continue
    }
    const row = { tbl: e.table, id: e.id, data: rec, updated_at: rec.updatedAt, deleted: !!rec.deleted }
    const size = JSON.stringify(row).length
    if (bytes + size > MAX_BATCH_BYTES) await flush()
    batchRows.push(row)
    batchEntries.push(e)
    bytes += size
  }
  await flush()
}

async function pull() {
  const sb = supabase()!
  let since = await getMeta<number>('lastSeq', 0)
  const known = new Set<string>(TABLE_NAMES)
  for (;;) {
    const { data, error } = await sb
      .from('records')
      .select('tbl,id,data,updated_at,deleted,seq')
      .gt('seq', Math.max(0, since - SEQ_OVERLAP))
      .order('seq')
      .limit(500)
    if (error) throw error
    const rows = (data ?? []) as RemoteRow[]
    const fresh = rows.filter((r) => r.seq > since)
    if (!fresh.length) break

    const byTable = new Map<TableName, RemoteRow[]>()
    for (const r of rows) {
      if (!known.has(r.tbl)) continue
      const list = byTable.get(r.tbl as TableName) ?? []
      list.push(r)
      byTable.set(r.tbl as TableName, list)
    }
    await db.transaction('rw', [...TABLE_NAMES.map((t) => db.table(t)), db.meta], async () => {
      for (const [t, list] of byTable) {
        const locals = await tbl(t).bulkGet(list.map((r) => r.id))
        const puts: Base[] = []
        list.forEach((r, i) => {
          const local = locals[i] as Base | undefined
          if (local && local.updatedAt > r.updated_at) return // our newer change is waiting to upload
          if (local && local.updatedAt === r.updated_at && !!local.deleted === r.deleted) return
          puts.push({ ...r.data, deleted: r.deleted })
        })
        if (puts.length) await db.table(t).bulkPut(puts)
      }
      since = Math.max(since, ...rows.map((r) => r.seq))
      await setMeta('lastSeq', since)
    })
    if (rows.length < 500) break
  }
}

let running: Promise<void> | null = null

export function syncNow(): Promise<void> {
  if (running) return running
  running = (async () => {
    await refreshPending()
    const sb = supabase()
    if (!sb) return set({ state: 'local' })
    const { data } = await sb.auth.getSession()
    if (!data.session) return set({ state: 'local' })
    if (!navigator.onLine) return set({ state: 'offline' })
    set({ state: 'syncing' })
    try {
      await push()
      await pull()
      await refreshRole()
      set({ state: 'ok', lastSync: Date.now() })
    } catch (e) {
      console.warn('sync failed', e)
      set({ state: navigator.onLine ? 'error' : 'offline' })
    }
  })().finally(() => {
    running = null
  })
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
function soon(ms = 4000) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

let started = false
export function startSync() {
  if (started) return
  started = true
  onLocalWrite(() => {
    void refreshPending()
    soon()
  })
  window.addEventListener('online', () => soon(500))
  window.addEventListener('offline', () => set({ state: supabase() ? 'offline' : 'local' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon(500)
  })
  setInterval(() => void syncNow(), 60_000)
  void syncNow()
}
