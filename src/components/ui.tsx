import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Animal, ISODate } from '../db/types'
import { useI18n, type Key } from '../i18n'
import { addDays, fmtDate, today } from '../lib/dates'
import { kindName, sexIcon, speciesIcon } from '../lib/format'
import { compareTags } from '../lib/tags'

/* ---------- page shell ---------- */

export function Page({ title, children, back = true, action }: { title: string; children: ReactNode; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate()
  const { lang } = useI18n()
  return (
    <div className="page">
      <header className="topbar">
        {back && (
          <button className="icon-btn" onClick={() => nav(-1)} aria-label="back">
            {lang === 'ur' ? '→' : '←'}
          </button>
        )}
        <h1>{title}</h1>
        {action}
      </header>
      <main className="content">{children}</main>
    </div>
  )
}

export function Card({ children, title, className = '' }: { children: ReactNode; title?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h2 className="card-title">{title}</h2>}
      {children}
    </section>
  )
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n()
  return <p className="empty">{children ?? t('no_records')}</p>
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost'
export function Btn({
  children, onClick, kind = 'primary', disabled, type = 'button', block = true,
}: { children: ReactNode; onClick?: () => void; kind?: BtnKind; disabled?: boolean; type?: 'button' | 'submit'; block?: boolean }) {
  return (
    <button type={type} className={`btn btn-${kind}${block ? ' btn-block' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/* ---------- toast ---------- */

let toastMsg: { text: string; id: number } | null = null
const toastSubs = new Set<() => void>()
export function toast(text: string) {
  toastMsg = { text, id: Date.now() }
  toastSubs.forEach((f) => f())
  setTimeout(() => {
    if (toastMsg && Date.now() - toastMsg.id >= 2400) {
      toastMsg = null
      toastSubs.forEach((f) => f())
    }
  }, 2500)
}
export function Toast() {
  const m = useSyncExternalStore(
    (f) => {
      toastSubs.add(f)
      return () => {
        toastSubs.delete(f)
      }
    },
    () => toastMsg,
  )
  return m ? <div className="toast" role="status">{m.text}</div> : null
}

/* ---------- form fields ---------- */

/** A field label with a red star, for fields that must be filled before saving. */
export function Req({ children }: { children: ReactNode }) {
  return (
    <>
      {children} <span className="req" aria-label="required">✱</span>
    </>
  )
}

export function Field({ label, children, hint, error }: { label: ReactNode; children: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export function TextIn({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
}

/** Number input that opens the phone's number pad. Empty string = no value. */
export function NumIn({ value, onChange, decimal = false, placeholder }: { value: string; onChange: (v: string) => void; decimal?: boolean; placeholder?: string }) {
  return (
    <input
      className="input num"
      inputMode={decimal ? 'decimal' : 'numeric'}
      pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.')
        if (v === '' || (decimal ? /^\d*\.?\d*$/ : /^\d*$/).test(v)) onChange(v)
      }}
    />
  )
}

export const toNum = (s: string): number | undefined => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s))

/** Large buttons for picking one option. */
export function Choice<V extends string | number>({
  value, onChange, options, cols = 2,
}: { value: V | undefined; onChange: (v: V) => void; options: Array<{ value: V; label: ReactNode }>; cols?: number }) {
  return (
    <div className="choice" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`choice-btn${o.value === value ? ' on' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<V extends string>({
  value, onChange, options, placeholder,
}: { value: V | ''; onChange: (v: V) => void; options: Array<{ value: V; label: string }>; placeholder?: string }) {
  const { t } = useI18n()
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as V)}>
      <option value="" disabled>
        {placeholder ?? t('select')}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" className={`toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="toggle-box">{checked ? '✓' : ''}</span>
      <span>{label}</span>
    </button>
  )
}

/** Date picker that always shows DD/MM/YYYY, with Today / Yesterday shortcuts. */
export function DateField({ label, value, onChange, max }: { label: ReactNode; value: ISODate; onChange: (v: ISODate) => void; max?: ISODate }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  const td = today()
  const open = () => {
    const el = ref.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="date-row">
        <button type="button" className="input date-btn" onClick={open}>
          📅 {value ? fmtDate(value) : '—'}
        </button>
        <input
          ref={ref}
          className="date-hidden"
          type="date"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
        />
      </div>
      <div className="chips">
        <button type="button" className={`chip${value === td ? ' on' : ''}`} onClick={() => onChange(td)}>
          {t('today')}
        </button>
        <button type="button" className={`chip${value === addDays(td, -1) ? ' on' : ''}`} onClick={() => onChange(addDays(td, -1))}>
          {t('yesterday')}
        </button>
      </div>
    </div>
  )
}

/* ---------- animals ---------- */

export function AnimalBadge({ a, sub }: { a: Animal; sub?: ReactNode }) {
  const { t } = useI18n()
  return (
    <span className="animal-badge">
      <span className="animal-icon">{speciesIcon(a.species)}</span>
      <span>
        <b className="tag-text">{a.tag}</b> <span className="muted">{sexIcon(a.sex)} {kindName(t, a)}</span>
        {sub && <span className="sub">{sub}</span>}
      </span>
    </span>
  )
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="modal" role="dialog" aria-modal>
      <header className="topbar">
        <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        <h1>{title}</h1>
      </header>
      <div className="modal-body">{children}</div>
    </div>
  )
}

function useFiltered(animals: Animal[], q: string) {
  return useMemo(() => {
    const s = q.trim().toUpperCase()
    return animals.filter((a) => !s || a.tag.toUpperCase().includes(s)).sort((a, b) => compareTags(a.tag, b.tag))
  }, [animals, q])
}

/** Tap to open a searchable list and pick one animal. */
export function AnimalPicker({
  label, animals, value, onChange, allowNone = false,
}: { label: ReactNode; animals: Animal[]; value: string | undefined; onChange: (id: string | undefined) => void; allowNone?: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const list = useFiltered(animals, q)
  const sel = animals.find((a) => a.id === value)
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button type="button" className="input picker-btn" onClick={() => setOpen(true)}>
        {sel ? <AnimalBadge a={sel} /> : <span className="muted">{t('select_animal')}</span>}
      </button>
      {open && (
        <Modal title={typeof label === 'string' ? label : t('select_animal')} onClose={() => setOpen(false)}>
          <input className="input search" autoFocus placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          {allowNone && (
            <button className="list-row" onClick={() => { onChange(undefined); setOpen(false) }}>
              <span className="muted">{t('unknown')}</span>
            </button>
          )}
          {list.map((a) => (
            <button key={a.id} className={`list-row${a.id === value ? ' on' : ''}`} onClick={() => { onChange(a.id); setOpen(false) }}>
              <AnimalBadge a={a} />
            </button>
          ))}
          {!list.length && <Empty />}
        </Modal>
      )}
    </div>
  )
}

/** "Whole herd" or tick individual animals. */
export function HerdPicker({
  animals, whole, onWhole, selected, onSelected, allowWhole = true,
}: {
  animals: Animal[]
  whole: boolean
  onWhole: (v: boolean) => void
  selected: string[]
  onSelected: (ids: string[]) => void
  allowWhole?: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const list = useFiltered(animals, q)
  const set = new Set(selected)
  const toggle = (id: string) => onSelected(set.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="field">
      {allowWhole && (
        <Choice
          value={whole ? 'w' : 's'}
          onChange={(v) => onWhole(v === 'w')}
          options={[
            { value: 'w', label: `${t('whole_herd')} (${animals.length})` },
            { value: 's', label: t('selected_animals') },
          ]}
        />
      )}
      {!whole && (
        <button type="button" className="input picker-btn" onClick={() => setOpen(true)}>
          {selected.length ? (
            <span>
              <b>{t('n_selected', { n: selected.length })}</b>
              <span className="sub">
                {animals.filter((a) => set.has(a.id)).map((a) => a.tag).sort(compareTags).join(', ')}
              </span>
            </span>
          ) : (
            <span className="muted">{t('select_animals')}</span>
          )}
        </button>
      )}
      {open && (
        <Modal title={t('select_animals')} onClose={() => setOpen(false)}>
          <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row-actions">
            <Btn kind="secondary" block={false} onClick={() => onSelected(Array.from(new Set([...selected, ...list.map((a) => a.id)])))}>
              ✓ {t('all')}
            </Btn>
            <Btn kind="secondary" block={false} onClick={() => onSelected([])}>
              {t('none')}
            </Btn>
          </div>
          {list.map((a) => (
            <button key={a.id} className={`list-row check${set.has(a.id) ? ' on' : ''}`} onClick={() => toggle(a.id)}>
              <span className="toggle-box">{set.has(a.id) ? '✓' : ''}</span>
              <AnimalBadge a={a} />
            </button>
          ))}
          <div className="sticky-bottom">
            <Btn onClick={() => setOpen(false)}>
              {t('done')} ({selected.length})
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

export function Warning({ children, level = 'red' }: { children: ReactNode; level?: 'red' | 'amber' }) {
  return (
    <div className={`warning warning-${level}`} role="alert">
      <span className="warning-icon">⚠</span>
      <div>{children}</div>
    </div>
  )
}

export function Labelled({ k, children }: { k: Key; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="kv">
      <span className="muted">{t(k)}</span>
      <span>{children}</span>
    </div>
  )
}
