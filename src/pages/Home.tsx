import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { SyncBadge } from '../components/SyncBadge'
import { LineChart, SERIES, SplitBar } from '../components/charts'
import { Card } from '../components/ui'
import { useFarm } from '../data'
import { useI18n, type Key, type T } from '../i18n'
import { computeAlerts, type Alert } from '../logic/alerts'
import { headcount, herdOverTime, last12Months } from '../logic/stats'
import { today } from '../lib/dates'
import logo from '../assets/logo.png'

const AGE_COLORS = ['#86b6ef', '#3987e5', '#1c5cab', '#c3c2b7'] // sequential blue (young → adult), grey = unknown

export function alertText(t: T, a: Alert): string {
  const p = { ...a.params }
  if (a.kind === 'dewormer_repeat') p.group = t(`group_short_${p.group}` as Key)
  let s = t(`al_${a.kind}` as Key, p)
  if (a.kind === 'famacha_due' && Number(p.days) >= 0) s += ` — ${t('al_famacha_days', p)}`
  return s
}

function monthLabel(i: number, months: string[]) {
  const m = months[i]
  if (!m) return ''
  return `${m.slice(5, 7)}/${m.slice(2, 4)}`
}

export function Home() {
  const { t } = useI18n()
  const data = useFarm()
  const now = today()
  const alerts = useMemo(() => computeAlerts(data, now), [data, now])
  const hc = useMemo(() => headcount(data.animals, now), [data, now])
  const y = useMemo(() => last12Months(data, now), [data, now])
  const growth = useMemo(() => herdOverTime(data.animals, 24, now), [data, now])
  const months = growth.map((g) => g.month)
  const hasGrowth = growth.some((g) => g.goat || g.sheep)

  return (
    <div className="page">
      <header className="topbar home-top">
        <h1 className="brand"><img src={logo} alt="" /> {t('app_name')}</h1>
        <SyncBadge />
      </header>
      <main className="content">
        <Card title={`${t('needs_attention')}${alerts.length ? ` (${alerts.length})` : ''}`}>
          {alerts.length === 0 && <p className="all-good">✓ {t('all_good')}</p>}
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link to={a.link} className={`alert alert-${a.level}`}>
                  <span className="alert-dot" aria-hidden>{a.level === 'red' ? '●' : a.level === 'amber' ? '▲' : '○'}</span>
                  <span>
                    {alertText(t, a)}
                    {a.tags && <span className="sub tag-list">{a.tags.slice(0, 12).join(', ')}{a.tags.length > 12 ? ' …' : ''}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('dash_herd')}>
          <div className="hero">
            <span className="hero-num">{hc.total}</span>
            <span className="muted">{t('dash_total')}</span>
          </div>
          <div className="stat-grid">
            {(['goat', 'sheep'] as const).map((s) => (
              <Link to={`/animals?species=${s}`} key={s} className="stat">
                <span className="stat-label">{s === 'goat' ? '🐐 ' + t('goats') : '🐑 ' + t('sheep_pl')}</span>
                <span className="stat-value">{hc.bySpecies[s].total}</span>
                <span className="muted small">
                  ♀ {hc.bySpecies[s].F} · ♂ {hc.bySpecies[s].M}
                </span>
              </Link>
            ))}
          </div>
          <h3 className="sub-title">{t('dash_age')}</h3>
          <SplitBar
            parts={(['young', 'grower', 'adult', 'unknown'] as const).map((k, i) => ({ value: hc.byAge[k], color: AGE_COLORS[i], label: t(`age_${k}`) }))}
          />
          <ul className="age-list">
            {(['young', 'grower', 'adult', 'unknown'] as const)
              .filter((k) => k !== 'unknown' || hc.byAge.unknown)
              .map((k) => (
                <li key={k}>
                  <span className="legend-swatch" style={{ background: AGE_COLORS[['young', 'grower', 'adult', 'unknown'].indexOf(k)] }} />
                  <span>{t(`age_${k}`)}</span>
                  <b>{hc.byAge[k]}</b>
                </li>
              ))}
          </ul>
        </Card>

        <Card title={t('dash_12m')}>
          <div className="stat-grid three">
            <div className="stat">
              <span className="stat-label">{t('dash_born')}</span>
              <span className="stat-value">{y.bornAlive + y.bornDead}</span>
              <span className="muted small">{t('n_born', { a: y.bornAlive, d: y.bornDead })}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t('dash_deaths')}</span>
              <span className="stat-value">{y.deaths}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{t('dash_mortality')}</span>
              <span className="stat-value">{y.mortalityPct === null ? '—' : `${y.mortalityPct}%`}</span>
              <span className="muted small">{t('dash_mortality_help')}</span>
            </div>
          </div>
        </Card>

        {hasGrowth && (
          <Card title={t('dash_growth')}>
            <LineChart
              series={[
                { label: t('goats'), color: SERIES[0], lines: [{ label: t('goats'), points: growth.map((g, i) => ({ x: i, y: g.goat })) }] },
                { label: t('sheep_pl'), color: SERIES[1], lines: [{ label: t('sheep_pl'), points: growth.map((g, i) => ({ x: i, y: g.sheep })) }] },
              ]}
              fmtX={(x) => monthLabel(Math.round(x), months)}
              fmtY={(v) => String(Math.round(v))}
              endLabels
            />
          </Card>
        )}
      </main>
    </div>
  )
}
