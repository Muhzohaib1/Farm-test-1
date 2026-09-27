import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LineChart, SERIES } from '../components/charts'
import { AnimalBadge, Btn, Card, DateField, Empty, Field, Labelled, Page, TextIn, toast } from '../components/ui'
import { useFarm, usePhoto } from '../data'
import { add, update } from '../db/db'
import type { Animal } from '../db/types'
import { useI18n } from '../i18n'
import { breedingStart, openPregnancies } from '../logic/breeding'
import { children, isPresent } from '../logic/data'
import { lastFamacha } from '../logic/health'
import { animalTimeline, type EventGroup } from '../logic/timeline'
import { daysBetween, fmtDate, parse, today } from '../lib/dates'
import { fmtAge, fmtPKR, kindName, sexIcon, speciesIcon } from '../lib/format'
import { compareTags, normTag } from '../lib/tags'

type Tab = 'overview' | 'timeline' | 'weight' | 'breeding'

function ParentLink({ tag }: { tag?: string }) {
  const { t } = useI18n()
  const data = useFarm()
  if (!tag) return <span className="muted">{t('unknown')}</span>
  const p = data.animalsByTag.get(normTag(tag))
  return p ? <Link to={`/animal/${p.id}`} className="tag-link">{p.tag}</Link> : <span>{tag} <span className="muted small">({t('not_in_herd')})</span></span>
}

function ReplaceTag({ a }: { a: Animal }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today())
  const [reason, setReason] = useState('')
  if (!open) return <Btn kind="secondary" onClick={() => setOpen(true)}>🏷️ {t('replace_tag')}</Btn>
  return (
    <Card title={t('replace_tag')}>
      <p className="muted">{t('replace_tag_help')}</p>
      <p className="big-tag">{a.tag}</p>
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <Field label={t('reason')}>
        <TextIn value={reason} onChange={setReason} />
      </Field>
      <Btn
        onClick={async () => {
          await add('tagEvents', { animalId: a.id, date, reason: reason || undefined })
          toast(t('tag_replaced'))
          setOpen(false)
        }}
      >
        ✓ {t('save')}
      </Btn>
    </Card>
  )
}

export function AnimalProfile() {
  const { id } = useParams()
  const { t } = useI18n()
  const data = useFarm()
  const a = id ? data.animalsById.get(id) : undefined
  const photo = usePhoto(a?.id)
  const [tab, setTab] = useState<Tab>('overview')
  const [group, setGroup] = useState<EventGroup | 'all'>('all')
  const now = today()

  const timeline = useMemo(() => (a ? animalTimeline(data, a, t) : []), [data, a, t])
  if (!a) return <Page title="?"><Empty /></Page>

  const kids = children(data, a).sort((x, y) => compareTags(x.tag, y.tag))
  const weights = data.weights.filter((w) => w.animalId === a.id).sort((x, y) => (x.date < y.date ? -1 : 1))
  const famacha = lastFamacha(data.famacha).get(a.id)
  const preg = a.sex === 'F' ? openPregnancies(data.matings, data.births, data.animalsById, now).find((p) => p.female.id === a.id) : undefined
  const present = isPresent(a)
  const sale = data.sales.find((s) => s.animalId === a.id)
  const death = data.deaths.find((d) => d.animalId === a.id)
  const bStart = a.sex === 'M' ? breedingStart(a, data.matings) : undefined

  const actions: Array<{ to: string; icon: string; label: string; show: boolean }> = [
    { to: `/weight?animal=${a.id}`, icon: '⚖️', label: t('rec_weight'), show: present },
    { to: `/health/treatment?animal=${a.id}`, icon: '🩺', label: t('rec_illness'), show: present },
    { to: `/breeding/mating?${a.sex === 'F' ? 'female' : 'male'}=${a.id}`, icon: '❤️', label: t('rec_mating'), show: present },
    { to: `/breeding/birth?mother=${a.id}`, icon: '🐣', label: t('rec_birth'), show: present && a.sex === 'F' },
    { to: `/sale?animal=${a.id}`, icon: '💰', label: t('rec_sale'), show: present },
    { to: `/death?animal=${a.id}`, icon: '✝', label: t('rec_death'), show: present },
  ]

  const tabs: Tab[] = ['overview', 'timeline', 'weight', 'breeding']
  const shown = timeline.filter((e) => group === 'all' || e.group === group)

  return (
    <Page title={a.tag} action={<Link to={`/animal/${a.id}/edit`} className="icon-btn" aria-label={t('edit')}>✎</Link>}>
      <div className="profile-head">
        {photo ? <img className="profile-photo" src={photo} alt="" /> : <div className="profile-photo placeholder">{speciesIcon(a.species)}</div>}
        <div>
          <div className="big-tag">{a.tag}</div>
          <div>{sexIcon(a.sex)} {kindName(t, a)} · {t(`breed_${a.breed}`)}</div>
          <div className="muted">{fmtAge(t, a.dob, a.exitDate ?? now)}{a.dobApprox ? ' ~' : ''}</div>
          <span className={`pill pill-${a.status}`}>{t(`status_${a.status}`)}</span>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t(x)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="action-grid">
            {actions.filter((x) => x.show).map((x) => (
              <Link key={x.to} to={x.to} className="action-tile">
                <span className="action-icon">{x.icon}</span>
                {x.label}
              </Link>
            ))}
          </div>
          {preg && (
            <Card>
              <Labelled k="due_date">
                <b>{fmtDate(preg.mating.dueDate)}</b> ({preg.daysToDue < 0 ? t('days_overdue', { n: -preg.daysToDue }) : t('days_to_go', { n: preg.daysToDue })})
              </Labelled>
            </Card>
          )}
          <Card>
            <Labelled k="dob">{fmtDate(a.dob)}{a.dobApprox ? ` (${t('dob_approx')})` : ''}</Labelled>
            <Labelled k="mother"><ParentLink tag={a.motherTag} /></Labelled>
            <Labelled k="father"><ParentLink tag={a.fatherTag} /></Labelled>
            <Labelled k="source">{t(`source_${a.source}`)}</Labelled>
            {a.source === 'bought' && <Labelled k="purchase_date">{fmtDate(a.purchaseDate)} · {fmtPKR(a.purchasePrice)}</Labelled>}
            {famacha && <Labelled k="last_check">{famacha.score} ({fmtDate(famacha.date)})</Labelled>}
            {weights.length > 0 && <Labelled k="weight">{weights[weights.length - 1].kg} kg ({fmtDate(weights[weights.length - 1].date)})</Labelled>}
            {a.breedingMale && <Labelled k="breeding_male">✓ {bStart ? `${fmtDate(bStart)} (${fmtAge(t, bStart, now)})` : ''}</Labelled>}
            {sale && <Labelled k="status_sold">{fmtDate(sale.date)} · {fmtPKR(sale.price)}</Labelled>}
            {death && <Labelled k="status_died">{fmtDate(death.date)} · {t(`cause_${death.cause}`)} · {t('age_at_death')}: {fmtAge(t, a.dob, death.date)}</Labelled>}
            {a.notes && <p className="notes">{a.notes}</p>}
          </Card>
          <Card title={`${t('offspring')} (${kids.length})`}>
            {kids.length ? (
              <div className="list">
                {kids.map((k) => (
                  <Link key={k.id} to={`/animal/${k.id}`} className="list-row">
                    <AnimalBadge a={k} sub={`${fmtDate(k.dob)} · ${t(`status_${k.status}`)}`} />
                  </Link>
                ))}
              </div>
            ) : <Empty />}
          </Card>
          {a.sex === 'M' && present && !a.breedingMale && !a.separatedDate && a.dob && daysBetween(a.dob, now) < 365 && (
            <Btn kind="secondary" onClick={() => update('animals', a.id, { separatedDate: now })}>↔️ {t('mark_separated')}</Btn>
          )}
          {a.separatedDate && <p className="muted small">{t('separated_on', { d: fmtDate(a.separatedDate) })}</p>}
          <ReplaceTag a={a} />
        </>
      )}

      {tab === 'timeline' && (
        <>
          <div className="chips scroll">
            {(['all', 'health', 'breeding', 'weight', 'other'] as const).map((g) => (
              <button key={g} className={`chip${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>
                {g === 'all' ? t('all') : g === 'other' ? t('history') : t(g)}
              </button>
            ))}
          </div>
          <ol className="timeline">
            {shown.map((e) => {
              const body = (
                <>
                  <span className="tl-icon">{e.icon}</span>
                  <span className="tl-body">
                    <span className="muted small">{fmtDate(e.date)}</span>
                    <b>{e.title}</b>
                    {e.detail && <span className="sub">{e.detail}</span>}
                  </span>
                </>
              )
              return <li key={e.key}>{e.link ? <Link to={e.link} className="tl-item">{body}</Link> : <div className="tl-item">{body}</div>}</li>
            })}
          </ol>
          {!shown.length && <Empty />}
        </>
      )}

      {tab === 'weight' && (
        <Card title={t('growth_chart')}>
          {weights.length ? (
            <>
              <LineChart
                series={[{ label: t('weight'), color: SERIES[0], lines: [{ label: '', points: weights.map((w) => ({ x: parse(w.date), y: w.kg })) }] }]}
                fmtX={(x) => fmtDate(new Date(x).toISOString().slice(0, 10)).slice(0, 5)}
                fmtY={(y) => `${Math.round(y * 10) / 10}`}
                endLabels
              />
              <table className="table">
                <tbody>
                  {[...weights].reverse().map((w) => (
                    <tr key={w.id}>
                      <td>{fmtDate(w.date)}</td>
                      <td>{a.dob ? fmtAge(t, a.dob, w.date) : ''}</td>
                      <td className="num"><Link to={`/weight?id=${w.id}`}>{w.kg} kg</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : <Empty>{t('no_weights')}</Empty>}
          {present && <Link to={`/weight?animal=${a.id}`} className="btn btn-primary btn-block">⚖️ {t('rec_weight')}</Link>}
        </Card>
      )}

      {tab === 'breeding' && (
        <>
          <ol className="timeline">
            {timeline.filter((e) => e.group === 'breeding').map((e) => (
              <li key={e.key}>
                <Link to={e.link ?? '#'} className="tl-item">
                  <span className="tl-icon">{e.icon}</span>
                  <span className="tl-body">
                    <span className="muted small">{fmtDate(e.date)}</span>
                    <b>{e.title}</b>
                    {e.detail && <span className="sub">{e.detail}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {!timeline.some((e) => e.group === 'breeding') && <Empty />}
        </>
      )}
    </Page>
  )
}
