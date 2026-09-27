import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, type ReactNode } from 'react'
import { tbl } from './db/db'
import { TABLE_NAMES, type Animal, type TableName } from './db/types'
import { buildData, type FarmData, type RawData } from './logic/data'

const Ctx = createContext<FarmData | null>(null)

async function loadAll(): Promise<FarmData> {
  const names = TABLE_NAMES.filter((n): n is Exclude<TableName, 'photos'> => n !== 'photos')
  const lists = await Promise.all(names.map((n) => tbl(n).toArray()))
  const raw = Object.fromEntries(names.map((n, i) => [n, lists[i]])) as RawData
  return buildData(raw, raw.animals as Animal[])
}

export function DataProvider({ children }: { children: ReactNode }) {
  const data = useLiveQuery(loadAll, [])
  if (!data) return <div className="splash">…</div>
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

export function useFarm(): FarmData {
  const d = useContext(Ctx)
  if (!d) throw new Error('DataProvider missing')
  return d
}

export function usePhoto(id: string | undefined) {
  return useLiveQuery(async () => (id ? ((p) => (p && !p.deleted ? p.data : undefined))(await tbl('photos').get(id)) : undefined), [id])
}
