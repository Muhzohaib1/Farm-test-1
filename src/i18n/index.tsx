import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Key } from './en'
import { translate, type Lang, type T } from './translate'

export type { Lang, T }
export { translate }

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: T
}

const Ctx = createContext<I18n | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'ur' ? 'ur' : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('lang', l)
    } catch {
      /* private mode: language just won't be remembered */
    }
  }, [])
  const t = useCallback<T>((key, params) => translate(lang, key, params), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const c = useContext(Ctx)
  if (!c) throw new Error('I18nProvider missing')
  return c
}

export type { Key }
