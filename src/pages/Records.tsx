import { useState } from 'react'
import { AnimalPicker, Btn, Choice, DateField, Field, HerdPicker, NumIn, Page, Req, TextArea, TextIn, toast, toNum } from '../components/ui'
import { useFarm, usePhoto } from '../data'
import { add, batch, tbl, update, uuid } from '../db/db'
import { DEATH_CAUSES, EXPENSE_CATEGORIES, SALE_REASONS, type DeathCause, type ExpenseCategory, type SaleReason } from '../db/types'
import { useI18n } from '../i18n'
import { today } from '../lib/dates'
import { fmtAge } from '../lib/format'
import { compressImage } from '../lib/image'
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
      <AnimalPicker label={<Req>{t('select_animal')}</Req>} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={<Req>{t('date')}</Req>} value={date} onChange={setDate} max={today()} />
      {a?.dob && <p className="info-box">{t('age_at_death')}: <b>{fmtAge(t, a.dob, date)}</b></p>}
      <Field label={<Req>{t('cause')}</Req>}>
        <Choice value={cause} onChange={setCause} cols={2} options={DEATH_CAUSES.map((c) => ({ value: c, label: t(`cause_${c}`) }))} />
      </Field>
      <Field label={t('notes')}><TextArea value={notes} onChange={setNotes} /></Field>
      <FormActions
        onSave={save}
        missing={[!animalId && t('select_animal'), !cause && t('cause')].filter((x): x is string => !!x)}
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
      <AnimalPicker label={<Req>{t('select_animal')}</Req>} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={<Req>{t('date')}</Req>} value={date} onChange={setDate} max={today()} />
      <Field label={<Req>{t('price')}</Req>}><NumIn value={price} onChange={setPrice} /></Field>
      <Field label={<Req>{t('sale_reason')}</Req>}>
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
        missing={[!animalId && t('select_animal'), !toNum(price) && t('price'), !reason && t('sale_reason')].filter((x): x is string => !!x)}
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
      <AnimalPicker label={<Req>{t('select_animal')}</Req>} animals={editing ? data.animals : present} value={animalId} onChange={setAnimalId} />
      <DateField label={<Req>{t('date')}</Req>} value={date} onChange={setDate} max={today()} />
      {beforeBirth && <p className="field-error">{t('dob')}: {a?.dob?.split('-').reverse().join('/')}</p>}
      <Field label={<Req>{t('weight_kg')}</Req>} hint={prev ? `${t('history')}: ${prev.kg} kg (${prev.date.split('-').reverse().join('/')})` : undefined}>
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
        missing={[!animalId && t('select_animal'), !toNum(kg) && t('weight_kg')].filter((x): x is string => !!x)}
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
      <FormActions onSave={save} missing={animalIds.length ? [] : [t('select_animals')]} editing={editing} table="shearings" />
    </Page>
  )
}

/** Full-screen view of a photo; tap anywhere to close. */
function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <button type="button" className="photo-viewer" onClick={onClose} aria-label="close">
      <img src={src} alt="" />
    </button>
  )
}

export function ExpenseForm() {
  const { t } = useI18n()
  const editing = useEditing('expenses')
  const saved = useSaved()
  const existingPhoto = usePhoto(editing?.hasPhoto ? editing.id : undefined)
  const [category, setCategory] = useState<ExpenseCategory | undefined>(editing?.category)
  const [amount, setAmount] = useState(editing?.amount?.toString() ?? '')
  const [date, setDate] = useState(editing?.date ?? today())
  const [note, setNote] = useState(editing?.note ?? '')
  const [photo, setPhoto] = useState<string | null | undefined>() // undefined = unchanged, null = removed
  const [viewing, setViewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const shown = photo === undefined ? existingPhoto : photo ?? undefined

  const missing = [!category && t('category'), !toNum(amount) && t('amount'), !date && t('date')].filter((x): x is string => !!x)

  const onPhoto = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try {
      // Bigger and sharper than animal photos so the invoice text stays readable.
      setPhoto(await compressImage(f, 1400, 0.72))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    saved(() =>
      batch(async () => {
        const id = editing?.id ?? uuid()
        const hasPhoto = photo === undefined ? !!editing?.hasPhoto : !!photo
        const rec = { category: category!, amount: toNum(amount)!, date, note: note || undefined, hasPhoto }
        if (editing) await update('expenses', id, rec)
        else await add('expenses', { id, ...rec })
        if (photo) {
          if (await tbl('photos').get(id)) await update('photos', id, { data: photo, deleted: false })
          else await add('photos', { id, data: photo })
        } else if (photo === null && (await tbl('photos').get(id))) {
          await update('photos', id, { deleted: true })
        }
      }),
    )

  return (
    <Page title={t('expense')}>
      <Field label={<Req>{t('category')}</Req>}>
        <Choice value={category} onChange={setCategory} cols={2} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`cat_${c}`) }))} />
      </Field>
      <Field label={<Req>{t('amount')}</Req>}><NumIn value={amount} onChange={setAmount} /></Field>
      <DateField label={<Req>{t('date')}</Req>} value={date} onChange={setDate} max={today()} />
      <Field label={`${t('notes')} (${t('optional')})`}><TextIn value={note} onChange={setNote} /></Field>

      <div className="field">
        <span className="field-label">{t('invoice_photo')} ({t('optional')})</span>
        {shown && (
          <button type="button" className="invoice-thumb" onClick={() => setViewing(true)}>
            <img src={shown} alt="" />
            <span>🔍 {t('tap_to_view')}</span>
          </button>
        )}
        <label className="btn btn-secondary btn-block file-btn">
          📎 {busy ? '…' : shown ? t('change_photo') : t('add_invoice_photo')}
          <input type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </label>
        {shown && (
          <Btn kind="ghost" onClick={() => setPhoto(null)}>✕ {t('remove_photo')}</Btn>
        )}
      </div>
      {viewing && shown && <PhotoViewer src={shown} onClose={() => setViewing(false)} />}

      <FormActions onSave={save} missing={missing} busy={busy} editing={editing} table="expenses" />
    </Page>
  )
}
