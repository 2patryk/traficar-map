import type { ZoneShape } from '../types/api'

export interface LatLng {
  lat: number
  lng: number
}

export interface ZoneProximity {
  km: number
  point?: LatLng
}

export interface DrivingRoute {
  km: number
  min: number
  to: LatLng
}

const EARTH_RADIUS_KM = 6371

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
// Bliskość punktu do strefy (GeoJSON Polygon/MultiPolygon, coords [lng, lat]).
// Wewnątrz → { km: 0 }. Na zewnątrz (także w "dziurze") → { km, point } gdzie
// `point` to najbliższy punkt na granicy. Brak/nieznany kształt → null.
export function zoneProximity(lat: number, lng: number, geo: ZoneShape | null): ZoneProximity | null {
  const polygons = toPolygons(geo)
  if (polygons.length === 0) return null

  if (insidePolygons(lat, lng, polygons)) return { km: 0 }

  // Rzut lokalny (equirectangular) — wystarczający przy dystansach miejskich
  const cosLat = Math.cos(toRad(lat))
  let min = Infinity
  let point: LatLng | undefined
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [km, t] = segmentDistanceKm(lat, lng, ring[i], ring[i + 1], cosLat)
        if (km < min) {
          min = km
          const [lngA, latA] = ring[i]
          const [lngB, latB] = ring[i + 1]
          point = { lat: latA + t * (latB - latA), lng: lngA + t * (lngB - lngA) }
        }
      }
    }
  }
  return { km: min, point }
}

type Ring = number[][]
type Polygon = Ring[]

function toPolygons(geo: ZoneShape | null | undefined): Polygon[] {
  if (!geo) return []
  return geo.type === 'MultiPolygon' ? geo.coordinates : geo.type === 'Polygon' ? [geo.coordinates] : []
}

function insidePolygons(lat: number, lng: number, polygons: Polygon[]) {
  return polygons.some(
    (rings) =>
      pointInRing(lat, lng, rings[0]) && !rings.slice(1).some((hole) => pointInRing(lat, lng, hole)),
  )
}

// Czy punkt leży w strefie — do walidacji pozycji po snapie OSRM
export function isInsideZone(lat: number, lng: number, geo: ZoneShape | null) {
  return insidePolygons(lat, lng, toPolygons(geo))
}

// Kandydaci na punkt wjazdu do strefy: środki krawędzi granicy w promieniu
// ~2.5× dystansu w prostej, wsunięte ~250 m W GŁĄB strefy (wzdłuż normalnej
// krawędzi; kierunek weryfikowany testem wnętrza, wklęsłości odpadają).
// Wsunięcie gwarantuje, że OSRM przyklei cel do drogi wewnątrz strefy, nie po
// złej stronie granicy. Do tego kilka punktów NA samej granicy (z najbliższym
// na czele) — łapią przypadki, gdzie droga wjazdowa biegnie wzdłuż granicy
// i wsunięci kandydaci ją omijają. OSRM table wybierze najszybszy dojazdem.
export function zoneEntryCandidates(
  lat: number,
  lng: number,
  geo: ZoneShape | null,
  maxCount = 15,
  insetKm = 0.25,
  boundaryCount = 5,
): LatLng[] | null {
  const prox = zoneProximity(lat, lng, geo)
  if (!prox?.point) return null

  const polygons = toPolygons(geo)
  const radiusKm = Math.max(prox.km * 2.5, prox.km + 2)
  const cosLat = Math.cos(toRad(lat))
  const degPerKmLat = 180 / (Math.PI * EARTH_RADIUS_KM)
  const degPerKmLng = degPerKmLat / cosLat

  const candidates: (LatLng & { d: number })[] = []
  const boundary: (LatLng & { d: number })[] = []
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lngA, latA] = ring[i]
        const [lngB, latB] = ring[i + 1]
        const mid = { lat: (latA + latB) / 2, lng: (lngA + lngB) / 2 }
        const d = haversineDistanceKm(lat, lng, mid.lat, mid.lng)
        if (d > radiusKm) continue
        boundary.push({ ...mid, d })

        // Jednostkowa normalna krawędzi w lokalnym rzucie
        const ex = (lngB - lngA) * cosLat
        const ey = latB - latA
        const len = Math.hypot(ex, ey)
        if (len === 0) continue
        const nx = -ey / len
        const ny = ex / len

        for (const sign of [1, -1]) {
          const cand = {
            lat: mid.lat + ny * sign * insetKm * degPerKmLat,
            lng: mid.lng + nx * sign * insetKm * degPerKmLng,
            d,
          }
          if (insidePolygons(cand.lat, cand.lng, polygons)) {
            candidates.push(cand)
            break
          }
        }
      }
    }
  }
  candidates.sort((a, b) => a.d - b.d)
  boundary.sort((a, b) => a.d - b.d)

  const minSepKm = Math.max(0.3, radiusKm / maxCount)
  const picked: LatLng[] = []
  const pickSpaced = (source: (LatLng & { d: number })[], limit: number) => {
    for (const c of source) {
      if (limit <= 0) break
      if (picked.every((p) => haversineDistanceKm(p.lat, p.lng, c.lat, c.lng) >= minSepKm)) {
        picked.push({ lat: c.lat, lng: c.lng })
        limit--
      }
    }
  }

  // Punkty na granicy najpierw (najbliższy zawsze wchodzi), potem wsunięci
  picked.push(prox.point)
  pickSpaced(boundary, boundaryCount - 1)
  pickSpaced(candidates, maxCount)

  return picked
}

function pointInRing(lat: number, lng: number, ring: Ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function segmentDistanceKm(
  lat: number,
  lng: number,
  [lngA, latA]: number[],
  [lngB, latB]: number[],
  cosLat: number,
): [number, number] {
  const ax = toRad(lngA - lng) * EARTH_RADIUS_KM * cosLat
  const ay = toRad(latA - lat) * EARTH_RADIUS_KM
  const bx = toRad(lngB - lng) * EARTH_RADIUS_KM * cosLat
  const by = toRad(latB - lat) * EARTH_RADIUS_KM
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq))
  const px = ax + t * dx
  const py = ay + t * dy
  return [Math.sqrt(px * px + py * py), t]
}

export function formatZoneDistance(km: number | null | undefined) {
  if (km == null) return null
  if (km === 0) return 'w strefie'
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m do strefy`
  return `${km.toFixed(1)} km do strefy`
}

// "2.4 km · 5 min" — trasa autem z OSRM
export function formatDrive(route: DrivingRoute) {
  const min = Math.round(route.min)
  const time = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`
  return `${route.km.toFixed(1)} km · ${time}`
}
