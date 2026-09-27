import type { Animal, ISODate } from '../db/types'
import type { Key, T } from '../i18n'
import { fmtDate } from '../lib/dates'
import { fmtAge, fmtPKR } from '../lib/format'
import { normTag } from '../lib/tags'
import type { FarmData } from './data'

export type EventGroup = 'health' | 'breeding' | 'weight' | 'other'

export interface TimelineEvent {
  key: string
  date: ISODate
  icon: string
  title: string
  detail?: string
  group: EventGroup
  link?: string
}

/** Everything that happened to one animal, newest first. */
export function animalTimeline(data: FarmData, a: Animal, t: T): TimelineEvent[] {
  const ev: TimelineEvent[] = []
  const tag = (id?: string) => (id ? data.animalsById.get(id)?.tag ?? '?' : t('unknown'))

  if (a.dob && a.source === 'born') ev.push({ key: 'born', date: a.dob, icon: '🍼', title: t('birth'), group: 'breeding', detail: [a.motherTag, a.fatherTag].filter(Boolean).join(' × ') || undefined })
  if (a.source === 'bought' && a.purchaseDate) ev.push({ key: 'bought', date: a.purchaseDate, icon: '🛒', title: t('source_bought'), group: 'other', detail: a.purchasePrice ? fmtPKR(a.purchasePrice) : undefined })
  for (const e of data.tagEvents) if (e.animalId === a.id) ev.push({ key: e.id, date: e.date, icon: '🏷️', title: t('tag_replaced'), detail: e.reason, group: 'other' })
  for (const q of data.quarantine) {
    if (q.animalId !== a.id) continue
    ev.push({ key: q.id, date: q.startDate, icon: '🚧', title: t('quarantine'), group: 'health', link: '/quarantine' })
    if (q.releasedDate) ev.push({ key: `${q.id}-r`, date: q.releasedDate, icon: '✅', title: t('q_released'), group: 'health' })
  }
  for (const m of data.matings) {
    if (m.femaleId !== a.id && m.maleId !== a.id) continue
    const other = m.femaleId === a.id ? tag(m.maleId) : tag(m.femaleId)
    ev.push({
      key: m.id, date: m.date, icon: '❤️', title: `${t('mating')} × ${other}`, group: 'breeding',
      detail: m.femaleId === a.id ? `${t('due_date')}: ${fmtDate(m.dueDate)}${m.failed ? ` — ${t('mating_failed')}` : ''}` : undefined,
      link: `/breeding/mating?id=${m.id}`,
    })
  }
  for (const b of data.births) {
    if (b.motherId !== a.id && b.fatherId !== a.id) continue
    const alive = b.kids.filter((k) => k.alive).length
    ev.push({
      key: b.id, date: b.date, icon: '🐣', title: t('birth'), group: 'breeding',
      detail: t('n_born', { a: alive, d: b.kids.length - alive }), link: `/breeding/birth?id=${b.id}`,
    })
  }
  for (const d of data.dewormings) {
    if (!d.animalIds.includes(a.id)) continue
    ev.push({ key: d.id, date: d.date, icon: '💊', title: `${t('deworming')}: ${d.product}`, detail: [t(`group_short_${d.group}` as Key), d.dose].filter(Boolean).join(' · '), group: 'health', link: `/health/deworm?id=${d.id}` })
  }
  for (const f of data.famacha) {
    if (f.animalId !== a.id) continue
    ev.push({ key: f.id, date: f.date, icon: f.score >= 4 ? '🔴' : '👁️', title: `${t('famacha')}: ${f.score}`, detail: t(`famacha_${f.score}` as Key), group: 'health' })
  }
  for (const v of data.vaccinations) {
    if (!v.animalIds.includes(a.id)) continue
    const vt = data.vaccineTypes.find((x) => x.id === v.vaccineTypeId)
    ev.push({ key: v.id, date: v.date, icon: '💉', title: `${t('vaccination')}: ${vt?.name ?? '?'}`, group: 'health', link: `/health/vaccinate?id=${v.id}` })
  }
  for (const x of data.treatments) {
    if (x.animalId !== a.id) continue
    ev.push({
      key: x.id, date: x.date, icon: '🩺', title: `${t('treatment')}: ${x.symptoms}`, group: 'health',
      detail: [x.medicine, x.vetVisit ? t('vet_visit') : '', x.cost ? fmtPKR(x.cost) : ''].filter(Boolean).join(' · '),
      link: `/health/treatment?id=${x.id}`,
    })
  }
  for (const w of data.weights) if (w.animalId === a.id) ev.push({ key: w.id, date: w.date, icon: '⚖️', title: `${t('weight')}: ${w.kg} kg`, group: 'weight', link: `/weight?id=${w.id}` })
  for (const s of data.shearings) if (s.animalIds.includes(a.id)) ev.push({ key: s.id, date: s.date, icon: '✂️', title: t('shearing'), group: 'other', link: `/shearing?id=${s.id}` })
  if (a.separatedDate) ev.push({ key: 'sep', date: a.separatedDate, icon: '↔️', title: t('mark_separated'), group: 'other' })
  for (const s of data.sales) {
    if (s.animalId !== a.id) continue
    ev.push({ key: s.id, date: s.date, icon: '💰', title: `${t('sale')}: ${fmtPKR(s.price)}`, detail: [t(`reason_${s.reason}`), s.buyer].filter(Boolean).join(' · '), group: 'other', link: `/sale?id=${s.id}` })
  }
  for (const d of data.deaths) {
    if (d.animalId !== a.id) continue
    const age = a.dob ? ` · ${t('age_at_death')}: ${fmtAge(t, a.dob, d.date)}` : ''
    ev.push({ key: d.id, date: d.date, icon: '✝', title: `${t('death')}: ${t(`cause_${d.cause}`)}`, detail: (d.notes ?? '') + age, group: 'health', link: `/death?id=${d.id}` })
  }
  // Offspring born (from animals that name this one as a parent but have no birth record)
  const tg = normTag(a.tag)
  const recordedKids = new Set(data.births.flatMap((b) => b.kids.map((k) => k.animalId)))
  for (const c of data.animals) {
    if (!c.dob || recordedKids.has(c.id)) continue
    if (normTag(c.motherTag ?? '') === tg || normTag(c.fatherTag ?? '') === tg) {
      ev.push({ key: `kid-${c.id}`, date: c.dob, icon: '🐣', title: `${t('offspring')}: ${c.tag}`, group: 'breeding', link: `/animal/${c.id}` })
    }
  }
  return ev.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}
