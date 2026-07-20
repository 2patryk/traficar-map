import { useEffect, useRef } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDrive, formatZoneDistance, googleMapsUrl } from '../utils/geo.js'
import { formatElapsed, formatElapsedExact } from '../utils/time.js'
import { formatPayout } from '../utils/payout.js'

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

// Po wyborze auta dopasuj widok: do trasy gdy jest (lub nadejdzie za moment),
// inaczej do samego auta. `expectRoute` zapobiega dwustopniowemu zoomowi:
// nie robimy flyTo do auta, skoro zaraz i tak przyjdzie fitBounds trasy.
function FitSelection({ route, car, expectRoute }) {
  const map = useMap()
  useEffect(() => {
    if (route?.coords?.length && route.carId === car?.id) {
      map.fitBounds(route.coords, { padding: [50, 50] })
    } else if (car && !expectRoute) {
      map.flyTo([car.lat, car.lng], 15, { duration: 0.5 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- klucz na id, nie referencjach:
    // feed odświeża się co 60 s i tworzy nowe obiekty, a mapa nie może wtedy skakać
  }, [route?.carId, car?.id, expectRoute, map])
  return null
}

// Zamyka popupy nieaktualnych markerów przy zmianie zaznaczenia. Popup otwiera
// wyłącznie klik w pinezkę (natywnie Leaflet) — wybór z listy tylko zaznacza;
// popup klikniętej wcześniej pinezki nie może wisieć ze starymi danymi.
function PopupSync({ selectedCarId, markerRefs }) {
  useEffect(() => {
    for (const [id, marker] of markerRefs.current) {
      if (id !== selectedCarId && marker.isPopupOpen()) marker.closePopup()
    }
  }, [selectedCarId, markerRefs])
  return null
}

function Recenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 })
  }, [center, zoom, map])
  return null
}

export function CarMap({ cars, center, zoom = 13, userPosition, relocationZone, relocationZoneVersion, showAll, zoneDistances, drivingRoutes, payouts, selectedCar, selectedRoute, debugCandidates, bestEntry, onSelect }) {
  const markerRefs = useRef(new Map())

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
      <PopupSync selectedCarId={selectedCar?.id ?? null} markerRefs={markerRefs} />
      {selectedCar && (
        <FitSelection
          route={selectedRoute}
          car={selectedCar}
          expectRoute={Boolean(zoneDistances?.get(selectedCar.id)?.point)}
        />
      )}
      {selectedRoute && selectedRoute.carId === selectedCar?.id && (
        <Polyline positions={selectedRoute.coords} pathOptions={ROUTE_STYLE} />
      )}
      {/* Debug: próbkowani kandydaci wjazdu (pomarańczowe), zwycięzca (zielony) */}
      {debugCandidates?.map((p, i) => (
        <CircleMarker
          key={`cand-${i}`}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.7, weight: 1 }}
        />
      ))}
      {bestEntry && (
        <CircleMarker
          center={[bestEntry.lat, bestEntry.lng]}
          radius={8}
          pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.9, weight: 2 }}
        />
      )}
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
          ref={(el) => {
            if (el) markerRefs.current.set(car.id, el)
            else markerRefs.current.delete(car.id)
          }}
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
              Bez zmian od: {formatElapsedExact(car.lastUpdate)}
              <br />
              {zoneLabel(car) && (
                <>
                  Strefa: {zoneLabel(car)}
                  <br />
                </>
              )}
              {payouts?.has(car.id) && (
                <>
                  Szac. zwrot: <strong>{formatPayout(payouts.get(car.id))}</strong>
                  <br />
                </>
              )}
              <a
                className="nav-button"
                href={googleMapsUrl(car.lat, car.lng)}
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L19 21l-7-4-7 4L12 2z" strokeLinejoin="round" />
                </svg>
                Otwórz w Google Maps
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
