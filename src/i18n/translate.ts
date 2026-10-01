import { en, type Key } from './en'
import { ur } from './ur'

export type Lang = 'en' | 'ur'
export type T = (key: Key, params?: Record<string, string | number>) => string

const dicts = { en, ur }

export function translate(lang: Lang, key: Key, params?: Record<string, string | number>) {
  let s: string = dicts[lang][key] ?? en[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}
