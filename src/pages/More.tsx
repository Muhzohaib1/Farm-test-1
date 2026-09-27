import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { useRole } from '../auth/role'
import { getProfile, saveProfile, signOut } from '../auth/session'
import { SyncBadge } from '../components/SyncBadge'
import { Btn, Card, Choice, Field, Page, TextIn, toast } from '../components/ui'
import { useFarm } from '../data'
import { useI18n, type Key } from '../i18n'
import { buildSheets, downloadCSV, downloadExcel } from '../lib/export'
import { getConfig, saveConfig, supabase } from '../sync/supabase'
import { syncNow, syncStore } from '../sync/sync'
import { LangSwitch, SetPin } from './Auth'

export function More() {
  const { t } = useI18n()
  const items: Array<{ to: string; icon: string; k: Key }> = [
    { to: '/money', icon: '💰', k: 'money' },
    { to: '/breeding', icon: '🐣', k: 'births_due' },
    { to: '/quarantine', icon: '🚧', k: 'quarantine' },
    { to: '/growth', icon: '📈', k: 'compare_season' },
    { to: '/shearing', icon: '✂️', k: 'shearing' },
    { to: '/health/vaccines', icon: '📋', k: 'vaccine_types' },
    { to: '/export', icon: '⬇️', k: 'export' },
    { to: '/settings', icon: '⚙️', k: 'settings' },
  ]
  return (
    <Page title={t('more_title')} back={false}>
      <LangSwitch />
      <div className="action-grid">
        {items.map((x) => (
          <Link key={x.to} to={x.to} className="action-tile">
            <span className="action-icon">{x.icon}</span>
            {t(x.k)}
          </Link>
        ))}
      </div>
    </Page>
  )
}

export function ExportPage() {
  const { t } = useI18n()
  const data = useFarm()
  const sheets = buildSheets(data)
  const [busy, setBusy] = useState(false)
  return (
    <Page title={t('export')}>
      <p className="muted">{t('export_help')}</p>
      <Btn
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await downloadExcel(sheets)
          } finally {
            setBusy(false)
          }
        }}
      >
        📊 {t('export_excel')}
      </Btn>
      <Card title={t('export_csv')}>
        <div className="list">
          {sheets.map((s) => (
            <button key={s.name} className="list-row" onClick={() => downloadCSV(s)}>
              <span className="grow">{s.name}</span>
              <span className="muted">{s.rows.length}</span>
              <span>⬇️</span>
            </button>
          ))}
        </div>
      </Card>
    </Page>
  )
}

interface Member {
  email: string
  name: string | null
  role: 'owner' | 'manager'
}

function Users() {
  const { t } = useI18n()
  const [list, setList] = useState<Member[] | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'owner' | 'manager'>('manager')
  const [err, setErr] = useState('')
  const load = async () => {
    const sb = supabase()
    if (!sb) return
    const { data, error } = await sb.from('farm_members').select('email,name,role').order('role')
    if (error) setErr(error.message)
    else setList(data as Member[])
  }
  useEffect(() => {
    void load()
  }, [])
  const addUser = async () => {
    const sb = supabase()!
    const { error } = await sb.from('farm_members').upsert({ email: email.trim().toLowerCase(), name: name.trim() || null, role })
    if (error) return setErr(error.message)
    setEmail('')
    setName('')
    toast(t('saved'))
    void load()
  }
  const removeUser = async (m: Member) => {
    if (!confirm(`${t('delete')} ${m.email}?`)) return
    const { error } = await supabase()!.from('farm_members').delete().eq('email', m.email)
    if (error) setErr(error.message)
    void load()
  }
  const me = getProfile()?.email?.toLowerCase()
  return (
    <Card title={t('users')}>
      {err && <p className="field-error">{err}</p>}
      {list === null && !err && <p className="muted">…</p>}
      {list?.map((m) => (
        <div key={m.email} className="list-row">
          <span className="grow">
            <b>{m.name || m.email}</b>
            <span className="sub">{m.email} · {t(`role_${m.role}`)}</span>
          </span>
          {m.email !== me && <Btn kind="ghost" block={false} onClick={() => void removeUser(m)}>✕</Btn>}
        </div>
      ))}
      <p className="muted small">{t('users_help')}</p>
      <Field label={t('user_email')}><TextIn type="email" value={email} onChange={setEmail} /></Field>
      <Field label={t('your_name')}><TextIn value={name} onChange={setName} /></Field>
      <Choice value={role} onChange={setRole} options={[{ value: 'manager', label: t('role_manager') }, { value: 'owner', label: t('role_owner') }]} />
      <Btn kind="secondary" disabled={!email.includes('@')} onClick={() => void addUser()}>＋ {t('add_user')}</Btn>
    </Card>
  )
}

export function SettingsPage() {
  const { t } = useI18n()
  const { isOwner, profile } = useRole()
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get)
  const cfg = getConfig()
  const [url, setUrl] = useState(cfg.url)
  const [key, setKey] = useState(cfg.key)
  const [pinOpen, setPinOpen] = useState(false)
  const online = profile?.mode === 'online'

  return (
    <Page title={t('settings')}>
      <Card title={t('language')}>
        <LangSwitch />
      </Card>
      <Card title={t('sync')}>
        <p>{profile && t('signed_in_as', { n: profile.name, r: t(`role_${profile.role}`) })}</p>
        <SyncBadge />
        {s.lastSync && <p className="muted small">{t('last_sync', { t: new Date(s.lastSync).toLocaleString('en-GB') })}</p>}
        {online && <Btn kind="secondary" onClick={() => void syncNow()}>⟳ {t('sync_now')}</Btn>}
      </Card>
      {isOwner && online && <Users />}
      {isOwner && !online && (
        <Card title={t('sync_settings')}>
          <p className="muted small">{t('sync_help')}</p>
          <Field label={t('supabase_url')}><TextIn value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" /></Field>
          <Field label={t('supabase_key')}><TextIn value={key} onChange={setKey} /></Field>
          <Btn
            kind="secondary"
            onClick={async () => {
              saveConfig(url, key)
              // Switching to online: sign in with the owner's email. Local data stays and uploads after sign in.
              if (url && key) await signOut()
              else toast(t('saved'))
            }}
          >
            {t('save')}
          </Btn>
        </Card>
      )}
      <Card>
        {pinOpen ? (
          <SetPin
            onSet={(h) => {
              saveProfile({ ...getProfile()!, pinHash: h })
              setPinOpen(false)
              toast(t('saved'))
            }}
          />
        ) : (
          <Btn kind="secondary" onClick={() => setPinOpen(true)}>🔢 {t('change_pin')}</Btn>
        )}
        <Btn kind="ghost" onClick={() => void signOut()}>{t('sign_out')}</Btn>
      </Card>
    </Page>
  )
}
