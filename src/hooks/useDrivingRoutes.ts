import { useEffect, useState } from 'react'
import { isInsideZone, zoneProximity } from '../utils/geo'
import type { DrivingRoute, LatLng } from '../utils/geo'
import type { ZoneShape } from '../types/api'

export interface RouteTarget {
  id: number
  from: LatLng
  candidates: LatLng[]
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_TABLE = 'https://router.project-osrm.org/table/v1/driving'

// Cache na czas życia aplikacji — pozycja auta się nie zmienia, więc nie ma
// sensu pytać OSRM ponownie przy każdym 60-sekundowym odświeżeniu feedu.
const cache = new Map<string, DrivingRoute>()

// Pełna geometria trasy (do narysowania na mapie) — [[lat,lng], ...] albo null
const geometryCache = new Map<string, number[][] | null>()

export async function fetchRouteGeometry(from: LatLng, to: LatLng): Promise<number[][] | null> {
  const key = `${from.lat},${from.lng};${to.lat},${to.lng}`
  if (geometryCache.has(key)) return geometryCache.get(key) ?? null
  // alternatives: OSRM domyślnie optymalizuje czas — bierzemy najkrótszą
  // dystansem spośród zaproponowanych wariantów
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=3`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const shortest = (data.routes ?? []).reduce(
    (best: { distance: number; geometry: { coordinates: number[][] } } | null, r: { distance: number; geometry: { coordinates: number[][] } }) =>
      !best || r.distance < best.distance ? r : best,
    null,
  )
  const coords = shortest?.geometry?.coordinates?.map(([lng, lat]: number[]) => [lat, lng]) ?? null
  geometryCache.set(key, coords)
  return coords
}

// Jedno zapytanie OSRM table: czasy/dystanse z auta do wszystkich kandydatów
// naraz. Preferuje kandydatów, których pozycja PO snapie do drogi nadal leży
// w strefie (snap potrafi uciec za granicę); fallback: najszybszy ogólnie.
// Zwraca najszybszy wjazd: { km, min, to } albo null.
async function fetchBestEntry(
  from: LatLng,
  candidates: LatLng[],
  zoneGeo: ZoneShape | null,
): Promise<DrivingRoute | null> {
  const coords = [from, ...candidates].map((p) => `${p.lng},${p.lat}`).join(';')
  const res = await fetch(`${OSRM_TABLE}/${coords}?sources=0&annotations=duration,distance`)
  if (!res.ok) return null
  const data = await res.json()
  const durations = data.durations?.[0]
  const distances = data.distances?.[0]
  if (!durations || !distances) return null

  interface Entry {
    duration: number
    distance: number
    to: LatLng
  }

  let bestInside: Entry | null = null
  let bestAny: Entry | null = null
  // Wybór po NAJKRÓTSZYM dystansie (nie czasie) — zwrot za relokację liczy
  // się od kilometrów, remis rozstrzyga czas
  const better = (a: Entry, b: Entry | null) =>
    !b || a.distance < b.distance || (a.distance === b.distance && a.duration < b.duration)
  // Indeks 0 to samo auto (source) — pomijamy
  for (let i = 1; i < durations.length; i++) {
    if (durations[i] == null || distances[i] == null) continue
    const entry: Entry = { duration: durations[i], distance: distances[i], to: candidates[i - 1] }
    if (better(entry, bestAny)) bestAny = entry
    // Tolerancja 150 m: snap kandydata granicznego ląduje na drodze biegnącej
    // po granicy — geometrycznie o włos "poza" strefą, praktycznie wjazd OK
    const snapped = data.destinations?.[i]?.location
    const snappedOk =
      snapped && zoneGeo
        ? isInsideZone(snapped[1], snapped[0], zoneGeo) ||
          (zoneProximity(snapped[1], snapped[0], zoneGeo)?.km ?? Infinity) < 0.15
        : false
    if (snappedOk && better(entry, bestInside)) bestInside = entry
  }
  const best = bestInside ?? bestAny
  return best ? { km: best.distance / 1000, min: best.duration / 60, to: best.to } : null
}

// Zwraca Map id -> { km, min, to }. Zapytania sekwencyjne — publiczny serwer
// demo OSRM, nie zalewamy go równoległymi requestami.
export function useDrivingRoutes(targets: RouteTarget[], zoneGeo: ZoneShape | null) {
  const [routes, setRoutes] = useState<Map<number, DrivingRoute>>(() => new Map())

  useEffect(() => {
    if (targets.length === 0) return
    let cancelled = false

    ;(async () => {
      const next = new Map<number, DrivingRoute>()
      let dirty = false
      for (const t of targets) {
        const key = `${t.id}:${t.from.lat.toFixed(5)},${t.from.lng.toFixed(5)}`
        if (!cache.has(key)) {
          try {
            const best = await fetchBestEntry(t.from, t.candidates, zoneGeo)
            if (best) cache.set(key, best)
          } catch {
            // sieć/limit — pominięte auto pokaże dystans w linii prostej
          }
          if (cancelled) return
          dirty = true
        }
        const cached = cache.get(key)
        if (cached) next.set(t.id, cached)
        // Pokazuj wyniki przyrostowo, nie dopiero po całej serii
        if (dirty) setRoutes(new Map(next))
      }
      if (!cancelled) setRoutes(next)
    })()

    return () => {
      cancelled = true
    }
  }, [targets, zoneGeo])

  return routes
}
