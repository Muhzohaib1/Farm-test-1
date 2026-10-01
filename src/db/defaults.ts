import type { VaccineType } from './types'

/** Default vaccines. Fixed ids so two phones seeding offline don't create duplicates. */
export const DEFAULT_VACCINES: Array<Omit<VaccineType, 'createdAt' | 'updatedAt'>> = [
  { id: 'vt-ppr', name: 'PPR', species: 'both', intervalDays: 365, minAgeDays: 90, builtin: true },
  { id: 'vt-et', name: 'Enterotoxaemia (ET)', species: 'both', intervalDays: 182, minAgeDays: 60, builtin: true },
  { id: 'vt-fmd', name: 'FMD', species: 'both', intervalDays: 182, minAgeDays: 90, builtin: true },
  { id: 'vt-hs', name: 'HS', species: 'both', intervalDays: 365, minAgeDays: 90, builtin: true, note: 'before_monsoon' },
  { id: 'vt-goatpox', name: 'Goat pox', species: 'goat', intervalDays: 365, minAgeDays: 90, builtin: true },
  { id: 'vt-sheeppox', name: 'Sheep pox', species: 'sheep', intervalDays: 365, minAgeDays: 90, builtin: true },
]
