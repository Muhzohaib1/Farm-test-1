// The daily notification: who should get one now, and what it says.
// Pure functions, shared by the server job and the tests.
import { DEFAULT_VACCINES } from '../db/defaults'
import { TABLE_NAMES, type Animal, type TableName } from '../db/types'
import { translate, type Lang } from '../i18n/translate'
import type { Alert } from './alerts'
import { alertText } from './alertText'
import { buildData, type FarmData, type RawData } from './data'

export interface PushSubscriptionRow {
  endpoint: string
  email: string
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  tz: string
  hour: number
  lang: Lang
  last_sent: string | null
}

/** Local date and hour in a time zone (e.g. "Europe/London"). */
export function localParts(nowMs: number, tz: string): { date: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(nowMs)
  } catch {
    return localParts(nowMs, 'Asia/Karachi') // unknown zone: use the farm's
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

/** Hours after the chosen time in which a missed run can still send that day's summary. */
const CATCH_UP_HOURS = 3

/** Subscriptions whose chosen local hour has arrived and that haven't had today's summary. */
export function dueSubscriptions(subs: PushSubscriptionRow[], nowMs: number): PushSubscriptionRow[] {
  return subs.filter((s) => {
    const { date, hour } = localParts(nowMs, s.tz)
    return hour >= s.hour && hour < s.hour + CATCH_UP_HOURS && s.last_sent !== date
  })
}

export interface RecordRow {
  tbl: string
  id: string
  data: Record<string, unknown>
  deleted: boolean
}

/** Rebuild the farm's data from the server's `records` table. */
export function rowsToData(rows: RecordRow[]): FarmData {
  const names = TABLE_NAMES.filter((n): n is Exclude<TableName, 'photos'> => n !== 'photos')
  const raw = Object.fromEntries(names.map((n) => [n, [] as unknown[]])) as unknown as RawData
  const known = new Set<string>(names)
  for (const r of rows) {
    if (!known.has(r.tbl)) continue
    ;(raw[r.tbl as keyof RawData] as unknown[]).push({ ...r.data, deleted: r.deleted })
  }
  // Built-in vaccines live on each phone and only reach the server once edited.
  for (const v of DEFAULT_VACCINES) {
    if (!raw.vaccineTypes.some((x) => x.id === v.id)) raw.vaccineTypes.push({ ...v, createdAt: 0, updatedAt: 0 })
  }
  return buildData(raw, raw.animals as Animal[])
}

const MAX_LINES = 4

/** Notification title and body, or null when nothing needs attention. */
export function digestMessage(alerts: Alert[], lang: Lang): { title: string; body: string; url: string } | null {
  if (!alerts.length) return null
  const t = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate(lang, k, p)
  const lines = alerts.slice(0, MAX_LINES).map((a) => `• ${alertText(t, a)}`)
  if (alerts.length > MAX_LINES) lines.push(t('push_more', { n: alerts.length - MAX_LINES }))
  return { title: t('push_title', { n: alerts.length }), body: lines.join('\n'), url: './#/' }
}
