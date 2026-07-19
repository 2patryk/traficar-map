import { useEffect } from 'react'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsUrl } from '../utils/geo.js'
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

function Recenter({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 })
  }, [center, zoom, map])
  return null
}

export function CarMap({ cars, center, zoom = 13, userPosition, relocationZone, relocationZoneVersion, showAll }) {
  return (
    <MapContainer center={center} zoom={zoom} className="car-map">
      <Recenter center={center} zoom={zoom} />
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
        <Marker key={car.id} position={[car.lat, car.lng]} icon={carIcon(car, showAll)}>
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
