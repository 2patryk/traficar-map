import { useEffect } from 'react'
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsUrl } from '../utils/geo.js'

const ZONE_STYLE = {
  color: '#a78bfa',
  weight: 2,
  fillColor: '#8b5cf6',
  fillOpacity: 0.18,
}

function carIcon(amount) {
  return divIcon({
    className: 'car-pin-wrap',
    html: `<span class="car-pin">${amount} zł</span>`,
    iconSize: [0, 0],
    iconAnchor: [-4, 20],
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

export function CarMap({ cars, center, zoom = 13, userPosition, relocationZone, zoneId }) {
  return (
    <MapContainer center={center} zoom={zoom} className="car-map">
      <Recenter center={center} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {relocationZone && <GeoJSON key={zoneId} data={relocationZone} style={ZONE_STYLE} />}
      {userPosition && (
        <Marker position={[userPosition.lat, userPosition.lng]} icon={userIcon} zIndexOffset={1000} />
      )}
      {cars.map((car) => (
        <Marker key={car.id} position={[car.lat, car.lng]} icon={carIcon(car.discountSum)}>
          <Popup>
            <div className="popup">
              <strong>{car.regPlate}</strong>
              <br />
              {car.location}
              <br />
              Paliwo: {car.fuel}% · Zasięg: {car.range} km
              <br />
              Rabat: {car.discountSum} zł
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
