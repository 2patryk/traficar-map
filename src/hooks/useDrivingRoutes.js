import { useEffect, useState } from 'react'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

// Cache na czas życia aplikacji — pozycja auta się nie zmienia, więc nie ma
// sensu pytać OSRM ponownie przy każdym 60-sekundowym odświeżeniu feedu.
const cache = new Map()

// Pełna geometria trasy (do narysowania na mapie) — [[lat,lng], ...] albo null
const geometryCache = new Map()

export async function fetchRouteGeometry(from, to) {
  const key = `${from.lat},${from.lng};${to.lat},${to.lng}`
  if (geometryCache.has(key)) return geometryCache.get(key)
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const coords = data.routes?.[0]?.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? null
  geometryCache.set(key, coords)
  return coords
}

// targets: [{ id, from: {lat,lng}, to: {lat,lng} }]
// Zwraca Map id -> { km, min }. Zapytania sekwencyjne — publiczny serwer
// demo OSRM, nie zalewamy go równoległymi requestami.
export function useDrivingRoutes(targets) {
  const [routes, setRoutes] = useState(() => new Map())

  useEffect(() => {
    if (targets.length === 0) return
    let cancelled = false

    ;(async () => {
      const next = new Map()
      let dirty = false
      for (const t of targets) {
        const key = `${t.id}:${t.from.lat.toFixed(5)},${t.from.lng.toFixed(5)}`
        if (!cache.has(key)) {
          try {
            const url = `${OSRM_BASE}/${t.from.lng},${t.from.lat};${t.to.lng},${t.to.lat}?overview=false`
            const res = await fetch(url)
            if (res.ok) {
              const data = await res.json()
              const route = data.routes?.[0]
              if (route) cache.set(key, { km: route.distance / 1000, min: route.duration / 60 })
            }
          } catch {
            // sieć/limit — pominięte auto pokaże dystans w linii prostej
          }
          if (cancelled) return
          dirty = true
        }
        if (cache.has(key)) next.set(t.id, cache.get(key))
        // Pokazuj wyniki przyrostowo, nie dopiero po całej serii
        if (dirty) setRoutes(new Map(next))
      }
      if (!cancelled) setRoutes(next)
    })()

    return () => {
      cancelled = true
    }
  }, [targets])

  return routes
}
