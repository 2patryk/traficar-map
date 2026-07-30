import { useEffect, useRef } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDrive, formatZoneDistance, googleMapsUrl } from '../utils/geo'
import type { DrivingRoute, LatLng, ZoneProximity } from '../utils/geo'
import { formatElapsed, formatElapsedExact } from '../utils/time'
import { formatPayout } from '../utils/payout'
import type { Car, HeatmapCell, HistoryTimelineParkingEntry, RankedCar, ZoneShape } from '../types/api'

type MapCar = Car | RankedCar

interface SelectedRoute {
  carId: number
  coords: number[][]
}

const ZONE_STYLE = {
  color: '#a78bfa',
  weight: 2,
  fillColor: '#8b5cf6',
  fillOpacity: 0.32,
}

function carIcon(car: MapCar, showAll: boolean) {
  // Bez rabatu "0 zł" nic nie mówi — pokazujemy czas postoju (dotyczy też auta
  // dorzuconego z rankingu, którego nie ma w przefiltrowanym feedzie)
  const discountSum = 'discountSum' in car ? car.discountSum : undefined
  const showTime = showAll || !discountSum
  const label = showTime ? formatElapsed(car.parkedSince) : `${discountSum} zł`
  const cls = showTime && !discountSum ? 'car-pin time' : 'car-pin'
  return divIcon({
    className: 'car-pin-wrap',
    html: `<span class="${cls}">${label}</span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

// Kropka historii z numerem kolejności przemieszczenia (1 = najstarszy postój)
function historyIcon(index: number) {
  return divIcon({
    className: 'history-pin-wrap',
    html: `<span class="history-pin">${index}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
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
function FitSelection({ route, car, expectRoute }: { route: SelectedRoute | null; car: MapCar | null; expectRoute: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (route?.coords?.length && route.carId === car?.id) {
      map.fitBounds(route.coords as [number, number][], { padding: [50, 50] })
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
function PopupSync({ selectedCarId, markerRefs }: { selectedCarId: number | null; markerRefs: React.RefObject<Map<number, LeafletMarker>> }) {
  useEffect(() => {
    for (const [id, marker] of markerRefs.current) {
      if (id !== selectedCarId && marker.isPopupOpen()) marker.closePopup()
    }
  }, [selectedCarId, markerRefs])
  return null
}

// Przy pierwszym załadowaniu danych dla strefy dopasuj widok tak, by objąć
// wszystkie auta — zamiast trzymać stały zoom, który przy dużych miastach
// pokazywał tylko fragment. Działa raz na zmianę strefy (ref po zoneKey),
// kolejne odświeżenia feedu (co 60 s) nie ruszają już kamery.
function FitCity({ cars, zoneKey }: { cars: MapCar[]; zoneKey: string }) {
  const map = useMap()
  const fitForRef = useRef<string | null>(null)
  useEffect(() => {
    if (fitForRef.current === zoneKey) return
    if (!cars.length) return
    map.fitBounds(
      cars.map((c) => [c.lat, c.lng] as [number, number]),
      { padding: [40, 40], maxZoom: 14 },
    )
    fitForRef.current = zoneKey
  }, [cars, zoneKey, map])
  return null
}

// Wejście w historię musi pokazać całą trasę — bez tego mapa zostawała tam,
// gdzie stała lista, a numerowane postoje mogły być poza kadrem
function FitHistory({ timeline }: { timeline: HistoryTimelineParkingEntry[] | null }) {
  const map = useMap()
  const points = timeline?.map((p) => [p.lat, p.lng] as [number, number])
  useEffect(() => {
    if (!points?.length) return
    if (points.length === 1) map.flyTo(points[0], 15, { duration: 0.5 })
    else map.fitBounds(points, { padding: [50, 50], maxZoom: 15 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- klucz na treści trasy, nie na nowej referencji tablicy z każdego rendera
  }, [timeline, map])
  return null
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 })
  }, [center, zoom, map])
  return null
}

interface CarMapProps {
  cars: MapCar[]
  center: [number, number]
  zoom?: number
  userPosition: LatLng | null
  relocationZone: ZoneShape | null
  relocationZoneVersion: number
  showAll: boolean
  zoneDistances: Map<number, ZoneProximity> | null
  drivingRoutes: Map<number, DrivingRoute> | null
  payouts: Map<number, number> | null
  selectedCar: MapCar | null
  selectedRoute: SelectedRoute | null
  onSelect?: (car: MapCar) => void
  onShowHistory?: (car: MapCar) => void
  historyTimeline: HistoryTimelineParkingEntry[] | null
  heatmapCells: HeatmapCell[] | null
  zoneKey: string
}

export function CarMap({ cars, center, zoom = 13, userPosition, relocationZone, relocationZoneVersion, showAll, zoneDistances, drivingRoutes, payouts, selectedCar, selectedRoute, onSelect, onShowHistory, historyTimeline, heatmapCells, zoneKey }: CarMapProps) {
  const markerRefs = useRef(new Map<number, LeafletMarker>())
  const maxHeatWeight = heatmapCells?.length ? Math.max(...heatmapCells.map((c) => c.minutesParked)) : 0

  const zoneLabel = (car: MapCar) => {
    const prox = zoneDistances?.get(car.id)
    if (!prox) return null
    if (prox.km === 0) return 'w strefie'
    const route = drivingRoutes?.get(car.id)
    return route ? `${formatDrive(route)} do strefy` : formatZoneDistance(prox.km)
  }

  return (
    <MapContainer center={center} zoom={zoom} className="car-map">
      <Recenter center={center} zoom={zoom} />
      <FitCity cars={cars} zoneKey={zoneKey} />
      <FitHistory timeline={historyTimeline} />
      <PopupSync selectedCarId={selectedCar?.id ?? null} markerRefs={markerRefs} />
      {selectedCar && (
        <FitSelection
          route={selectedRoute}
          car={selectedCar}
          expectRoute={Boolean(zoneDistances?.get(selectedCar.id)?.point)}
        />
      )}
      {selectedRoute && selectedRoute.carId === selectedCar?.id && (
        <Polyline positions={selectedRoute.coords as [number, number][]} pathOptions={ROUTE_STYLE} />
      )}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {relocationZone && (
        <GeoJSON key={relocationZoneVersion} data={relocationZone} style={ZONE_STYLE} />
      )}
      {heatmapCells?.map((cell, i) => (
        <CircleMarker
          key={`heat-${i}`}
          center={[cell.lat, cell.lng]}
          radius={14}
          pathOptions={{
            stroke: false,
            fillColor: '#8b5cf6',
            fillOpacity: Math.min(0.75, 0.1 + 0.65 * (cell.minutesParked / maxHeatWeight)),
          }}
        />
      ))}
      {historyTimeline && historyTimeline.length > 1 && (
        <Polyline
          positions={historyTimeline.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: '#d97706', weight: 3, dashArray: '6 5', opacity: 0.9 }}
        />
      )}
      {historyTimeline?.map((p, i) => (
        <Marker
          key={`hist-${i}`}
          position={[p.lat, p.lng]}
          icon={historyIcon(i + 1)}
          zIndexOffset={500}
        >
          <Popup>
            <div className="popup">
              #{i + 1} · {p.location ?? 'nieznana lokalizacja'}
              <br />
              {p.durationMin != null && `postój: ${p.durationMin} min`}
            </div>
          </Popup>
        </Marker>
      ))}
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
              {'discountSum' in car && car.discountSum ? (
                <>
                  Rabat: {car.discountSum} zł
                  <br />
                </>
              ) : null}
              Stoi od: {formatElapsedExact(car.parkedSince)}
              <br />
              {zoneLabel(car) && (
                <>
                  Strefa: {zoneLabel(car)}
                  <br />
                </>
              )}
              {payouts?.has(car.id) && (
                <>
                  Szac. zwrot: <strong>{formatPayout(payouts.get(car.id)!)}</strong>
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
              {onShowHistory && (
                <button
                  type="button"
                  className="nav-button"
                  onClick={() => onShowHistory(car)}
                >
                  Historia auta
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
