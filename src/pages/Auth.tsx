import { useState } from 'react'
import { getProfile, hashPin, saveProfile, setUnlocked, signIn, signOut, useSession } from '../auth/session'
import { Btn, Field, TextIn } from '../components/ui'
import { useI18n } from '../i18n'
import { getConfig, saveConfig } from '../sync/supabase'
import { installApp, useCanInstall } from '../lib/install'
import logo from '../assets/logo.png'

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-switch">
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
      <button className={lang === 'ur' ? 'on' : ''} onClick={() => setLang('ur')}>اردو</button>
    </div>
  )
}

/** Big one-tap install button, shown only when Chrome allows installing. */
export function InstallButton() {
  const { t } = useI18n()
  const can = useCanInstall()
  if (!can) return null
  return (
    <Btn kind="secondary" onClick={() => void installApp()}>
      📲 {t('install_app')}
    </Btn>
  )
}

export function PinPad({ title, error, onDone }: { title: string; error?: string; onDone: (pin: string) => void }) {
  const [pin, setPin] = useState('')
  const press = (d: string) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      setTimeout(() => {
        setPin('')
        onDone(next)
      }, 150)
    }
  }
  return (
    <div className="pinpad">
      <h2>{title}</h2>
      <div className="pin-dots" dir="ltr">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <p className="field-error" style={{ minHeight: '1.6em' }}>{error}</p>
      <div className="pin-keys" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="delete">⌫</button>
      </div>
    </div>
  )
}

/** Choose (and confirm) a new PIN. */
export function SetPin({ onSet }: { onSet: (hash: string) => void }) {
  const { t } = useI18n()
  const [first, setFirst] = useState<string | null>(null)
  const [err, setErr] = useState('')
  return (
    <PinPad
      title={first === null ? t('set_pin') : t('confirm_pin')}
      error={err}
      onDone={async (p) => {
        if (first === null) {
          setFirst(p)
          setErr('')
        } else if (p === first) {
          onSet(await hashPin(p))
        } else {
          setFirst(null)
          setErr(t('pin_mismatch'))
        }
      }}
    />
  )
}

export function Setup() {
  const { t } = useI18n()
  const { profile } = useSession()
  const cfg = getConfig()
  const [online, setOnline] = useState(!!(cfg.url && cfg.key))
  const [showCfg, setShowCfg] = useState(false)
  const [url, setUrl] = useState(cfg.url)
  const [key, setKey] = useState(cfg.key)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (profile && !profile.pinHash) {
    return (
      <div className="auth">
        <LangSwitch />
        <SetPin
          onSet={(h) => {
            saveProfile({ ...getProfile()!, pinHash: h })
            setUnlocked(true)
          }}
        />
      </div>
    )
  }

  const doSignIn = async () => {
    setBusy(true)
    setErr('')
    const r = await signIn(email, password)
    setBusy(false)
    if (r === 'failed') setErr(t('sign_in_failed'))
    if (r === 'not_member') setErr(t('not_member'))
    if (r === 'offline') setErr(t('need_internet'))
  }

  return (
    <div className="auth">
      <LangSwitch />
      <img className="auth-logo" src={logo} alt="" />
      <h1 className="auth-title">{t('app_name')}</h1>
      <p className="muted center">{t('app_tagline')}</p>
      <InstallButton />

      {online ? (
        <div className="card">
          <p className="muted">{t('sign_in_help')}</p>
          <Field label={t('email')}>
            <TextIn type="email" value={email} onChange={setEmail} />
          </Field>
          <Field label={t('password')}>
            <TextIn type="password" value={password} onChange={setPassword} />
          </Field>
          {err && <p className="field-error">{err}</p>}
          <Btn onClick={doSignIn} disabled={busy || !email || !password}>{busy ? '…' : t('sign_in')}</Btn>
          <Btn kind="ghost" onClick={() => setOnline(false)}>{t('use_offline')}</Btn>
        </div>
      ) : (
        <div className="card">
          <Field label={t('your_name')}>
            <TextIn value={name} onChange={setName} />
          </Field>
          <Btn disabled={!name.trim()} onClick={() => saveProfile({ name: name.trim(), role: 'owner', mode: 'local' })}>
            {t('next')}
          </Btn>
          <Btn kind="ghost" onClick={() => setShowCfg((s) => !s)}>{t('sync_settings')}</Btn>
          {showCfg && (
            <>
              <p className="muted">{t('sync_help')}</p>
              <Field label={t('supabase_url')}>
                <TextIn value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" />
              </Field>
              <Field label={t('supabase_key')}>
                <TextIn value={key} onChange={setKey} />
              </Field>
              <Btn
                kind="secondary"
                disabled={!url || !key}
                onClick={() => {
                  saveConfig(url, key)
                  setOnline(true)
                  setShowCfg(false)
                }}
              >
                {t('save')}
              </Btn>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function Lock() {
  const { t } = useI18n()
  const { profile } = useSession()
  const [err, setErr] = useState('')
  return (
    <div className="auth">
      <LangSwitch />
      <img className="auth-logo" src={logo} alt="" />
      <p className="center">{profile?.name}</p>
      <PinPad
        title={t('enter_pin')}
        error={err}
        onDone={async (p) => {
          if ((await hashPin(p)) === profile?.pinHash) setUnlocked(true)
          else setErr(t('wrong_pin'))
        }}
      />
      <Btn kind="ghost" onClick={() => void signOut()}>{t('forgot_pin')}</Btn>
    </div>
  )
}
