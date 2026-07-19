const EARTH_RADIUS_KM = 6371

export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function googleMapsUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
// Bliskość punktu do strefy (GeoJSON Polygon/MultiPolygon, coords [lng, lat]).
// Wewnątrz → { km: 0 }. Na zewnątrz (także w "dziurze") → { km, point } gdzie
// `point` to najbliższy punkt na granicy. Brak/nieznany kształt → null.
export function zoneProximity(lat, lng, geo) {
  if (!geo) return null
  const polygons =
    geo.type === 'MultiPolygon' ? geo.coordinates : geo.type === 'Polygon' ? [geo.coordinates] : []
  if (polygons.length === 0) return null

  for (const rings of polygons) {
    if (pointInRing(lat, lng, rings[0]) && !rings.slice(1).some((hole) => pointInRing(lat, lng, hole))) {
      return { km: 0 }
    }
  }

  // Rzut lokalny (equirectangular) — wystarczający przy dystansach miejskich
  const cosLat = Math.cos(toRad(lat))
  let min = Infinity
  let point = null
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

function pointInRing(lat, lng, ring) {
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

function segmentDistanceKm(lat, lng, [lngA, latA], [lngB, latB], cosLat) {
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

export function formatZoneDistance(km) {
  if (km == null) return null
  if (km === 0) return 'w strefie'
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m do strefy`
  return `${km.toFixed(1)} km do strefy`
}

// "2.4 km · 5 min" — trasa autem z OSRM
export function formatDrive(route) {
  const min = Math.round(route.min)
  const time = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${min % 60}m`
  return `${route.km.toFixed(1)} km · ${time}`
}
