import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimalBadge, Empty, Page } from '../components/ui'
import { useFarm } from '../data'
import { useI18n } from '../i18n'
import { malesToSeparate } from '../logic/alerts'
import { isPresent } from '../logic/data'
import { today } from '../lib/dates'
import { fmtAge } from '../lib/format'
import { compareTags } from '../lib/tags'
import type { Species } from '../db/types'

type Filter = 'present' | 'gone' | 'separate'

export function Animals() {
  const { t } = useI18n()
  const data = useFarm()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const filter = (sp.get('filter') as Filter) || 'present'
  const species = (sp.get('species') as Species | null) ?? undefined
  const now = today()

  const setParam = (k: string, v?: string) => {
    const next = new URLSearchParams(sp)
    if (v) next.set(k, v)
    else next.delete(k)
    setSp(next, { replace: true })
  }

  const list = useMemo(() => {
    const base =
      filter === 'separate' ? malesToSeparate(data, now)
      : filter === 'gone' ? data.animals.filter((a) => !isPresent(a))
      : data.animals.filter(isPresent)
    const s = q.trim().toUpperCase()
    return base
      .filter((a) => (!species || a.species === species) && (!s || a.tag.toUpperCase().includes(s)))
      .sort((a, b) => compareTags(a.tag, b.tag))
  }, [data, filter, species, q, now])

  return (
    <Page
      title={t('nav_animals')}
      back={false}
      action={<Link to="/animal/new" className="icon-btn add" aria-label={t('add_animal')}>＋</Link>}
    >
      <input className="input search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips scroll">
        {(['present', 'gone', 'separate'] as Filter[]).map((f) => (
          <button key={f} className={`chip${filter === f ? ' on' : ''}`} onClick={() => setParam('filter', f === 'present' ? undefined : f)}>
            {t(`filter_${f}`)}
          </button>
        ))}
        <button className={`chip${!species ? ' on' : ''}`} onClick={() => setParam('species')}>{t('all')}</button>
        <button className={`chip${species === 'goat' ? ' on' : ''}`} onClick={() => setParam('species', 'goat')}>🐐 {t('goats')}</button>
        <button className={`chip${species === 'sheep' ? ' on' : ''}`} onClick={() => setParam('species', 'sheep')}>🐑 {t('sheep_pl')}</button>
      </div>
      <p className="muted small">{t('n_animals', { n: list.length })}</p>
      <div className="list">
        {list.map((a) => (
          <Link key={a.id} to={`/animal/${a.id}`} className="list-row">
            <AnimalBadge a={a} sub={`${t(`breed_${a.breed}`)} · ${fmtAge(t, a.dob, now)}`} />
            {a.status !== 'on_farm' && <span className={`pill pill-${a.status}`}>{t(`status_${a.status}`)}</span>}
          </Link>
        ))}
        {!list.length && <Empty />}
      </div>
    </Page>
  )
}
