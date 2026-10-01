import { getProfile } from '../auth/session'
import type { Lang } from '../i18n/translate'
import { supabase } from '../sync/supabase'

export const DEFAULT_HOUR = 8
const LS_PREFS = 'push_prefs' // what the server last got: { hour, tz, lang }

export type PushState = 'unsupported' | 'needs_online' | 'denied' | 'off' | 'on'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function phoneTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi'
  } catch {
    return 'Asia/Karachi'
  }
}

function readPrefs(): { hour: number; tz: string; lang: Lang } | null {
  try {
    const s = localStorage.getItem(LS_PREFS)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
function writePrefs(p: { hour: number; tz: string; lang: Lang } | null) {
  try {
    if (p) localStorage.setItem(LS_PREFS, JSON.stringify(p))
    else localStorage.removeItem(LS_PREFS)
  } catch {
    /* ignore */
  }
}

export function savedHour(): number {
  return readPrefs()?.hour ?? DEFAULT_HOUR
}

async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!supabase() || !getProfile()?.email) return 'needs_online'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) && readPrefs() ? 'on' : 'off'
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type TurnOnResult = 'ok' | 'denied' | 'not_ready' | 'failed'

/** Ask permission, subscribe this phone, and tell the server the hour, time zone and language. */
export async function turnOn(hour: number, lang: Lang): Promise<TurnOnResult> {
  const sb = supabase()
  const email = getProfile()?.email?.toLowerCase()
  if (!sb || !email || !pushSupported()) return 'failed'
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  const { data } = await sb.from('app_config').select('value').eq('key', 'vapid_public').maybeSingle()
  if (!data?.value) return 'not_ready'
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.value) }))
    const tz = phoneTimeZone()
    const { error } = await sb.from('push_subscriptions').upsert({ endpoint: sub.endpoint, email, subscription: sub.toJSON(), tz, hour, lang })
    if (error) throw error
    writePrefs({ hour, tz, lang })
    return 'ok'
  } catch (e) {
    console.warn('push subscribe failed', e)
    return 'failed'
  }
}

export async function turnOff() {
  const sub = await currentSubscription()
  if (sub) {
    await supabase()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe().catch(() => undefined)
  }
  writePrefs(null)
}

/** Keep the server's time zone and language in step when the phone travels or the language changes. */
export async function refreshPushPrefs(lang: Lang) {
  const prefs = readPrefs()
  if (!prefs) return
  const tz = phoneTimeZone()
  if (prefs.tz === tz && prefs.lang === lang) return
  const sub = await currentSubscription()
  if (!sub) return writePrefs(null)
  const { error } = await supabase()!.from('push_subscriptions').update({ tz, lang }).eq('endpoint', sub.endpoint)
  if (!error) writePrefs({ ...prefs, tz, lang })
}
