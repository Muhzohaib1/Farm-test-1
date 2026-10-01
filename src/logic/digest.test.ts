import { describe, expect, it, vi } from 'vitest'
import { digestMessage, dueSubscriptions, localParts, rowsToData, type PushSubscriptionRow } from './digest'
import { computeAlerts } from './alerts'

// 2026-10-02 07:00 UTC = 08:00 London (BST), 11:00 Dubai, 12:00 Karachi
const T = Date.UTC(2026, 9, 2, 7, 0)

const sub = (tz: string, hour = 8, last_sent: string | null = null): PushSubscriptionRow => ({
  endpoint: `https://push.example/${tz}`,
  email: 'a@b.c',
  subscription: { endpoint: `https://push.example/${tz}`, keys: { p256dh: 'x', auth: 'y' } },
  tz,
  hour,
  lang: 'en',
  last_sent,
})

const rows = [
  { tbl: 'animals', id: 'a1', deleted: false, data: { id: 'a1', tag: 'D-01', species: 'goat', sex: 'F', breed: 'beetal', source: 'born', status: 'on_farm', dob: '2023-01-01', createdAt: 1, updatedAt: 1 } },
  { tbl: 'animals', id: 'a2', deleted: true, data: { id: 'a2', tag: 'D-02', species: 'goat', sex: 'F', breed: 'beetal', source: 'born', status: 'on_farm', dob: '2023-01-01', createdAt: 1, updatedAt: 1 } },
  { tbl: 'unknown', id: 'x', deleted: false, data: {} },
]

describe('daily notification timing', () => {
  it('reads local time in each family member’s zone', () => {
    expect(localParts(T, 'Europe/London')).toEqual({ date: '2026-10-02', hour: 8 })
    expect(localParts(T, 'Asia/Dubai')).toEqual({ date: '2026-10-02', hour: 11 })
    expect(localParts(T, 'Asia/Karachi')).toEqual({ date: '2026-10-02', hour: 12 })
    expect(localParts(T, 'Not/AZone').hour).toBe(12) // falls back to the farm's time
  })
  it('sends at 8 am local time, once a day, with a short catch-up window', () => {
    expect(dueSubscriptions([sub('Europe/London')], T)).toHaveLength(1)
    expect(dueSubscriptions([sub('Europe/London', 8, '2026-10-02')], T)).toHaveLength(0) // already sent today
    expect(dueSubscriptions([sub('Europe/London')], Date.UTC(2026, 9, 2, 9, 0))).toHaveLength(1) // 10:00, a missed run catches up
    expect(dueSubscriptions([sub('Asia/Dubai')], T)).toHaveLength(0) // 11:00, too late; tomorrow instead
    expect(dueSubscriptions([sub('Asia/Karachi')], T)).toHaveLength(0) // 12:00, too late; tomorrow instead
    expect(dueSubscriptions([sub('Asia/Karachi')], Date.UTC(2026, 9, 2, 3, 0))).toHaveLength(1) // 08:00 Karachi
    expect(dueSubscriptions([sub('Europe/London')], Date.UTC(2026, 9, 2, 5, 0))).toHaveLength(0) // 06:00 London
  })
})

describe('daily notification content', () => {
  it('rebuilds farm data from server rows, with the built-in vaccines', () => {
    const data = rowsToData(rows)
    expect(data.animals.map((a) => a.tag)).toEqual(['D-01'])
    expect(data.allAnimals).toHaveLength(2) // deleted kept so tags are never reused
    expect(data.vaccineTypes.map((v) => v.id)).toContain('vt-ppr')
  })
  it('writes a short summary in the chosen language', () => {
    const alerts = computeAlerts(rowsToData(rows), '2026-10-02')
    expect(alerts.length).toBeGreaterThan(4)
    const en = digestMessage(alerts, 'en')!
    expect(en.title).toBe(`Mir Farm: ${alerts.length} things need attention`)
    expect(en.body.split('\n')).toHaveLength(5) // 4 lines + "and N more"
    expect(en.body).toContain('…and')
    const ur = digestMessage(alerts, 'ur')!
    expect(ur.title).toContain('میر فارم')
    expect(digestMessage([], 'en')).toBeNull()
  })
})

describe('server job', () => {
  it('sends due notifications, records them, and removes dead phones', async () => {
    const db = {
      app_config: [] as Array<{ key: string; value: string }>,
      push_subscriptions: [
        { ...sub('Europe/London'), email: 'uk@x' },
        { ...sub('Asia/Karachi', 12), endpoint: 'gone', subscription: { endpoint: 'gone', keys: { p256dh: 'x', auth: 'y' } }, email: 'pk@x' },
        { ...sub('Asia/Dubai'), endpoint: 'later', email: 'ae@x', hour: 20 },
      ] as Array<Record<string, unknown>>,
      records: rows.map((r, i) => ({ ...r, seq: i + 1 })) as Array<Record<string, unknown>>,
    }
    const table = (name: keyof typeof db) => {
      const q: Record<string, unknown> & PromiseLike<{ data: unknown; error: null }> = {
        _rows: db[name],
        select: () => q,
        in: (_c: string, vals: string[]) => ((q._rows = db[name].filter((r) => vals.includes(r.key as string))), q),
        neq: (c: string, v: unknown) => ((q._rows = (q._rows as Array<Record<string, unknown>>).filter((r) => r[c] !== v)), q),
        order: () => q,
        range: () => q,
        upsert: async (rs: Array<{ key: string; value: string }>) => (db.app_config.push(...rs), { error: null }),
        update: (patch: Record<string, unknown>) => ({ eq: async (c: string, v: unknown) => (db[name].filter((r) => r[c] === v).forEach((r) => Object.assign(r, patch)), { error: null }) }),
        delete: () => ({ eq: async (c: string, v: unknown) => ((db[name] = db[name].filter((r) => r[c] !== v) as never), { error: null }) }),
        then: (res) => Promise.resolve({ data: q._rows, error: null }).then(res),
      }
      return q
    }
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ from: table }) }))
    const sent: string[] = []
    const webpush = (await import('web-push')).default
    vi.spyOn(webpush, 'sendNotification').mockImplementation(async (s: { endpoint: string }, payload?: string | Buffer | null) => {
      if (s.endpoint === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 })
      sent.push(`${s.endpoint} ${JSON.parse(String(payload)).title}`)
      return { statusCode: 201, body: '', headers: {} }
    })
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 2, 7, 0), toFake: ['Date'] })
    process.env.VITE_SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret'

    const job = (await import('../../netlify/functions/daily-digest.mts')).default
    await job()

    expect(db.app_config.map((r) => r.key).sort()).toEqual(['vapid_private', 'vapid_public']) // keys created on first run
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatch(/^https:\/\/push.example\/Europe\/London Mir Farm: \d+ things need attention$/)
    expect(db.push_subscriptions.find((s) => s.email === 'uk@x')?.last_sent).toBe('2026-10-02')
    expect(db.push_subscriptions.map((s) => s.email)).toEqual(['uk@x', 'ae@x']) // uninstalled phone removed; Dubai not due yet
    vi.useRealTimers()
  })
})
