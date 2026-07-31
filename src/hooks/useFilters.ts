import { useEffect, useState } from 'react'
import type { CarModelType } from '../types/api'

export interface Filters {
  payoutOnly: boolean
  maxDistanceKm: number | null
  carTypes: CarModelType[]
  modelIds: number[]
}

// Domyślnie tylko osobowe — tak jak dotąd filtrował sam serwer, zanim typ
// auta stał się filtrem klienckim (etap 7). `modelIds` puste = bez filtra
// modelu (w odróżnieniu od `carTypes`, gdzie pusta lista byłaby zawsze pusta).
export const DEFAULT_FILTERS: Filters = { payoutOnly: false, maxDistanceKm: null, carTypes: [1], modelIds: [] }

const STORAGE_KEY = 'traficar:filters'

function load(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_FILTERS, ...parsed }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  }, [filters])

  const isDefaultCarTypes = filters.carTypes.length === 1 && filters.carTypes[0] === 1
  const activeCount =
    (filters.payoutOnly ? 1 : 0) +
    (filters.maxDistanceKm != null ? 1 : 0) +
    (isDefaultCarTypes ? 0 : 1) +
    (filters.modelIds.length > 0 ? 1 : 0)

  return { filters, setFilters, activeCount }
}
