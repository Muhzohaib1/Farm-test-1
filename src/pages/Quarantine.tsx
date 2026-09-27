import { Link } from 'react-router-dom'
import { AnimalBadge, Btn, Card, Empty, Page, Toggle, toast } from '../components/ui'
import { useFarm } from '../data'
import { batch, update } from '../db/db'
import type { Quarantine as Q } from '../db/types'
import { useI18n } from '../i18n'
import { QUARANTINE_DAYS, quarantineDays, quarantineState } from '../logic/quarantine'
import { addDays, fmtDate, today } from '../lib/dates'

function QCard({ q }: { q: Q }) {
  const { t } = useI18n()
  const data = useFarm()
  const now = today()
  const a = data.animalsById.get(q.animalId)!
  const s = quarantineState(q, data.dewormings, data.vaccinations, now)
  const days = quarantineDays(q, now)
  const checked = new Set(q.dailyChecks)
  const toggleDay = (d: string) =>
    update('quarantine', q.id, { dailyChecks: checked.has(d) ? q.dailyChecks.filter((x) => x !== d) : [...q.dailyChecks, d] })

  const release = async () => {
    await batch(async () => {
      await update('quarantine', q.id, { releasedDate: now })
      await update('animals', a.id, { status: 'on_farm' })
    })
    toast(t('q_released'))
  }

  const pct = Math.min(100, Math.round(((s.day - 1) / QUARANTINE_DAYS) * 100))
  return (
    <Card>
      <Link to={`/animal/${a.id}`}><AnimalBadge a={a} sub={`${fmtDate(q.startDate)} → ${fmtDate(addDays(q.startDate, QUARANTINE_DAYS))}`} /></Link>
      <div className="countdown">
        <b>{t('q_day', { d: Math.min(s.day, QUARANTINE_DAYS) })}</b>
        <span>{t('q_left', { n: s.daysLeft })}</span>
      </div>
      <div className="meter"><span style={{ width: `${pct}%` }} /></div>

      <Toggle checked={s.dewormed} onChange={(v) => update('quarantine', q.id, { dewormed: v })} label={t('q_deworm')} />
      <Toggle checked={s.vaccinated} onChange={(v) => update('quarantine', q.id, { vaccinated: v })} label={t('q_vaccinate')} />
      <Toggle checked={s.liceChecked} onChange={(v) => update('quarantine', q.id, { liceChecked: v })} label={t('q_lice')} />

      <div className="field">
        <span className="field-label">{t('q_daily')} — {t('q_daily_count', { n: s.checkedDays })}</span>
        {!s.checkedToday && s.day <= QUARANTINE_DAYS ? (
          <Btn onClick={() => toggleDay(now)}>✓ {t('q_check_today')}</Btn>
        ) : s.checkedToday ? (
          <p className="ok-text">✓ {t('q_checked_today')}</p>
        ) : null}
        <div className="day-dots" dir="ltr">
          {Array.from({ length: QUARANTINE_DAYS }, (_, i) => {
            const d = addDays(q.startDate, i)
            const reachable = days.includes(d)
            return (
              <button
                key={d}
                type="button"
                disabled={!reachable}
                className={`day-dot${checked.has(d) ? ' on' : ''}${reachable && !checked.has(d) && d !== now ? ' missed' : ''}`}
                onClick={() => toggleDay(d)}
                title={fmtDate(d)}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
        {s.missedDays.length > 0 && <span className="field-hint">{t('q_tap_missed')}</span>}
      </div>

      <Btn onClick={release} disabled={!s.canRelease}>{t('q_release')}</Btn>
      {!s.canRelease && <p className="muted small center">{t('q_release_locked')}</p>}
    </Card>
  )
}

export function Quarantine() {
  const { t } = useI18n()
  const data = useFarm()
  const active = data.quarantine.filter((q) => !q.releasedDate && data.animalsById.get(q.animalId)?.status === 'quarantine')
  return (
    <Page title={t('quarantine')}>
      {active.length ? active.map((q) => <QCard key={q.id} q={q} />) : <Empty>{t('quarantine_empty')}</Empty>}
      <Link to="/animal/new?source=bought" className="btn btn-secondary btn-block">🛒 {t('rec_buy')}</Link>
    </Page>
  )
}
