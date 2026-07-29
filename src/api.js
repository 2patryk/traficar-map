const API_BASE = '/api/v1'

export async function fetchZones() {
  const res = await fetch(`${API_BASE}/zones`)
  if (!res.ok) throw new Error(`Nie udało się pobrać stref (${res.status})`)
  const { zones } = await res.json()
  return zones
}

export async function fetchRelocationZoneShape(zoneId) {
  const res = await fetch(`${API_BASE}/zones/${zoneId}/shapes`)
  if (!res.ok) throw new Error(`Nie udało się pobrać strefy (${res.status})`)
  const { shapes } = await res.json()
  return shapes.find((s) => s.name === 'GLOBAL RELOCATION TARGET ZONE')?.geo ?? null
}

// modelId -> { name, type }; type: 1 = osobowe, 2 = dostawcze, 6 = skutery.
// Pobierane raz na życie aplikacji.
let modelsPromise = null
export function fetchCarModels() {
  modelsPromise ??= fetch(`${API_BASE}/car-models`)
    .then((res) => (res.ok ? res.json() : { carModels: [] }))
    .then(({ carModels }) => new Map(carModels.map((m) => [m.id, { name: m.name, type: m.type }])))
    .catch(() => {
      modelsPromise = null
      return new Map()
    })
  return modelsPromise
}

export async function fetchCars(zoneId, discountTypes = ['Relokacja']) {
  // discountTypes = null → bez filtra, własne API zwraca wszystkie dostępne auta
  const params = new URLSearchParams({ zoneId })
  if (discountTypes?.length) {
    for (const type of discountTypes) params.append('discountType', type)
  }

  const [res, models] = await Promise.all([
    fetch(`/api/cars?${params.toString()}`),
    fetchCarModels(),
  ])
  if (!res.ok) throw new Error(`Nie udało się pobrać aut (${res.status})`)
  const { cars } = await res.json()

  // Tylko osobowe (type 1) — bez dostawczych i skuterów. Nieznany model
  // zostaje, żeby nowy typ w API nie znikał po cichu z mapy.
  const isPassenger = (car) => {
    const type = models.get(car.modelId)?.type
    return type == null || type === 1
  }

  return cars.filter(isPassenger).map((car) => ({
    ...car,
    discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0),
  }))
}

export async function fetchHealth() {
  const res = await fetch('/api/health')
  return res.json()
}
