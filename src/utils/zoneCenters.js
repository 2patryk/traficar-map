// Traficar's /zones endpoint returns a service-area centroid, not the city
// center — for some cities (e.g. Łódź) that point lands far from downtown.
// Override with the real city-center coordinates where it matters.
export const ZONE_CENTER_OVERRIDES = {
  Kraków: { lat: 50.0619, lng: 19.9368 },
  Warszawa: { lat: 52.2297, lng: 21.0122 },
  Wrocław: { lat: 51.1079, lng: 17.0385 },
  Poznań: { lat: 52.4064, lng: 16.9252 },
  Trójmiasto: { lat: 54.352, lng: 18.6466 },
  Śląsk: { lat: 50.2649, lng: 19.0238 },
  Lublin: { lat: 51.2465, lng: 22.5684 },
  Łódź: { lat: 51.7592, lng: 19.456 },
  Szczecin: { lat: 53.4285, lng: 14.5528 },
  Rzeszów: { lat: 50.0413, lng: 21.9991 },
}

export function zoneCenter(zone) {
  if (!zone) return null
  return ZONE_CENTER_OVERRIDES[zone.name] ?? { lat: parseFloat(zone.lat), lng: parseFloat(zone.lng) }
}
