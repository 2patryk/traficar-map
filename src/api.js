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

export async function fetchCars(zoneId, discountTypes = ['Relokacja']) {
  // discountTypes = null → bez filtra, API zwraca wszystkie dostępne auta
  const params = new URLSearchParams({ zoneId })
  if (discountTypes?.length) {
    params.set('discounts', 'true')
    for (const type of discountTypes) params.append('discountType', type)
  }

  const res = await fetch(`${API_BASE}/cars?${params.toString()}`)
  if (!res.ok) throw new Error(`Nie udało się pobrać aut (${res.status})`)
  const { cars } = await res.json()

  return cars.map((car) => ({
    ...car,
    lat: parseFloat(car.lat),
    lng: parseFloat(car.lng),
    discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0),
  }))
}
