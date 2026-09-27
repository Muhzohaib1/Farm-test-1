import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimalPicker, Btn, Choice, DateField, Field, NumIn, Page, TextArea, TextIn, Toggle, toast, toNum } from '../components/ui'
import { useFarm, usePhoto } from '../data'
import { add, batch, tbl, update } from '../db/db'
import { BREEDS, type Animal, type AnimalStatus, type Breed, type Sex, type Source, type Species } from '../db/types'
import { useI18n } from '../i18n'
import { daysBetween, today } from '../lib/dates'
import { compressImage } from '../lib/image'
import { nextTag, normTag, tagPrefix, tagTaken } from '../lib/tags'
import { QUARANTINE_DAYS } from '../logic/quarantine'
import { FormActions } from './common'

/** Pick a parent from the herd, or type a tag for one that isn't recorded. */
function ParentField({ label, sex, species, value, onChange }: { label: string; sex: Sex; species: Species; value: string; onChange: (tag: string) => void }) {
  const { t } = useI18n()
  const data = useFarm()
  const candidates = data.animals.filter((a) => a.sex === sex && a.species === species)
  const match = data.animalsByTag.get(normTag(value))
  const [typing, setTyping] = useState(!!value && !match)
  return typing ? (
    <Field label={label} hint={<button type="button" className="link" onClick={() => setTyping(false)}>{t('select_animal')}</button>}>
      <TextIn value={value} onChange={(v) => onChange(normTag(v))} placeholder={t('not_in_herd')} />
    </Field>
  ) : (
    <div>
      <AnimalPicker label={label} animals={candidates} value={match?.id} onChange={(id) => onChange(id ? data.animalsById.get(id)!.tag : '')} allowNone />
      <button type="button" className="link small" onClick={() => setTyping(true)}>✎ {t('not_in_herd')}</button>
    </div>
  )
}

export function AnimalForm() {
  const { t } = useI18n()
  const nav = useNavigate()
  const data = useFarm()
  const { id } = useParams()
  const [sp] = useSearchParams()
  const editing = id ? data.animalsById.get(id) : undefined
  const existingPhoto = usePhoto(editing?.id)
  const now = today()

  const [species, setSpecies] = useState<Species>(editing?.species ?? 'goat')
  const [sex, setSex] = useState<Sex>(editing?.sex ?? 'F')
  const [source, setSource] = useState<Source>(editing?.source ?? (sp.get('source') === 'bought' ? 'bought' : 'born'))
  const [breed, setBreed] = useState<Breed>(editing?.breed ?? 'beetal')
  const [tagInput, setTagInput] = useState(editing?.tag ?? '')
  const [dob, setDob] = useState(editing?.dob ?? '')
  const [dobApprox, setDobApprox] = useState(editing?.dobApprox ?? false)
  const [motherTag, setMotherTag] = useState(editing?.motherTag ?? '')
  const [fatherTag, setFatherTag] = useState(editing?.fatherTag ?? '')
  const [purchaseDate, setPurchaseDate] = useState(editing?.purchaseDate ?? now)
  const [price, setPrice] = useState(editing?.purchasePrice?.toString() ?? '')
  const [statusSel, setStatusSel] = useState<AnimalStatus | undefined>(editing?.status)
  const [exitDate, setExitDate] = useState(editing?.exitDate ?? now)
  const [breedingMale, setBreedingMale] = useState(editing?.breedingMale ?? false)
  const [breedingStart, setBreedingStart] = useState(editing?.breedingStart ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [photo, setPhoto] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  // New animals: a newborn (born on farm, under ~6 months) gets a K/L year tag, others D-/B-.
  const isYoung = source === 'born' && !!dob && daysBetween(dob, now) < 183
  const suggested = useMemo(
    () => nextTag(tagPrefix({ species, sex, newborn: isYoung, date: dob || now }), data.allAnimals),
    [species, sex, isYoung, dob, now, data.allAnimals],
  )
  const tag = editing ? tagInput : tagInput || suggested
  const taken = tagTaken(tag, data.allAnimals, editing?.id)

  // Bought within the last 21 days → quarantine by default.
  const defaultStatus: AnimalStatus =
    source === 'bought' && purchaseDate && daysBetween(purchaseDate, now) < QUARANTINE_DAYS ? 'quarantine' : 'on_farm'
  const status = statusSel ?? defaultStatus

  const onPhoto = async (f?: File) => {
    if (f) setPhoto(await compressImage(f))
  }

  const save = async () => {
    if (!tag || taken) return
    setBusy(true)
    const fields: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> = {
      tag: normTag(tag),
      species, sex, breed, source,
      dob: dob || undefined,
      dobApprox,
      motherTag: motherTag || undefined,
      fatherTag: fatherTag || undefined,
      purchaseDate: source === 'bought' ? purchaseDate : undefined,
      purchasePrice: source === 'bought' ? toNum(price) : undefined,
      status,
      exitDate: status === 'sold' || status === 'died' ? exitDate : undefined,
      breedingMale: sex === 'M' ? breedingMale : false,
      breedingStart: sex === 'M' && breedingMale ? breedingStart || undefined : undefined,
      hasPhoto: !!(photo || existingPhoto),
      notes: notes || undefined,
      separatedDate: editing?.separatedDate,
    }
    let animalId = editing?.id
    await batch(async () => {
      if (editing) await update('animals', editing.id, fields)
      else animalId = (await add('animals', fields)).id
      if (photo && animalId) {
        if (await tbl('photos').get(animalId)) await update('photos', animalId, { data: photo, deleted: false })
        else await add('photos', { id: animalId, data: photo })
      }
      if (status === 'quarantine' && animalId && !data.quarantine.some((q) => q.animalId === animalId && !q.releasedDate)) {
        await add('quarantine', { animalId, startDate: source === 'bought' ? purchaseDate : now, dailyChecks: [] })
      }
    })
    toast(t('animal_saved'))
    if (editing) nav(-1)
    else nav(`/animal/${animalId}`, { replace: true })
  }

  return (
    <Page title={editing ? t('edit_animal') : t('add_animal')}>
      <Field label={t('species')}>
        <Choice value={species} onChange={setSpecies} options={[{ value: 'goat', label: `🐐 ${t('goat')}` }, { value: 'sheep', label: `🐑 ${t('sheep')}` }]} />
      </Field>
      <Field label={t('sex')}>
        <Choice
          value={sex}
          onChange={setSex}
          options={[
            { value: 'F', label: `♀ ${t(`female_${species}`)}` },
            { value: 'M', label: `♂ ${t(`male_${species}`)}` },
          ]}
        />
      </Field>
      <Field label={t('source')}>
        <Choice value={source} onChange={setSource} options={[{ value: 'born', label: t('source_born') }, { value: 'bought', label: t('source_bought') }]} />
      </Field>
      <Field label={t('tag')} hint={!editing && !tagInput ? t('tag_suggested') : undefined} error={taken ? t('tag_taken') : undefined}>
        <TextIn value={tag} onChange={(v) => setTagInput(normTag(v))} />
      </Field>
      <Field label={t('breed')}>
        <Choice value={breed} onChange={setBreed} cols={3} options={BREEDS.map((b) => ({ value: b, label: t(`breed_${b}`) }))} />
      </Field>
      <DateField label={t('dob')} value={dob} onChange={setDob} max={now} />
      <Toggle checked={dobApprox} onChange={setDobApprox} label={t('dob_approx')} />

      {source === 'bought' && (
        <>
          <DateField label={t('purchase_date')} value={purchaseDate} onChange={setPurchaseDate} max={now} />
          <Field label={t('purchase_price')}>
            <NumIn value={price} onChange={setPrice} />
          </Field>
          {!editing && <p className="muted small">{t('quarantine_bought_note')}</p>}
        </>
      )}

      <ParentField label={t('mother')} sex="F" species={species} value={motherTag} onChange={setMotherTag} />
      <ParentField label={t('father')} sex="M" species={species} value={fatherTag} onChange={setFatherTag} />

      <Field label={t('status')}>
        <Choice
          value={status}
          onChange={setStatusSel}
          options={(['on_farm', 'quarantine', 'sold', 'died'] as const).map((s) => ({ value: s, label: t(`status_${s}`) }))}
        />
      </Field>
      {(status === 'sold' || status === 'died') && <DateField label={t('exit_date')} value={exitDate} onChange={setExitDate} max={now} />}

      {sex === 'M' && (
        <>
          <Toggle checked={breedingMale} onChange={setBreedingMale} label={t('breeding_male')} />
          {breedingMale && <DateField label={t('breeding_start')} value={breedingStart} onChange={setBreedingStart} max={now} />}
        </>
      )}

      <Field label={t('photo')}>
        {(photo || existingPhoto) && <img className="photo-preview" src={photo || existingPhoto} alt="" />}
        <label className="btn btn-secondary btn-block file-btn">
          📷 {photo || existingPhoto ? t('change_photo') : t('take_photo')}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </label>
      </Field>
      <Field label={t('notes')}>
        <TextArea value={notes} onChange={setNotes} />
      </Field>

      {editing ? (
        <FormActions onSave={save} canSave={!taken && !!tag} editing={editing} table="animals" busy={busy} />
      ) : (
        <div className="form-actions">
          <Btn onClick={save} disabled={taken || !tag || busy}>✓ {t('save')}</Btn>
        </div>
      )}
    </Page>
  )
}
