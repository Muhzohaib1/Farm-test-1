// Dates are stored as ISO "YYYY-MM-DD" strings and shown as DD/MM/YYYY.
export type ISODate = string

export interface Base {
  id: string
  createdAt: number
  updatedAt: number
  updatedBy?: string
  deleted?: boolean
}

export type Species = 'goat' | 'sheep'
export type Sex = 'F' | 'M'
export const BREEDS = ['beetal', 'pahari', 'dumba', 'waziri', 'cross', 'other'] as const
export type Breed = (typeof BREEDS)[number]
export type Source = 'born' | 'bought'
export type AnimalStatus = 'quarantine' | 'on_farm' | 'sold' | 'died'

export interface Animal extends Base {
  tag: string
  species: Species
  sex: Sex
  breed: Breed
  dob?: ISODate
  dobApprox?: boolean
  motherTag?: string
  fatherTag?: string
  source: Source
  purchaseDate?: ISODate
  purchasePrice?: number
  status: AnimalStatus
  exitDate?: ISODate // date sold or died
  breedingMale?: boolean
  breedingStart?: ISODate
  separatedDate?: ISODate // young male separated from females
  hasPhoto?: boolean
  notes?: string
}

/** Photos live in their own table so animal rows stay small when syncing. id = animal id. */
export interface Photo extends Base {
  data: string // compressed JPEG data URL
}

/** Ear tag replaced; the number stays the same. */
export interface TagEvent extends Base {
  animalId: string
  date: ISODate
  reason?: string
}

export interface Mating extends Base {
  femaleId: string
  maleId: string
  date: ISODate
  dueDate: ISODate
  failed?: boolean // female did not get pregnant
  override?: boolean
  overrideReason?: string
}

export interface Kid {
  sex: Sex
  alive: boolean
  animalId?: string
}

export interface Birth extends Base {
  motherId: string
  fatherId?: string
  matingId?: string
  date: ISODate
  kids: Kid[]
  notes?: string
}

export const DRUG_GROUPS = ['benzimidazole', 'levamisole', 'macrocyclic', 'closantel', 'other'] as const
export type DrugGroup = (typeof DRUG_GROUPS)[number]

export interface Deworming extends Base {
  date: ISODate
  product: string
  group: DrugGroup
  dose?: string
  wholeHerd: boolean
  animalIds: string[]
  cost?: number
}

export interface Famacha extends Base {
  animalId: string
  date: ISODate
  score: 1 | 2 | 3 | 4 | 5
}

export interface VaccineType extends Base {
  name: string
  species: Species | 'both'
  intervalDays: number
  minAgeDays: number
  note?: string
  builtin?: boolean
}

export interface Vaccination extends Base {
  vaccineTypeId: string
  date: ISODate
  wholeHerd: boolean
  animalIds: string[]
  cost?: number
}

export interface Treatment extends Base {
  animalId: string
  date: ISODate
  symptoms: string
  medicine?: string
  vetVisit: boolean
  cost?: number
  notes?: string
}

export const DEATH_CAUSES = [
  'disease', 'worms', 'pneumonia', 'diarrhoea', 'bloat', 'birth', 'weak_newborn',
  'predator', 'injury', 'poisoning', 'heat', 'unknown', 'other',
] as const
export type DeathCause = (typeof DEATH_CAUSES)[number]

export interface Death extends Base {
  animalId: string
  date: ISODate
  cause: DeathCause
  notes?: string
}

export interface Quarantine extends Base {
  animalId: string
  startDate: ISODate
  dewormed?: boolean
  vaccinated?: boolean
  liceChecked?: boolean
  dailyChecks: ISODate[]
  releasedDate?: ISODate
}

export interface Weight extends Base {
  animalId: string
  date: ISODate
  kg: number
}

export interface Shearing extends Base {
  date: ISODate
  animalIds: string[]
  woolKg?: number
  woolIncome?: number
}

export const SALE_REASONS = ['eid', 'meat', 'breeding', 'other'] as const
export type SaleReason = (typeof SALE_REASONS)[number]

export interface Sale extends Base {
  animalId: string
  date: ISODate
  buyer?: string
  price: number
  reason: SaleReason
}

export const EXPENSE_CATEGORIES = [
  'feed', 'medicine', 'vet', 'labour', 'rent', 'equipment', 'transport', 'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense extends Base {
  date: ISODate
  category: ExpenseCategory
  amount: number
  note?: string
  hasPhoto?: boolean // invoice photo stored in `photos` under the same id
}

export interface Tables {
  animals: Animal
  photos: Photo
  tagEvents: TagEvent
  matings: Mating
  births: Birth
  dewormings: Deworming
  famacha: Famacha
  vaccineTypes: VaccineType
  vaccinations: Vaccination
  treatments: Treatment
  deaths: Death
  quarantine: Quarantine
  weights: Weight
  shearings: Shearing
  sales: Sale
  expenses: Expense
}
export type TableName = keyof Tables

export const TABLE_NAMES: TableName[] = [
  'animals', 'photos', 'tagEvents', 'matings', 'births', 'dewormings', 'famacha', 'vaccineTypes',
  'vaccinations', 'treatments', 'deaths', 'quarantine', 'weights', 'shearings', 'sales', 'expenses',
]

/** Fields supplied by the caller when creating a record. */
export type Draft<T extends Base> = Omit<T, keyof Base> & Partial<Pick<Base, 'id'>>
