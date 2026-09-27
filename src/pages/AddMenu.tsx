import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import { useI18n, type Key } from '../i18n'

const ITEMS: Array<{ to: string; icon: string; k: Key }> = [
  { to: '/breeding/birth', icon: '🐣', k: 'rec_birth' },
  { to: '/breeding/mating', icon: '❤️', k: 'rec_mating' },
  { to: '/health/deworm', icon: '💊', k: 'rec_deworm' },
  { to: '/health/famacha', icon: '👁️', k: 'rec_famacha' },
  { to: '/health/vaccinate', icon: '💉', k: 'rec_vaccine' },
  { to: '/health/treatment', icon: '🩺', k: 'rec_illness' },
  { to: '/weight', icon: '⚖️', k: 'rec_weight' },
  { to: '/death', icon: '✝', k: 'rec_death' },
  { to: '/sale', icon: '💰', k: 'rec_sale' },
  { to: '/expense', icon: '🧾', k: 'rec_expense' },
  { to: '/animal/new?source=bought', icon: '🛒', k: 'rec_buy' },
  { to: '/shearing', icon: '✂️', k: 'rec_shearing' },
  { to: '/animal/new', icon: '🏷️', k: 'rec_animal' },
]

export function AddMenu() {
  const { t } = useI18n()
  return (
    <Page title={t('add_title')} back={false}>
      <div className="action-grid">
        {ITEMS.map((x) => (
          <Link key={x.to} to={x.to} className="action-tile">
            <span className="action-icon">{x.icon}</span>
            {t(x.k)}
          </Link>
        ))}
      </div>
    </Page>
  )
}
