import { useSyncExternalStore } from 'react'
import { useI18n } from '../i18n'
import { syncStore } from '../sync/sync'

export function SyncBadge() {
  const { t } = useI18n()
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get)
  const text =
    s.state === 'local' ? t('sync_local')
    : s.state === 'offline' ? t('sync_offline')
    : s.state === 'error' ? t('sync_error')
    : s.pending ? t('sync_pending', { n: s.pending })
    : s.state === 'syncing' ? '⟳'
    : t('sync_ok')
  const icon = s.state === 'ok' && !s.pending ? '✓' : s.state === 'offline' || s.state === 'local' ? '📱' : s.state === 'error' ? '!' : '⟳'
  return (
    <span className={`sync-badge sync-${s.state}`}>
      {icon} {text}
    </span>
  )
}
