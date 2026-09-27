import { useSyncExternalStore } from 'react'

/** Chrome's install prompt event (not in TypeScript's DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

/** Call once at startup: Chrome fires the event early, before React renders. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export async function installApp() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice.catch(() => undefined)
  deferred = null
  emit()
}

/** True when Chrome says the app can be installed and it isn't already running installed. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    () => !!deferred && !window.matchMedia('(display-mode: standalone)').matches,
  )
}
