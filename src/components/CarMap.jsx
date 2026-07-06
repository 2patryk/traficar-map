import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsUrl } from '../utils/geo.js'

function carIcon(amount) {
  return divIcon({
    className: 'car-badge',
    html: `<span>${amount} zł</span>`,
    iconSize: [44, 28],
    iconAnchor: [22, 14],
  })
}

export function CarMap({ cars, center }) {
  return (
    <MapContainer center={center} zoom={13} className="car-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {cars.map((car) => (
        <Marker key={car.id} position={[car.lat, car.lng]} icon={carIcon(car.discountSum)}>
          <Popup>
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
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
