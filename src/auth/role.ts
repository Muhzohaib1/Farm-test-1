import type { Base } from '../db/types'
import { useSession } from './session'

const DAY = 86400000

/** Owner can do everything. Manager can add and edit, and delete their own entries within a day (to fix mistakes). */
export function useRole() {
  const { profile } = useSession()
  const isOwner = profile?.role === 'owner'
  const canDelete = (r: Base) => isOwner || (r.updatedBy === profile?.name && Date.now() - r.createdAt < DAY)
  return { isOwner, canDelete, profile }
}
