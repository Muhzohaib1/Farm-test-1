import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LS_URL = 'sb_url'
const LS_KEY = 'sb_key'

function ls(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

export function getConfig() {
  return {
    url: ls(LS_URL) || import.meta.env.VITE_SUPABASE_URL || '',
    key: ls(LS_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  }
}

export function saveConfig(url: string, key: string) {
  try {
    localStorage.setItem(LS_URL, url.trim())
    localStorage.setItem(LS_KEY, key.trim())
  } catch {
    /* ignore */
  }
  client = undefined
}

let client: SupabaseClient | null | undefined

/** The Supabase client, or null when online sync isn't configured. */
export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client
  const { url, key } = getConfig()
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null
  return client
}
