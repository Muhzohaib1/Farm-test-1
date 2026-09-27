import { useSyncExternalStore } from 'react'
import { setCurrentUser } from '../db/db'
import { supabase } from '../sync/supabase'

export type Role = 'owner' | 'manager'

export interface Profile {
  name: string
  email?: string
  role: Role
  mode: 'online' | 'local'
  pinHash?: string
}

const KEY = 'profile'
let profile: Profile | null = load()
let unlocked = readUnlocked()
const subs = new Set<() => void>()

function load(): Profile | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as Profile) : null
  } catch {
    return null
  }
}
function readUnlocked() {
  try {
    return sessionStorage.getItem('unlocked') === '1'
  } catch {
    return false
  }
}
function emit() {
  if (profile) setCurrentUser(profile.name)
  subs.forEach((f) => f())
}
if (profile) setCurrentUser(profile.name)

export function saveProfile(p: Profile | null) {
  profile = p
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  emit()
}

export function setUnlocked(v: boolean) {
  unlocked = v
  try {
    if (v) sessionStorage.setItem('unlocked', '1')
    else sessionStorage.removeItem('unlocked')
  } catch {
    /* ignore */
  }
  emit()
}

const store = {
  subscribe(f: () => void) {
    subs.add(f)
    return () => {
      subs.delete(f)
    }
  },
}
let snap = { profile, unlocked }
function getSnap() {
  if (snap.profile !== profile || snap.unlocked !== unlocked) snap = { profile, unlocked }
  return snap
}

export function useSession() {
  return useSyncExternalStore(store.subscribe, getSnap)
}

export function getProfile() {
  return profile
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`rewar:${pin}`)
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback for non-secure contexts (plain http during testing).
  let h = 0
  for (const b of data) h = (Math.imul(31, h) + b) | 0
  return `weak-${h}`
}

export type SignInResult = 'ok' | 'failed' | 'not_member' | 'offline'

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const sb = supabase()
  if (!sb) return 'failed'
  if (!navigator.onLine) return 'offline'
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return 'failed'
  const { data } = await sb.from('farm_members').select('name,role').eq('email', email.trim().toLowerCase()).maybeSingle()
  if (!data) {
    await sb.auth.signOut()
    return 'not_member'
  }
  saveProfile({ name: data.name || email.split('@')[0], email: email.trim(), role: data.role as Role, mode: 'online' })
  return 'ok'
}

/** Keep the cached role in step with the server (the owner may change it). */
export async function refreshRole() {
  const sb = supabase()
  if (!sb || !profile?.email) return
  const { data, error } = await sb.from('farm_members').select('name,role').eq('email', profile.email.toLowerCase()).maybeSingle()
  if (error) return
  if (!data) {
    await signOut()
    return
  }
  if (data.role !== profile.role) saveProfile({ ...profile, role: data.role as Role })
}

export async function signOut() {
  const sb = supabase()
  if (sb) await sb.auth.signOut().catch(() => undefined)
  saveProfile(null)
  setUnlocked(false)
}
