import { useState } from 'react'
import { AnimalPicker, Btn, Choice, DateField, Field, HerdPicker, NumIn, Page, TextArea, TextIn, toast, toNum } from '../components/ui'
import { useFarm } from '../data'
import { add, batch, update } from '../db/db'
import { DEATH_CAUSES, EXPENSE_CATEGORIES, SALE_REASONS, type DeathCause, type ExpenseCategory, type SaleReason } from '../db/types'
import { useI18n } from '../i18n'
import { today } from '../lib/dates'
import { fmtAge } from '../lib/format'
import { FormActions, useEditing, useHerdOn, useParam, usePresent, useSaved } from './common'

export function DeathForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('deaths')
  const present = usePresent()
  const saved = useSaved()
  const animalParam = useParam('animal')
  const [animalId, setAnimalId] = useState(editing?.animalId ?? animalParam)
  const [date, setDate] = useState(editing?.date ?? today())
  const [cause, setCause] = useState<DeathCause | undefined>(editing?.cause)
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const a = animalId ? data.animalsById.get(animalId) : undefined

  const save = () =>
    saved(() =>
      batch(async () => {
        const rec = { animalId: animalId!, date, cause: cause!, notes: notes || undefined }
        if (editing) await update('deaths', editing.id, rec)
        else await add('deaths', rec)
        await update('animals', animalId!, { status: 'died', exitDate: date })
      }),
    )

  return (
    <Page title={t('death')}>
      <AnimalPicker label={t('select_animal')} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      {a?.dob && <p className="info-box">{t('age_at_death')}: <b>{fmtAge(t, a.dob, date)}</b></p>}
      <Field label={t('cause')}>
        <Choice value={cause} onChange={setCause} cols={2} options={DEATH_CAUSES.map((c) => ({ value: c, label: t(`cause_${c}`) }))} />
      </Field>
      <Field label={t('notes')}><TextArea value={notes} onChange={setNotes} /></Field>
      <FormActions
        onSave={save}
        canSave={!!animalId && !!cause}
        editing={editing}
        table="deaths"
        onDeleted={() => update('animals', editing!.animalId, { status: 'on_farm', exitDate: undefined })}
      />
    </Page>
  )
}

export function SaleForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('sales')
  const present = usePresent()
  const saved = useSaved()
  const animalParam = useParam('animal')
  const [animalId, setAnimalId] = useState(editing?.animalId ?? animalParam)
  const [date, setDate] = useState(editing?.date ?? today())
  const [buyer, setBuyer] = useState(editing?.buyer ?? '')
  const [price, setPrice] = useState(editing?.price?.toString() ?? '')
  const [reason, setReason] = useState<SaleReason | undefined>(editing?.reason)
  const buyers = Array.from(new Set(data.sales.map((s) => s.buyer).filter(Boolean))) as string[]

  const save = () =>
    saved(() =>
      batch(async () => {
        const rec = { animalId: animalId!, date, buyer: buyer || undefined, price: toNum(price)!, reason: reason! }
        if (editing) await update('sales', editing.id, rec)
        else await add('sales', rec)
        await update('animals', animalId!, { status: 'sold', exitDate: date })
      }),
    )

  return (
    <Page title={t('sale')}>
      <AnimalPicker label={t('select_animal')} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <Field label={t('price')}><NumIn value={price} onChange={setPrice} /></Field>
      <Field label={t('sale_reason')}>
        <Choice value={reason} onChange={setReason} cols={2} options={SALE_REASONS.map((r) => ({ value: r, label: t(`reason_${r}`) }))} />
      </Field>
      <Field label={`${t('buyer')} (${t('optional')})`}>
        <TextIn value={buyer} onChange={setBuyer} />
        {buyers.length > 0 && (
          <div className="chips">
            {buyers.slice(0, 6).map((b) => (
              <button type="button" key={b} className={`chip${b === buyer ? ' on' : ''}`} onClick={() => setBuyer(b)}>{b}</button>
            ))}
          </div>
        )}
      </Field>
      <FormActions
        onSave={save}
        canSave={!!animalId && !!toNum(price) && !!reason}
        editing={editing}
        table="sales"
        onDeleted={() => update('animals', editing!.animalId, { status: 'on_farm', exitDate: undefined })}
      />
    </Page>
  )
}

export function WeightForm() {
  const { t } = useI18n()
  const data = useFarm()
  const editing = useEditing('weights')
  const present = usePresent()
  const saved = useSaved()
  const animalParam = useParam('animal')
  const [animalId, setAnimalId] = useState(editing?.animalId ?? animalParam)
  const [date, setDate] = useState(editing?.date ?? today())
  const [kg, setKg] = useState(editing?.kg?.toString() ?? '')
  const a = animalId ? data.animalsById.get(animalId) : undefined
  const prev = a ? data.weights.filter((w) => w.animalId === a.id && w.id !== editing?.id).sort((x, y) => (x.date < y.date ? 1 : -1))[0] : undefined
  const beforeBirth = !!a?.dob && date < a.dob
  const valid = !!animalId && !!toNum(kg) && toNum(kg)! > 0 && toNum(kg)! < 250 && !beforeBirth

  const saveNext = async () => {
    await add('weights', { animalId: animalId!, date, kg: toNum(kg)! })
    toast(`${a?.tag}: ${kg} kg ✓`)
    setAnimalId(undefined)
    setKg('')
  }

  return (
    <Page title={t('weight')}>
      <AnimalPicker label={t('select_animal')} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      {beforeBirth && <p className="field-error">{t('dob')}: {a?.dob?.split('-').reverse().join('/')}</p>}
      <Field label={t('weight_kg')} hint={prev ? `${t('history')}: ${prev.kg} kg (${prev.date.split('-').reverse().join('/')})` : undefined}>
        <NumIn decimal value={kg} onChange={setKg} />
      </Field>
      <FormActions
        onSave={() =>
          saved(async () => {
            if (editing) await update('weights', editing.id, { animalId: animalId!, date, kg: toNum(kg)! })
            else await add('weights', { animalId: animalId!, date, kg: toNum(kg)! })
          })
        }
        canSave={valid}
        editing={editing}
        table="weights"
      />
      {!editing && (
        <Btn kind="secondary" disabled={!valid} onClick={saveNext}>
          ✓ {t('save')} + {t('next')} →
        </Btn>
      )}
    </Page>
  )
}

export function ShearingForm() {
  const { t } = useI18n()
  const editing = useEditing('shearings')
  const saved = useSaved()
  const [date, setDate] = useState(editing?.date ?? today())
  const sheep = useHerdOn(date).filter((a) => a.species === 'sheep')
  const [whole, setWhole] = useState(!editing)
  const [ids, setIds] = useState<string[]>(editing?.animalIds ?? [])
  const [woolKg, setWoolKg] = useState(editing?.woolKg?.toString() ?? '')
  const [income, setIncome] = useState(editing?.woolIncome?.toString() ?? '')
  const animalIds = whole ? sheep.map((a) => a.id) : ids

  const save = () =>
    saved(async () => {
      const rec = { date, animalIds, woolKg: toNum(woolKg), woolIncome: toNum(income) }
      if (editing) await update('shearings', editing.id, rec)
      else await add('shearings', rec)
    })

  return (
    <Page title={t('shearing')}>
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <HerdPicker animals={sheep} whole={whole} onWhole={setWhole} selected={ids} onSelected={setIds} />
      <Field label={`${t('wool_kg')} (${t('optional')})`}><NumIn decimal value={woolKg} onChange={setWoolKg} /></Field>
      <Field label={`${t('wool_income')} (${t('optional')})`}><NumIn value={income} onChange={setIncome} /></Field>
      <FormActions onSave={save} canSave={animalIds.length > 0} editing={editing} table="shearings" />
    </Page>
  )
}

export function ExpenseForm() {
  const { t } = useI18n()
  const editing = useEditing('expenses')
  const saved = useSaved()
  const [category, setCategory] = useState<ExpenseCategory | undefined>(editing?.category)
  const [amount, setAmount] = useState(editing?.amount?.toString() ?? '')
  const [date, setDate] = useState(editing?.date ?? today())
  const [note, setNote] = useState(editing?.note ?? '')

  const save = () =>
    saved(async () => {
      const rec = { category: category!, amount: toNum(amount)!, date, note: note || undefined }
      if (editing) await update('expenses', editing.id, rec)
      else await add('expenses', rec)
    })

  return (
    <Page title={t('expense')}>
      <Field label={t('category')}>
        <Choice value={category} onChange={setCategory} cols={2} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`cat_${c}`) }))} />
      </Field>
      <Field label={t('amount')}><NumIn value={amount} onChange={setAmount} /></Field>
      <DateField label={t('date')} value={date} onChange={setDate} max={today()} />
      <Field label={`${t('notes')} (${t('optional')})`}><TextIn value={note} onChange={setNote} /></Field>
      <FormActions onSave={save} canSave={!!category && !!toNum(amount)} editing={editing} table="expenses" />
    </Page>
  )
}
