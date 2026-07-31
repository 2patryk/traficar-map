import type {
  Car,
  CarHistoryResponse,
  CarModel,
  HealthResponse,
  HeatmapCell,
  RankedCar,
  StatsHistoryResponse,
  StatsSummary,
  Zone,
  ZoneShape,
} from './types/api'

const API_BASE = '/api/v1'

export async function fetchZones(): Promise<Zone[]> {
  const res = await fetch(`${API_BASE}/zones`)
  if (!res.ok) throw new Error(`Nie udało się pobrać stref (${res.status})`)
  const { zones } = await res.json()
  return zones
}

export async function fetchRelocationZoneShape(zoneId: string | number): Promise<ZoneShape | null> {
  const res = await fetch(`${API_BASE}/zones/${zoneId}/shapes`)
  if (!res.ok) throw new Error(`Nie udało się pobrać strefy (${res.status})`)
  const { shapes } = await res.json()
  return shapes.find((s: { name: string }) => s.name === 'GLOBAL RELOCATION TARGET ZONE')?.geo ?? null
}

// modelId -> { name, type }; type: 1 = osobowe, 2 = dostawcze, 6 = skutery.
// Pobierane raz na życie aplikacji.
let modelsPromise: Promise<Map<number, CarModel>> | null = null
export function fetchCarModels(): Promise<Map<number, CarModel>> {
  modelsPromise ??= fetch(`${API_BASE}/car-models`)
    .then((res) => (res.ok ? res.json() : { carModels: [] }))
    .then(
      ({ carModels }: { carModels: { id: number; name: string; type: CarModel['type'] }[] }) =>
        new Map(carModels.map((m) => [m.id, { name: m.name, type: m.type }])),
    )
    .catch(() => {
      modelsPromise = null
      return new Map()
    })
  return modelsPromise
}

export async function fetchCars(
  zoneId: string | number,
  discountTypes: string[] | null = ['Relokacja'],
): Promise<Car[]> {
  // discountTypes = null → bez filtra, własne API zwraca wszystkie dostępne auta
  const params = new URLSearchParams({ zoneId: String(zoneId) })
  if (discountTypes?.length) {
    for (const type of discountTypes) params.append('discountType', type)
  }

  const res = await fetch(`/api/cars?${params.toString()}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać aut (${res.status})`)
  const { cars } = await res.json()

  // Typ auta (osobowe/dostawcze/skuter) filtrujemy po stronie klienta
  // (FiltersSheet), więc tu zwracamy cały feed bez filtrowania.
  return cars.map((car: Car) => ({
    ...car,
    discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0),
  }))
}

export async function fetchCarHistory(carId: number, days = 30): Promise<CarHistoryResponse> {
  const res = await fetch(`/api/cars/${carId}/history?days=${days}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać historii auta (${res.status})`)
  return res.json()
}

export async function fetchLongestParked(
  zoneId: string | number,
  limit = 100,
  order: 'asc' | 'desc' = 'desc',
): Promise<RankedCar[]> {
  const res = await fetch(
    `/api/stats/longest-parked?zoneId=${zoneId}&limit=${limit}&order=${order}`,
  )
  if (!res.ok) throw new Error(`Nie udało się pobrać rankingu (${res.status})`)
  const { cars } = await res.json()
  return cars
}

export async function fetchStatsHistory(zoneId: string | number, days = 7): Promise<StatsHistoryResponse> {
  const res = await fetch(`/api/stats/history?zoneId=${zoneId}&days=${days}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać historii statystyk (${res.status})`)
  return res.json()
}

export async function fetchStatsSummary(days = 7): Promise<StatsSummary> {
  const res = await fetch(`/api/stats/summary?days=${days}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać podsumowania (${res.status})`)
  return res.json()
}

export async function fetchHeatmap(zoneId: string | number, days = 30): Promise<HeatmapCell[]> {
  const res = await fetch(`/api/stats/heatmap?zoneId=${zoneId}&days=${days}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać heatmapy (${res.status})`)
  const { cells } = await res.json()
  return cells
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return res.json()
}
