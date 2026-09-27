import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRole } from '../auth/role'
import { ColumnChart, LOSS, SERIES } from '../components/charts'
import { Card, Empty, Page } from '../components/ui'
import { useFarm } from '../data'
import { useI18n, type Key } from '../i18n'
import { ledger, monthly, summarise } from '../logic/finance'
import { fmtDate, today } from '../lib/dates'
import { fmtPKR } from '../lib/format'

function compact(n: number) {
  const a = Math.abs(n)
  const s = a >= 100000 ? `${Math.round(a / 1000) / 100}L` : a >= 1000 ? `${Math.round(a / 100) / 10}k` : String(Math.round(a))
  return (n < 0 ? '−' : '') + s
}

export function Money() {
  const { t } = useI18n()
  const data = useFarm()
  const { isOwner } = useRole()
  const entries = useMemo(() => ledger(data), [data])
  const thisYear = today().slice(0, 4)
  const years = Array.from(new Set([thisYear, ...entries.map((e) => e.date.slice(0, 4))])).sort().reverse()
  const [year, setYear] = useState(thisYear)
  const [month, setMonth] = useState<string | null>(null)
  const months = useMemo(() => monthly(entries, year), [entries, year])
  const period = month ?? year
  const sum = summarise(entries, period)

  const recent = [
    ...data.sales.map((s) => ({ id: s.id, date: s.date, text: `💰 ${data.animalsById.get(s.animalId)?.tag ?? '?'} · ${t(`reason_${s.reason}`)}`, amount: s.price, income: true, link: `/sale?id=${s.id}` })),
    ...data.expenses.map((x) => ({ id: x.id, date: x.date, text: `🧾 ${t(`cat_${x.category}`)}${x.note ? ` · ${x.note}` : ''}`, amount: x.amount, income: false, link: `/expense?id=${x.id}` })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30)

  return (
    <Page title={t('money')}>
      <div className="row-actions">
        <Link to="/sale" className="btn btn-secondary">💰 {t('rec_sale')}</Link>
        <Link to="/expense" className="btn btn-primary">🧾 {t('rec_expense')}</Link>
      </div>

      {isOwner ? (
        <>
          <div className="chips scroll">
            {years.map((y) => (
              <button key={y} className={`chip${y === year ? ' on' : ''}`} onClick={() => { setYear(y); setMonth(null) }}>{y}</button>
            ))}
          </div>
          <Card title={`${t('profit_loss')} · ${month ? `${month.slice(5)}/${month.slice(0, 4)}` : year}`}>
            <div className="stat-grid three">
              <div className="stat"><span className="stat-label">{t('income')}</span><span className="stat-value small-val">{fmtPKR(sum.income)}</span></div>
              <div className="stat"><span className="stat-label">{t('costs')}</span><span className="stat-value small-val">{fmtPKR(sum.cost)}</span></div>
              <div className="stat">
                <span className="stat-label">{sum.profit >= 0 ? t('profit') : t('loss')}</span>
                <span className={`stat-value small-val ${sum.profit >= 0 ? 'pos' : 'neg'}`}>{sum.profit >= 0 ? '▲' : '▼'} {fmtPKR(Math.abs(sum.profit))}</span>
              </div>
            </div>
          </Card>
          <Card title={t('monthly_profit')}>
            <ColumnChart
              data={months.map((m) => ({ label: m.month.slice(5), value: m.profit, tip: `${m.month.slice(5)}/${year}: ${t('income')} ${fmtPKR(m.income)} · ${t('costs')} ${fmtPKR(m.cost)} · ${m.profit >= 0 ? t('profit') : t('loss')} ${fmtPKR(Math.abs(m.profit))}` }))}
              fmtY={compact}
              colorFor={(v) => (v >= 0 ? SERIES[0] : LOSS)}
            />
            <table className="table">
              <thead><tr><th>{t('month')}</th><th className="num">{t('income')}</th><th className="num">{t('costs')}</th><th className="num">{t('profit')}</th></tr></thead>
              <tbody>
                {months.filter((m) => m.income || m.cost).map((m) => (
                  <tr key={m.month} className={month === m.month ? 'on' : ''} onClick={() => setMonth(month === m.month ? null : m.month)}>
                    <td>{m.month.slice(5)}/{m.month.slice(2, 4)}</td>
                    <td className="num">{compact(m.income)}</td>
                    <td className="num">{compact(m.cost)}</td>
                    <td className={`num ${m.profit >= 0 ? 'pos' : 'neg'}`}>{compact(m.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title={t('by_category')}>
            {Object.keys(sum.byCategory).length ? (
              Object.entries(sum.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => {
                  const isIncome = c === 'sales' || c === 'wool'
                  const max = Math.max(...Object.values(sum.byCategory))
                  return (
                    <div key={c} className="cat-row">
                      <span>{isIncome ? '＋' : '−'} {t(`cat_${c}` as Key)}</span>
                      <span className="cat-bar"><span style={{ width: `${(v / max) * 100}%`, background: isIncome ? SERIES[0] : '#c3c2b7' }} /></span>
                      <b className="num">{fmtPKR(v)}</b>
                    </div>
                  )
                })
            ) : <Empty />}
          </Card>
        </>
      ) : (
        <p className="muted">🔒 {t('owner_only')}</p>
      )}

      <Card title={t('recent_entries')}>
        {recent.length ? (
          <div className="list">
            {recent.map((r) => (
              <Link key={r.id} to={r.link} className="list-row">
                <span className="grow">
                  <span className="muted small">{fmtDate(r.date)}</span>
                  <span className="sub">{r.text}</span>
                </span>
                <b className={r.income ? 'pos' : ''}>{r.income ? '+' : '−'}{fmtPKR(r.amount)}</b>
              </Link>
            ))}
          </div>
        ) : <Empty />}
      </Card>
    </Page>
  )
}
