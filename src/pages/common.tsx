import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../auth/role'
import { Btn, toast } from '../components/ui'
import { useFarm } from '../data'
import { remove } from '../db/db'
import type { Base, TableName } from '../db/types'
import { useI18n } from '../i18n'
import { isPresent, presentOn } from '../logic/data'

export function useParam(name: string): string | undefined {
  const [sp] = useSearchParams()
  return sp.get(name) ?? undefined
}

/** The record being edited, from ?id= in the address. */
export function useEditing<K extends Exclude<TableName, 'photos'>>(table: K) {
  const data = useFarm()
  const id = useParam('id')
  const list = data[table] as unknown as Base[]
  return id ? (list.find((r) => r.id === id) as (typeof data)[K][number] | undefined) : undefined
}

export function usePresent() {
  const data = useFarm()
  return data.animals.filter(isPresent)
}

/** Save + (when editing) Delete buttons. */
export function FormActions({
  onSave, canSave = true, editing, table, busy, onDeleted,
}: { onSave: () => void; canSave?: boolean; editing?: Base; table?: TableName; busy?: boolean; onDeleted?: () => Promise<unknown> }) {
  const { t } = useI18n()
  const { canDelete } = useRole()
  const nav = useNavigate()
  return (
    <div className="form-actions">
      <Btn onClick={onSave} disabled={!canSave || busy}>
        ✓ {t('save')}
      </Btn>
      {editing && table && canDelete(editing) && (
        <Btn
          kind="danger"
          onClick={async () => {
            if (!confirm(t('confirm_delete'))) return
            await remove(table, editing.id)
            await onDeleted?.()
            toast(t('saved'))
            nav(-1)
          }}
        >
          {t('delete')}
        </Btn>
      )}
    </div>
  )
}

/** Save handler wrapper: runs, shows "Saved", goes back. */
export function useSaved() {
  const nav = useNavigate()
  const { t } = useI18n()
  return async (fn: () => Promise<unknown>, message?: string) => {
    await fn()
    toast(message ?? t('saved'))
    nav(-1)
  }
}

/** Animals on the farm on a given date (today → the current herd). */
export function useHerdOn(date: string) {
  const data = useFarm()
  return data.animals.filter((a) => presentOn(a, date))
}
