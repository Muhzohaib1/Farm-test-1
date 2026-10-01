import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimalBadge, AnimalPicker, Btn, Card, Choice, DateField, Empty, Field, Page, Req, TextArea, TextIn, Toggle, Warning, toast } from '../components/ui'
import { useFarm } from '../data'
import { add, batch, update } from '../db/db'
import { BREEDS, type Breed, type Kid, type Sex } from '../db/types'
import { useI18n } from '../i18n'
import { GESTATION_DAYS, checkInbreeding, dueDate, openPregnancies } from '../logic/breeding'
import { fmtDate, today } from '../lib/dates'
import { nextTags, normTag, tagPrefix, tagTaken } from '../lib/tags'
import { FormActions, useEditing, useParam, usePresent, useSaved } from './common'

export function Breeding() {
  const { t } = useI18n()
  const data = useFarm()
  const now = today()
  const preg = useMemo(() => openPregnancies(data.matings, data.births, data.animalsById, now), [data, now])
  const groups = [
    { key: 'overdue', list: preg.filter((p) => p.daysToDue < 0) },
    { key: 'due_in_30', list: preg.filter((p) => p.daysToDue >= 0 && p.daysToDue <= 30) },
    { key: 'due_later', list: preg.filter((p) => p.daysToDue > 30) },
  ] as const
  return (
    <Page title={t('births_due')}>
      <div className="row-actions">
        <Link to="/breeding/mating" className="btn btn-secondary">❤️ {t('rec_mating')}</Link>
        <Link to="/breeding/birth" className="btn btn-primary">🐣 {t('rec_birth')}</Link>
      </div>
      {!preg.length && <Empty>{t('no_births_due')}</Empty>}
      {groups.map((g) =>
        g.list.length ? (
          <Card key={g.key} title={`${t(g.key)} (${g.list.length})`} className={g.key === 'overdue' ? 'card-red' : ''}>
            <div className="list">
              {g.list.map((p) => (
                <div key={p.mating.id} className="list-row col">
                  <Link to={`/animal/${p.female.id}`}>
                    <AnimalBadge
                      a={p.female}
                      sub={`${t('due_date')}: ${fmtDate(p.mating.dueDate)} — ${
                        p.daysToDue < 0 ? t('days_overdue', { n: -p.daysToDue }) : p.daysToDue === 0 ? t('due_today') : t('days_to_go', { n: p.daysToDue })
                      }`}
                    />
                  </Link>
                  <div className="row-actions">
                    <Link to={`/breeding/birth?mother=${p.female.id}`} className="btn btn-primary">🐣 {t('rec_birth')}</Link>
                    <Btn kind="ghost" block={false} onClick={() => update('matings', p.mating.id, { failed: true })}>{t('mating_failed')}</Btn>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null,
      )}
    </Page>
  )
}

export function MatingForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('matings')
  const present = usePresent()
  const saved = useSaved()
  const femaleParam = useParam('female')
  const maleParam = useParam('male')
  const [femaleId, setFemaleId] = useState(editing?.femaleId ?? femaleParam)
  const [maleId, setMaleId] = useState(editing?.maleId ?? maleParam)
  const [date, setDate] = useState(editing?.date ?? today())
  const [failed, setFailed] = useState(editing?.failed ?? false)
  const [override, setOverride] = useState(editing?.override ?? false)
  const [reason, setReason] = useState(editing?.overrideReason ?? '')

  const female = femaleId ? data.animalsById.get(femaleId) : undefined
  const male = maleId ? data.animalsById.get(maleId) : undefined
  const females = present.filter((a) => a.sex === 'F')
  const males = present.filter((a) => a.sex === 'M' && (!female || a.species === female.species))
  const check = female && male ? checkInbreeding(female, male, data.animalsByTag) : null
  const due = female ? dueDate(female.species, date) : undefined
  const canSave = !!female && !!male && female.species === male.species && (!check?.blocked || (override && !!reason.trim()))

  const save = () =>
    saved(async () => {
      const rec = {
        femaleId: female!.id, maleId: male!.id, date, dueDate: due!, failed,
        override: check?.blocked ? true : undefined,
        overrideReason: check?.blocked ? reason.trim() : undefined,
      }
      if (editing) await update('matings', editing.id, rec)
      else await add('matings', rec)
    })

  return (
    <Page title={t('mating')}>
      <AnimalPicker label={<Req>{t('female_animal')}</Req>} animals={females} value={femaleId} onChange={setFemaleId} />
      <AnimalPicker label={<Req>{t('male_animal')}</Req>} animals={males} value={maleId} onChange={setMaleId} />
      <DateField label={<Req>{t('mating_date')}</Req>} value={date} onChange={setDate} max={today()} />
      {female && due && (
        <div className="info-box">
          📅 {t('due_calc', { d: fmtDate(due), n: GESTATION_DAYS[female.species], s: t(female.species) })}
        </div>
      )}

      {check && check.reasons.length > 0 && female && male && (
        <Warning level={check.blocked ? 'red' : 'amber'}>
          <b>{t('inbreed_title')}</b>
          <ul>
            {check.reasons.map((r) => (
              <li key={r}>{t(`inbreed_${r}`, { m: male.tag, f: female.tag })}</li>
            ))}
          </ul>
          <p>{t('inbreed_advice')}</p>
          {check.blocked && (
            <>
              <Toggle checked={override} onChange={setOverride} label={t('inbreed_override')} />
              {override && (
                <Field label={t('inbreed_override_reason')}>
                  <TextIn value={reason} onChange={setReason} />
                </Field>
              )}
            </>
          )}
        </Warning>
      )}
      {editing && <Toggle checked={failed} onChange={setFailed} label={t('mating_failed')} />}
      <FormActions
        onSave={save}
        canSave={canSave}
        missing={[!female && t('female_animal'), !male && t('male_animal'), !!check?.blocked && override && !reason.trim() && t('inbreed_override_reason')].filter((x): x is string => !!x)}
        editing={editing}
        table="matings"
      />
    </Page>
  )
}

interface KidDraft {
  sex: Sex
  tag: string
}

export function BirthForm() {
  const { t } = useI18n()
  const data = useFarm()
  const nav = useNavigate()
  const editing = useEditing('births')
  const present = usePresent()
  const saved = useSaved()
  const now = today()
  const motherParam = useParam('mother')
  const [motherId, setMotherId] = useState(editing?.motherId ?? motherParam)
  const mother = motherId ? data.animalsById.get(motherId) : undefined
  const lastMating = useMemo(
    () => (mother ? data.matings.filter((m) => m.femaleId === mother.id && !m.failed).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : undefined),
    [data.matings, mother],
  )
  const [fatherSel, setFatherSel] = useState<string | undefined | null>(editing ? editing.fatherId : null)
  const fatherId = fatherSel === null ? lastMating?.maleId : fatherSel
  const father = fatherId ? data.animalsById.get(fatherId) : undefined
  const [date, setDate] = useState(editing?.date ?? now)
  const [alive, setAlive] = useState(1)
  const [dead, setDead] = useState(0)
  const [sexes, setSexes] = useState<Sex[]>(['F', 'F', 'F', 'F', 'F'])
  const [deadSexes, setDeadSexes] = useState<Sex[]>(['F', 'F', 'F', 'F'])
  const [tagEdits, setTagEdits] = useState<Record<number, string>>({})
  const [breedSel, setBreedSel] = useState<Breed | undefined>()
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const breed: Breed = breedSel ?? (mother && father && mother.breed === father.breed ? mother.breed : mother && !father ? mother.breed : 'cross')
  const suggested = mother ? nextTags(tagPrefix({ species: mother.species, sex: 'F', newborn: true, date }), data.allAnimals, alive) : []
  const kids: KidDraft[] = Array.from({ length: alive }, (_, i) => ({ sex: sexes[i], tag: normTag(tagEdits[i] ?? suggested[i] ?? '') }))
  const dupInForm = new Set(kids.map((k) => k.tag)).size !== kids.length
  const badTag = kids.some((k) => !k.tag || tagTaken(k.tag, data.allAnimals))
  const females = present.filter((a) => a.sex === 'F')
  const males = data.animals.filter((a) => a.sex === 'M' && (!mother || a.species === mother.species))

  if (editing) {
    return (
      <Page title={t('birth')}>
        {mother && <AnimalBadge a={mother} />}
        <DateField label={t('birth_date')} value={date} onChange={setDate} max={now} />
        <AnimalPicker label={t('father')} animals={males} value={fatherId} onChange={(v) => setFatherSel(v)} allowNone />
        <div className="list">
          {editing.kids.map((k, i) => {
            const a = k.animalId ? data.animalsById.get(k.animalId) : undefined
            return a ? (
              <Link key={i} to={`/animal/${a.id}`} className="list-row"><AnimalBadge a={a} /></Link>
            ) : (
              <div key={i} className="list-row muted">{k.sex === 'F' ? '♀' : '♂'} {t('born_dead')}</div>
            )
          })}
        </div>
        <Field label={t('notes')}><TextArea value={notes} onChange={setNotes} /></Field>
        <FormActions
          editing={editing}
          table="births"
          onSave={() => saved(() => update('births', editing.id, { date, fatherId, notes: notes || undefined }))}
        />
      </Page>
    )
  }

  const save = async () => {
    if (!mother) return
    let created = 0
    await batch(async () => {
      const kidRecs: Kid[] = []
      for (const k of kids) {
        const a = await add('animals', {
          tag: k.tag, species: mother.species, sex: k.sex, breed, dob: date, source: 'born', status: 'on_farm',
          motherTag: mother.tag, fatherTag: father?.tag,
        })
        kidRecs.push({ sex: k.sex, alive: true, animalId: a.id })
        created++
      }
      for (let i = 0; i < dead; i++) kidRecs.push({ sex: deadSexes[i], alive: false })
      await add('births', {
        motherId: mother.id, fatherId: father?.id, matingId: lastMating?.id, date, kids: kidRecs, notes: notes || undefined,
      })
    })
    toast(t('birth_saved', { n: created }))
    nav(-1)
  }

  const kidWord = (s: Sex) => (mother ? t(`${s === 'F' ? 'female' : 'male'}_${mother.species}`) : s)

  return (
    <Page title={t('birth')}>
      <AnimalPicker label={<Req>{t('mother')}</Req>} animals={females} value={motherId} onChange={setMotherId} />
      <AnimalPicker label={t('father')} animals={males} value={fatherId} onChange={(v) => setFatherSel(v)} allowNone />
      {fatherSel === null && lastMating && <p className="muted small">{t('father_from_mating')} ({fmtDate(lastMating.date)})</p>}
      <DateField label={<Req>{t('birth_date')}</Req>} value={date} onChange={setDate} max={now} />
      <Field label={t('born_alive')}>
        <Choice value={alive} onChange={setAlive} cols={5} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
      </Field>
      <Field label={t('born_dead')}>
        <Choice value={dead} onChange={setDead} cols={5} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
      </Field>

      {mother &&
        kids.map((k, i) => (
          <Card key={i} title={`${t('kid_n', { n: i + 1 })} 🐣`}>
            <Choice
              value={k.sex}
              onChange={(s) => setSexes((xs) => xs.map((x, j) => (j === i ? s : x)))}
              options={[{ value: 'F', label: `♀ ${kidWord('F')}` }, { value: 'M', label: `♂ ${kidWord('M')}` }]}
            />
            <Field label={<Req>{t('new_tag')}</Req>} error={k.tag && tagTaken(k.tag, data.allAnimals) ? t('tag_taken') : undefined}>
              <TextIn value={k.tag} onChange={(v) => setTagEdits((e) => ({ ...e, [i]: normTag(v) }))} />
            </Field>
          </Card>
        ))}
      {mother &&
        Array.from({ length: dead }, (_, i) => (
          <Card key={`d${i}`} title={`${t('born_dead')} ${i + 1}`}>
            <Choice
              value={deadSexes[i]}
              onChange={(s) => setDeadSexes((xs) => xs.map((x, j) => (j === i ? s : x)))}
              options={[{ value: 'F', label: `♀ ${kidWord('F')}` }, { value: 'M', label: `♂ ${kidWord('M')}` }]}
            />
          </Card>
        ))}
      {alive > 0 && (
        <Field label={t('breed_of_kids')}>
          <Choice value={breed} onChange={setBreedSel} cols={3} options={BREEDS.map((b) => ({ value: b, label: t(`breed_${b}`) }))} />
        </Field>
      )}
      <Field label={t('notes')}><TextArea value={notes} onChange={setNotes} /></Field>
      <FormActions
        onSave={save}
        canSave={!badTag && !dupInForm}
        missing={[!mother && t('mother'), alive + dead === 0 && t('born_alive'), !!mother && kids.some((k) => !k.tag) && t('new_tag')].filter((x): x is string => !!x)}
      />
    </Page>
  )
}
