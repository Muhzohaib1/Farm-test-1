import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimalBadge, AnimalPicker, Btn, Card, Choice, DateField, Empty, Field, HerdPicker, NumIn, Page, Req, TextArea, TextIn, Toggle, Warning, toast, toNum } from '../components/ui'
import { useFarm } from '../data'
import { add, remove, update } from '../db/db'
import { DRUG_GROUPS, type Animal, type DrugGroup, type Famacha, type Species, type VaccineType } from '../db/types'
import { useI18n, type Key } from '../i18n'
import { ageDays } from '../logic/data'
import { appliesTo, famachaAdvice, famachaRecheck, flaggedAnimals, lastFamacha, lastGroup, repeatedGroup, riskReason } from '../logic/health'
import { addDays, fmtDate, today } from '../lib/dates'
import { fmtPKR } from '../lib/format'
import { compareTags } from '../lib/tags'
import { FormActions, useEditing, useHerdOn, useParam, usePresent, useSaved } from './common'

export function Health() {
  const { t } = useI18n()
  const data = useFarm()
  const rep = repeatedGroup(data.dewormings)
  const tiles = [
    { to: '/health/deworm', icon: '💊', label: t('rec_deworm') },
    { to: '/health/famacha', icon: '👁️', label: t('famacha_round') },
    { to: '/health/vaccinate', icon: '💉', label: t('rec_vaccine') },
    { to: '/health/treatment', icon: '🩺', label: t('rec_illness') },
    { to: '/quarantine', icon: '🚧', label: t('quarantine') },
    { to: '/breeding', icon: '🐣', label: t('births_due') },
    { to: '/health/vaccines', icon: '📋', label: t('vaccine_types') },
    { to: '/death', icon: '✝', label: t('rec_death') },
  ]
  const tag = (id: string) => data.animalsById.get(id)?.tag ?? '?'
  const recent = useMemo(() => {
    const rows: Array<{ id: string; date: string; icon: string; text: string; link: string }> = []
    for (const d of data.dewormings) rows.push({ id: d.id, date: d.date, icon: '💊', text: `${d.product} (${t(`group_short_${d.group}` as Key)}) · ${d.wholeHerd ? t('whole_herd') : d.animalIds.map(tag).join(', ')}`, link: `/health/deworm?id=${d.id}` })
    for (const v of data.vaccinations) rows.push({ id: v.id, date: v.date, icon: '💉', text: `${data.vaccineTypes.find((x) => x.id === v.vaccineTypeId)?.name ?? '?'} · ${v.wholeHerd ? t('whole_herd') : t('n_selected', { n: v.animalIds.length })}`, link: `/health/vaccinate?id=${v.id}` })
    for (const x of data.treatments) rows.push({ id: x.id, date: x.date, icon: '🩺', text: `${tag(x.animalId)}: ${x.symptoms}`, link: `/health/treatment?id=${x.id}` })
    for (const x of data.deaths) rows.push({ id: x.id, date: x.date, icon: '✝', text: `${tag(x.animalId)}: ${t(`cause_${x.cause}`)}`, link: `/death?id=${x.id}` })
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25)
  }, [data, t])
  return (
    <Page title={t('health_title')} back={false}>
      {rep && <Warning level="amber">{t('al_dewormer_repeat', { group: t(`group_short_${rep}`) })}</Warning>}
      <div className="action-grid">
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className="action-tile">
            <span className="action-icon">{x.icon}</span>
            {x.label}
          </Link>
        ))}
      </div>
      <Card title={t('recent_health')}>
        {recent.length ? (
          <div className="list">
            {recent.map((r) => (
              <Link key={r.id} to={r.link} className="list-row">
                <span>{r.icon}</span>
                <span className="grow">
                  <span className="muted small">{fmtDate(r.date)}</span>
                  <span className="sub">{r.text}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : <Empty />}
      </Card>
    </Page>
  )
}

export function DewormForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('dewormings')
  const saved = useSaved()
  const flaggedParam = useParam('flagged')
  const flagged = useMemo(
    () => flaggedAnimals(data.animals, data.famacha, data.dewormings, (a) => riskReason(a, data.matings, data.births, today())).map((f) => f.animal.id),
    [data],
  )
  const [date, setDate] = useState(editing?.date ?? today())
  const [product, setProduct] = useState(editing?.product ?? '')
  const [group, setGroup] = useState<DrugGroup | undefined>(editing?.group)
  const [dose, setDose] = useState(editing?.dose ?? '')
  const [whole, setWhole] = useState(editing ? editing.wholeHerd : !flaggedParam)
  const [ids, setIds] = useState<string[]>(editing?.animalIds ?? (flaggedParam ? flagged : []))
  const [cost, setCost] = useState(editing?.cost?.toString() ?? '')

  const herd = useHerdOn(date)
  const others = data.dewormings.filter((d) => d.id !== editing?.id)
  const warn = group ? repeatedGroup(others, { group, date }) : null
  const products = Array.from(new Set(data.dewormings.map((d) => d.product))).slice(0, 8)
  const last = [...data.dewormings].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3)
  const animalIds = whole ? herd.map((a) => a.id) : ids

  const save = () =>
    saved(async () => {
      const rec = { date, product: product.trim(), group: group!, dose: dose || undefined, wholeHerd: whole, animalIds, cost: toNum(cost) }
      if (editing) await update('dewormings', editing.id, rec)
      else await add('dewormings', rec)
    })

  return (
    <Page title={t('deworming')}>
      {last.length > 0 && (
        <Card title={t('last_dewormings')}>
          {last.map((d) => (
            <div key={d.id} className="kv">
              <span className="muted">{fmtDate(d.date)}</span>
              <span>{d.product} · <b>{t(`group_short_${d.group}` as Key)}</b></span>
            </div>
          ))}
        </Card>
      )}
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <Field label={<Req>{t('product')}</Req>}>
        <TextIn value={product} onChange={setProduct} />
        {products.length > 0 && (
          <div className="chips">
            {products.map((p) => (
              <button type="button" key={p} className={`chip${p === product ? ' on' : ''}`} onClick={() => {
                setProduct(p)
                const prev = data.dewormings.find((d) => d.product === p)
                if (prev && !group) setGroup(prev.group)
              }}>{p}</button>
            ))}
          </div>
        )}
      </Field>
      <Field label={<Req>{t('drug_group')}</Req>}>
        <Choice value={group} onChange={setGroup} cols={1} options={DRUG_GROUPS.map((g) => ({ value: g, label: t(`group_${g}` as Key) }))} />
      </Field>
      {warn && <Warning>{t('deworm_repeat_warn', { g: t(`group_short_${warn}` as Key) })}</Warning>}
      <Field label={<Req>{t('dose')}</Req>}>
        <TextIn value={dose} onChange={setDose} placeholder={t('dose_hint')} />
      </Field>
      <HerdPicker animals={herd} whole={whole} onWhole={setWhole} selected={ids} onSelected={setIds} />
      <Field label={`${t('cost')} (${t('optional')})`}>
        <NumIn value={cost} onChange={setCost} />
      </Field>
      <FormActions
        onSave={save}
        missing={[!product.trim() && t('product'), !group && t('drug_group'), !dose.trim() && t('dose'), !animalIds.length && t('select_animals')].filter((x): x is string => !!x)}
        editing={editing}
        table="dewormings"
      />
    </Page>
  )
}

const FAMACHA_COLORS = ['#c0262d', '#e0606a', '#f2a7b0', '#f7d9dc', '#ffffff']

/** What to do for one eyelid score, written for the person at the farm. */
export function FamachaAdviceCard({ animal, score }: { animal: Animal; score: Famacha['score'] }) {
  const { t } = useI18n()
  const data = useFarm()
  const now = today()
  const risk = score === 3 ? riskReason(animal, data.matings, data.births, now) : undefined
  const advice = famachaAdvice(score, risk)
  const prevGroup = lastGroup(data.dewormings)
  const steps: string[] = []
  if (advice.deworm) {
    steps.push(t('fa_do_deworm'))
    steps.push(prevGroup ? t('fa_do_group', { g: t(`group_short_${prevGroup}` as Key) }) : t('fa_do_group_any'))
  }
  if (advice.level === 'urgent') steps.push(t('fa_do_vet'), t('fa_do_handle'))
  if (advice.level !== 'ok') steps.push(t('fa_do_feed'), t('fa_do_bottlejaw'))
  if (advice.recheckDays) steps.push(t('fa_do_recheck', { n: advice.recheckDays }))
  if (score >= 4) steps.push(t('fa_do_fluke'))
  return (
    <div className={`advice advice-${advice.level}`} role="status">
      <div className="advice-head">
        <span className="advice-score" style={{ background: FAMACHA_COLORS[score - 1] }}>{score}</span>
        <div>
          <b>{animal.tag} — {t(`fa_title_${advice.level}`)}</b>
          {risk && <span className="sub">{t(`risk_${risk}`)}: {t('fa_risk_note')}</span>}
        </div>
      </div>
      {steps.length > 0 && (
        <ul className="advice-steps">
          {steps.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {advice.level !== 'ok' && <p className="muted small">{t('fa_vet_note')}</p>}
    </div>
  )
}

export function FamachaRound() {
  const { t, lang } = useI18n()
  const fwd = lang === 'ur' ? '←' : '→'
  const data = useFarm()
  const nav = useNavigate()
  const present = usePresent()
  const now = today()
  const single = useParam('animal')
  const recheckOnly = useParam('recheck')
  const queue = useMemo(
    () =>
      (recheckOnly ? famachaRecheck(data.animals, data.famacha, now) : present)
        .filter((a) => (single ? a.id === single : (ageDays(a, now) ?? 999) >= 30))
        .sort((a, b) => compareTags(a.tag, b.tag)),
    [], // order stays fixed for the whole round
  )
  const [i, setI] = useState(0)
  const [results, setResults] = useState<Record<string, Famacha['score']>>({})
  const [showing, setShowing] = useState<Famacha['score'] | null>(null)
  const last = lastFamacha(data.famacha)
  const a = queue[i]

  const score = async (s: Famacha['score']) => {
    await add('famacha', { animalId: a.id, date: now, score: s })
    setResults((r) => ({ ...r, [a.id]: s }))
    if (s >= 3) setShowing(s)
    else {
      toast(`${a.tag}: ${s} ✓`)
      setI((x) => x + 1)
    }
  }
  const next = () => {
    setShowing(null)
    setI((x) => x + 1)
  }

  if (!a) {
    const n = Object.keys(results).length
    const toTreat = flaggedAnimals(data.animals, data.famacha, data.dewormings, (x) => riskReason(x, data.matings, data.births, now))
      .filter((f) => f.animal.id in results)
    return (
      <Page title={t('famacha_round')}>
        <div className="big-message">✓ {t('round_done', { n, f: toTreat.length })}</div>
        {toTreat.length > 0 && (
          <>
            <Card title={t('fa_to_deworm')}>
              <div className="list">
                {toTreat.map((f) => (
                  <Link key={f.animal.id} to={`/animal/${f.animal.id}`} className="list-row">
                    <AnimalBadge a={f.animal} sub={`${t('famacha')}: ${f.check.score} — ${t(`famacha_${f.check.score}`)}`} />
                  </Link>
                ))}
              </div>
            </Card>
            <Link to="/health/deworm?flagged=1" className="btn btn-danger btn-block">💊 {t('fa_record_deworm', { n: toTreat.length })}</Link>
          </>
        )}
        <Btn kind="secondary" onClick={() => nav('/')}>{t('nav_home')}</Btn>
      </Page>
    )
  }

  const prev = last.get(a.id)
  return (
    <Page title={`${t('famacha_round')} ${i + 1}/${queue.length}`}>
      {showing === null && <p className="muted">{t('famacha_help')}</p>}
      <div className="famacha-animal">
        <AnimalBadge a={a} />
        {prev && showing === null && <span className="muted small">{t('last_check')}: {prev.score} · {fmtDate(prev.date)}</span>}
      </div>
      {showing !== null ? (
        <>
          <FamachaAdviceCard animal={a} score={showing} />
          <p className="muted small">{t('fa_deworm_later')}</p>
          <Btn onClick={next}>{i + 1 < queue.length ? `${t('next')} ${fwd}` : t('finish')}</Btn>
        </>
      ) : (
        <>
          <div className="famacha-scale">
            {([1, 2, 3, 4, 5] as const).map((s) => (
              <button key={s} className="famacha-btn" style={{ background: FAMACHA_COLORS[s - 1], color: s <= 2 ? '#fff' : '#222' }} onClick={() => void score(s)}>
                <span className="famacha-num">{s}</span>
                <span>{t(`famacha_${s}`)}</span>
              </button>
            ))}
          </div>
          <p className="muted small">{t('famacha_flag')}</p>
          <div className="row-actions">
            <Btn kind="secondary" block={false} onClick={() => setI((x) => x + 1)}>{t('skip')} {fwd}</Btn>
            <Btn kind="ghost" block={false} onClick={() => setI(queue.length)}>{t('finish')}</Btn>
          </div>
        </>
      )}
    </Page>
  )
}

export function VaccinationForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('vaccinations')
  const saved = useSaved()
  const typeParam = useParam('type')
  const now = today()
  const [typeId, setTypeId] = useState(editing?.vaccineTypeId ?? typeParam)
  const [date, setDate] = useState(editing?.date ?? now)
  const [whole, setWhole] = useState(editing?.wholeHerd ?? true)
  const [ids, setIds] = useState<string[]>(editing?.animalIds ?? [])
  const [cost, setCost] = useState(editing?.cost?.toString() ?? '')
  const type = data.vaccineTypes.find((v) => v.id === typeId)
  const herd = useHerdOn(date)
  const eligible = type ? herd.filter((a) => appliesTo(type, a) && (ageDays(a, date) ?? 999) >= type.minAgeDays) : herd
  const animalIds = whole ? eligible.map((a) => a.id) : ids

  const save = () =>
    saved(async () => {
      const rec = { vaccineTypeId: type!.id, date, wholeHerd: whole, animalIds, cost: toNum(cost) }
      if (editing) await update('vaccinations', editing.id, rec)
      else await add('vaccinations', rec)
    })

  return (
    <Page title={t('vaccination')}>
      <Field label={<Req>{t('vaccine')}</Req>}>
        <Choice
          value={typeId}
          onChange={setTypeId}
          cols={2}
          options={data.vaccineTypes.map((v) => ({ value: v.id, label: v.name }))}
        />
      </Field>
      {type && (
        <div className="info-box">
          {t('every_n_days', { n: type.intervalDays })} · {t('next_due')}: <b>{fmtDate(addDays(date, type.intervalDays))}</b>
          {type.note === 'before_monsoon' && <div>🌧️ {t('before_monsoon')}</div>}
        </div>
      )}
      <DateField label={t('date')} value={date} onChange={setDate} max={now} />
      <HerdPicker animals={eligible} whole={whole} onWhole={setWhole} selected={ids} onSelected={setIds} />
      <Field label={`${t('cost')} (${t('optional')})`}>
        <NumIn value={cost} onChange={setCost} />
      </Field>
      <FormActions onSave={save} missing={[!type && t('vaccine'), !animalIds.length && t('select_animals')].filter((x): x is string => !!x)} editing={editing} table="vaccinations" />
    </Page>
  )
}

function VaccineTypeEditor({ v, onDone }: { v?: VaccineType; onDone: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(v?.name ?? '')
  const [species, setSpecies] = useState<Species | 'both'>(v?.species ?? 'both')
  const [interval, setInterval] = useState(String(v?.intervalDays ?? 365))
  const [minAge, setMinAge] = useState(String(v?.minAgeDays ?? 90))
  const save = async () => {
    const rec = { name: name.trim(), species, intervalDays: toNum(interval) ?? 365, minAgeDays: toNum(minAge) ?? 0 }
    if (v) await update('vaccineTypes', v.id, rec)
    else await add('vaccineTypes', rec)
    toast(t('saved'))
    onDone()
  }
  return (
    <Card title={v ? v.name : t('add_vaccine_type')}>
      <Field label={t('vaccine')}><TextIn value={name} onChange={setName} /></Field>
      <Field label={t('applies_to')}>
        <Choice value={species} onChange={setSpecies} cols={3} options={[{ value: 'both', label: t('both') }, { value: 'goat', label: t('goat') }, { value: 'sheep', label: t('sheep') }]} />
      </Field>
      <Field label={t('interval_days')}>
        <Choice value={interval} onChange={setInterval} cols={3} options={['182', '365'].map((d) => ({ value: d, label: t('days', { n: d }) }))} />
        <NumIn value={interval} onChange={setInterval} />
      </Field>
      <Field label={t('min_age_days')}><NumIn value={minAge} onChange={setMinAge} /></Field>
      <div className="row-actions">
        <Btn onClick={save} disabled={!name.trim() || !toNum(interval)} block={false}>✓ {t('save')}</Btn>
        <Btn kind="ghost" onClick={onDone} block={false}>{t('cancel')}</Btn>
        {v && !v.builtin && (
          <Btn kind="danger" block={false} onClick={async () => { if (confirm(t('confirm_delete'))) { await remove('vaccineTypes', v.id); onDone() } }}>{t('delete')}</Btn>
        )}
      </div>
    </Card>
  )
}

export function VaccineTypes() {
  const { t } = useI18n()
  const data = useFarm()
  const [edit, setEdit] = useState<string | null>(null)
  return (
    <Page title={t('vaccine_types')}>
      {data.vaccineTypes.map((v) =>
        edit === v.id ? (
          <VaccineTypeEditor key={v.id} v={v} onDone={() => setEdit(null)} />
        ) : (
          <button key={v.id} className="list-row" onClick={() => setEdit(v.id)}>
            <span className="grow">
              <b>{v.name}</b>
              <span className="sub">
                {v.species === 'both' ? t('both') : t(v.species)} · {t('every_n_days', { n: v.intervalDays })}
                {v.note === 'before_monsoon' ? ` · 🌧️ ${t('before_monsoon')}` : ''}
              </span>
            </span>
            <span>✎</span>
          </button>
        ),
      )}
      {edit === 'new' ? <VaccineTypeEditor onDone={() => setEdit(null)} /> : <Btn kind="secondary" onClick={() => setEdit('new')}>＋ {t('add_vaccine_type')}</Btn>}
    </Page>
  )
}

const SYMPTOMS = ['diarrhoea', 'cough', 'fever', 'not_eating', 'lame', 'bloat', 'wound', 'eye', 'skin', 'mastitis', 'other'] as const

export function TreatmentForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('treatments')
  const present = usePresent()
  const saved = useSaved()
  const animalParam = useParam('animal')
  const [animalId, setAnimalId] = useState(editing?.animalId ?? animalParam)
  const [date, setDate] = useState(editing?.date ?? today())
  const [picked, setPicked] = useState<string[]>([])
  const [symptoms, setSymptoms] = useState(editing?.symptoms ?? '')
  const [medicine, setMedicine] = useState(editing?.medicine ?? '')
  const [vet, setVet] = useState(editing?.vetVisit ?? false)
  const [cost, setCost] = useState(editing?.cost?.toString() ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const animals = editing ? data.animals : present
  const allSymptoms = [...picked.map((s) => t(`sym_${s}` as Key)), symptoms.trim()].filter(Boolean).join(', ')

  const save = () =>
    saved(async () => {
      const rec = { animalId: animalId!, date, symptoms: allSymptoms, medicine: medicine || undefined, vetVisit: vet, cost: toNum(cost), notes: notes || undefined }
      if (editing) await update('treatments', editing.id, rec)
      else await add('treatments', rec)
    })

  return (
    <Page title={t('treatment')}>
      <AnimalPicker label={<Req>{t('select_animal')}</Req>} animals={animals} value={animalId} onChange={setAnimalId} />
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <Field label={<Req>{t('symptoms')}</Req>}>
        <div className="chips wrap">
          {SYMPTOMS.map((s) => (
            <button type="button" key={s} className={`chip${picked.includes(s) ? ' on' : ''}`} onClick={() => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]))}>
              {t(`sym_${s}` as Key)}
            </button>
          ))}
        </div>
        <TextIn value={symptoms} onChange={setSymptoms} />
      </Field>
      <Field label={t('medicine')}><TextIn value={medicine} onChange={setMedicine} /></Field>
      <Toggle checked={vet} onChange={setVet} label={t('vet_visit')} />
      <Field label={t('cost')}><NumIn value={cost} onChange={setCost} /></Field>
      {cost && <p className="muted small">{fmtPKR(toNum(cost))} → {vet ? t('cat_vet') : t('cat_medicine')}</p>}
      <Field label={t('notes')}><TextArea value={notes} onChange={setNotes} /></Field>
      <FormActions onSave={save} missing={[!animalId && t('select_animal'), !allSymptoms && t('symptoms')].filter((x): x is string => !!x)} editing={editing} table="treatments" />
    </Page>
  )
}

