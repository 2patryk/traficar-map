import { useEffect } from 'react'
import { GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDrive, formatZoneDistance, googleMapsUrl } from '../utils/geo.js'
import { formatElapsed } from '../utils/time.js'

const ZONE_STYLE = {
  color: '#a78bfa',
  weight: 2,
  fillColor: '#8b5cf6',
  fillOpacity: 0.32,
}

function carIcon(car, showAll) {
  const label = showAll ? formatElapsed(car.lastUpdate) : `${car.discountSum} zł`
  const cls = showAll && !car.discountSum ? 'car-pin time' : 'car-pin'
  return divIcon({
    className: 'car-pin-wrap',
    html: `<span class="${cls}">${label}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

const userIcon = divIcon({
  className: 'user-pin-wrap',
  html: '<span class="user-dot-pulse"></span><span class="user-dot"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const ROUTE_STYLE = {
  color: '#7c3aed',
  weight: 4,
  opacity: 0.85,
  dashArray: '8 6',
}

// Po wyborze auta dopasuj widok: do trasy gdy jest, inaczej do samego auta
function FitSelection({ route, car }) {
  const map = useMap()
  useEffect(() => {
    if (route?.coords?.length) {
      map.fitBounds(route.coords, { padding: [50, 50] })
    } else if (car) {
      map.flyTo([car.lat, car.lng], 15, { duration: 0.5 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- klucz na id, nie referencjach:
    // feed odświeża się co 60 s i tworzy nowe obiekty, a mapa nie może wtedy skakać
  }, [route?.carId, car?.id, map])
  return null
}

function Recenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 })
  }, [center, zoom, map])
  return null
}

export function CarMap({ cars, center, zoom = 13, userPosition, relocationZone, relocationZoneVersion, showAll, zoneDistances, drivingRoutes, selectedCar, selectedRoute, onSelect }) {
  const zoneLabel = (car) => {
    const prox = zoneDistances?.get(car.id)
    if (!prox) return null
    if (prox.km === 0) return 'w strefie'
    const route = drivingRoutes?.get(car.id)
    return route ? `${formatDrive(route)} do strefy` : formatZoneDistance(prox.km)
  }

  return (
    <MapContainer center={center} zoom={zoom} className="car-map">
      <Recenter center={center} zoom={zoom} />
      {selectedCar && <FitSelection route={selectedRoute} car={selectedCar} />}
      {selectedRoute && <Polyline positions={selectedRoute.coords} pathOptions={ROUTE_STYLE} />}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {relocationZone && (
        <GeoJSON key={relocationZoneVersion} data={relocationZone} style={ZONE_STYLE} />
      )}
      {userPosition && (
        <Marker position={[userPosition.lat, userPosition.lng]} icon={userIcon} zIndexOffset={1000} />
      )}
      {cars.map((car) => (
        <Marker
          key={car.id}
          position={[car.lat, car.lng]}
          icon={carIcon(car, showAll)}
          eventHandlers={{ click: () => onSelect?.(car) }}
        >
          <Popup>
            <div className="popup">
              <strong>{car.regPlate}</strong>
              <br />
              {car.location}
              <br />
              Paliwo: {car.fuel}% · Zasięg: {car.range} km
              <br />
              {car.discountSum > 0 && (
                <>
                  Rabat: {car.discountSum} zł
                  <br />
                </>
              )}
              Bez zmian od: {formatElapsed(car.lastUpdate)}
              <br />
              {zoneLabel(car) && (
                <>
                  Strefa: {zoneLabel(car)}
                  <br />
                </>
              )}
              <a href={googleMapsUrl(car.lat, car.lng)} target="_blank" rel="noreferrer">
                Otwórz w Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
