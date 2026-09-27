import { beforeEach, describe, expect, it, vi } from 'vitest'

// A tiny in-memory stand-in for the Supabase `records` table and push_records().
interface Row { tbl: string; id: string; data: Record<string, unknown>; updated_at: number; deleted: boolean; seq: number }
const server = { rows: new Map<string, Row>(), seq: 0 }

function query() {
  let gt = 0
  let lim = 1000
  const q = {
    select: () => q,
    gt: (_c: string, v: number) => ((gt = v), q),
    order: () => q,
    limit: (n: number) => ((lim = n), q),
    then: (resolve: (r: { data: Row[]; error: null }) => void) =>
      resolve({ data: [...server.rows.values()].filter((r) => r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, lim), error: null }),
  }
  return q
}

const fakeClient = {
  auth: { getSession: async () => ({ data: { session: { user: {} } } }) },
  rpc: async (_fn: string, { rows }: { rows: Omit<Row, 'seq'>[] }) => {
    for (const r of rows) {
      const key = `${r.tbl}:${r.id}`
      const cur = server.rows.get(key)
      if (!cur || cur.updated_at <= r.updated_at) server.rows.set(key, { ...r, seq: ++server.seq })
    }
    return { error: null }
  },
  from: () => query(),
}

vi.mock('./supabase', () => ({ supabase: () => fakeClient }))

const { db, add, update, tbl } = await import('../db/db')
const { syncNow, syncStore } = await import('./sync')

Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })

async function wipePhone() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

describe('sync', () => {
  beforeEach(async () => {
    server.rows.clear()
    server.seq = 0
    await wipePhone()
  })

  it('uploads queued changes and empties the outbox', async () => {
    await add('expenses', { date: '2026-09-01', category: 'feed', amount: 5000 })
    expect(await db.outbox.count()).toBe(1)
    await syncNow()
    expect(syncStore.get().state).toBe('ok')
    expect(await db.outbox.count()).toBe(0)
    expect(server.rows.size).toBe(1)
  })

  it('a second phone downloads everything', async () => {
    const a = await add('animals', { tag: 'D-01', species: 'goat', sex: 'F', breed: 'beetal', source: 'bought', status: 'on_farm' })
    await syncNow()
    await wipePhone() // pretend this is a different phone
    await syncNow()
    expect((await tbl('animals').get(a.id))?.tag).toBe('D-01')
    expect(await db.outbox.count()).toBe(0)
  })

  it('newer local edit is not overwritten by an older server copy', async () => {
    const a = await add('animals', { tag: 'D-02', species: 'goat', sex: 'F', breed: 'beetal', source: 'born', status: 'on_farm' })
    await syncNow()
    // Server gets an older edit from another phone
    const key = `animals:${a.id}`
    const cur = server.rows.get(key)!
    server.rows.set(key, { ...cur, data: { ...cur.data, notes: 'old' }, updated_at: cur.updated_at - 1, seq: ++server.seq })
    await new Promise((r) => setTimeout(r, 2))
    await update('animals', a.id, { notes: 'new' })
    await syncNow()
    expect((await tbl('animals').get(a.id))?.notes).toBe('new')
    expect(server.rows.get(key)!.data.notes).toBe('new')
  })

  it('deletes sync as a flag', async () => {
    const e = await add('expenses', { date: '2026-09-01', category: 'vet', amount: 100 })
    await syncNow()
    await update('expenses', e.id, { deleted: true })
    await syncNow()
    expect(server.rows.get(`expenses:${e.id}`)!.deleted).toBe(true)
  })
})
