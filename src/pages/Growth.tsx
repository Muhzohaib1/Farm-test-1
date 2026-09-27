import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Legend, LineChart, SERIES } from '../components/charts'
import { Card, Choice, Empty, Page } from '../components/ui'
import { useFarm } from '../data'
import type { Animal, Species, Weight } from '../db/types'
import { useI18n } from '../i18n'
import { daysBetween, fmtDate } from '../lib/dates'
import { fmtNum } from '../lib/format'

/** Season key: "2026-1" = Jan–Jun 2026, "2026-2" = Jul–Dec 2026. */
const seasonOf = (dob: string) => `${dob.slice(0, 4)}-${Number(dob.slice(5, 7)) <= 6 ? 1 : 2}`

/** Weight at ~90 days, interpolated between the nearest weighings (60–120 days). */
function weightAt90(dob: string, ws: Weight[]): number | undefined {
  const pts = ws.map((w) => ({ d: daysBetween(dob, w.date), kg: w.kg })).sort((a, b) => a.d - b.d)
  const before = [...pts].reverse().find((p) => p.d <= 90 && p.d >= 60)
  const after = pts.find((p) => p.d >= 90 && p.d <= 120)
  if (before && after) return before.d === after.d ? before.kg : before.kg + ((after.kg - before.kg) * (90 - before.d)) / (after.d - before.d)
  return (before ?? after)?.kg
}

export function Growth() {
  const { t } = useI18n()
  const data = useFarm()
  const [species, setSpecies] = useState<Species>('goat')
  const born = data.animals.filter((a) => a.source === 'born' && a.dob && a.species === species)
  const seasons = useMemo(() => Array.from(new Set(born.map((a) => seasonOf(a.dob!)))).sort().reverse(), [born])
  const [seasonSel, setSeason] = useState<string | undefined>()
  const season = seasonSel && seasons.includes(seasonSel) ? seasonSel : seasons[0]
  const cohort = born.filter((a) => a.dob && seasonOf(a.dob) === season)
  const wsBy = useMemo(() => {
    const m = new Map<string, Weight[]>()
    for (const w of data.weights) m.set(w.animalId, [...(m.get(w.animalId) ?? []), w])
    return m
  }, [data.weights])

  const rows = cohort
    .map((a: Animal) => {
      const ws = (wsBy.get(a.id) ?? []).sort((x, y) => (x.date < y.date ? -1 : 1))
      const first = ws[0]
      const last = ws[ws.length - 1]
      const gain = first && last && last.date !== first.date ? ((last.kg - first.kg) / daysBetween(first.date, last.date)) * 1000 : undefined
      return { a, ws, w90: weightAt90(a.dob!, ws), last, gain }
    })
    .sort((x, y) => (y.w90 ?? -1) - (x.w90 ?? -1))

  const label = (s: string) => {
    const [y, h] = s.split('-')
    return t(h === '1' ? 'season_h1' : 'season_h2', { y })
  }
  const lineFor = (sex: 'F' | 'M') =>
    rows.filter((r) => r.a.sex === sex && r.ws.length).map((r) => ({ label: r.a.tag, points: r.ws.map((w) => ({ x: daysBetween(r.a.dob!, w.date), y: w.kg })) }))

  return (
    <Page title={t('compare_season')}>
      <Choice value={species} onChange={setSpecies} options={[{ value: 'goat', label: `🐐 ${t('goats')}` }, { value: 'sheep', label: `🐑 ${t('sheep_pl')}` }]} />
      {seasons.length > 0 && (
        <div className="chips scroll">
          {seasons.map((s) => (
            <button key={s} className={`chip${s === season ? ' on' : ''}`} onClick={() => setSeason(s)}>{label(s)}</button>
          ))}
        </div>
      )}
      {!rows.some((r) => r.ws.length) ? (
        <Empty>{t('no_weights')}</Empty>
      ) : (
        <>
          <Card title={`${label(season!)} · ${t('n_animals', { n: cohort.length })}`}>
            <Legend items={[{ label: `♀ ${t(`female_${species}`)}`, color: SERIES[0] }, { label: `♂ ${t(`male_${species}`)}`, color: SERIES[1] }]} />
            <LineChart
              legend={false}
              series={[
                { label: t('female'), color: SERIES[0], lines: lineFor('F') },
                { label: t('male'), color: SERIES[1], lines: lineFor('M') },
              ]}
              fmtX={(x) => String(Math.round(x))}
              fmtY={(y) => `${fmtNum(y)}`}
              height={240}
            />
            <p className="muted small center">{t('age_days_axis')} → · kg ↑</p>
          </Card>
          <Card>
            <table className="table">
              <thead>
                <tr><th>{t('tag')}</th><th>{t('dob')}</th><th className="num">{t('weight_at_3m')}</th><th className="num">{t('gain_per_day')}</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.a.id}>
                    <td><Link to={`/animal/${r.a.id}`}>{r.a.sex === 'F' ? '♀' : '♂'} {r.a.tag}</Link></td>
                    <td>{fmtDate(r.a.dob)}</td>
                    <td className="num">{r.w90 !== undefined ? `${fmtNum(r.w90)} kg` : '—'}</td>
                    <td className="num">{r.gain !== undefined ? `${Math.round(r.gain)} g` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </Page>
  )
}
