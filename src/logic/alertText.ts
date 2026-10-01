import type { Key } from '../i18n/en'
import type { T } from '../i18n/translate'
import type { Alert } from './alerts'

/** The Needs attention line for an alert, in the viewer's language. */
export function alertText(t: T, a: Alert): string {
  const p = { ...a.params }
  if (a.kind === 'dewormer_repeat') p.group = t(`group_short_${p.group}` as Key)
  let s = t(`al_${a.kind}` as Key, p)
  if (a.kind === 'famacha_due' && Number(p.days) >= 0) s += ` — ${t('al_famacha_days', p)}`
  return s
}
