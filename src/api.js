const API_BASE = '/api/v1'

export async function fetchZones() {
  const res = await fetch(`${API_BASE}/zones`)
  if (!res.ok) throw new Error(`Nie udało się pobrać stref (${res.status})`)
  const { zones } = await res.json()
  return zones
}

export async function fetchCars(zoneId, discountTypes = ['Relokacja']) {
  const params = new URLSearchParams({ zoneId, discounts: 'true' })
  for (const type of discountTypes) params.append('discountType', type)

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
