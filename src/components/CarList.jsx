import { useMemo } from 'react'
import { googleMapsUrl, haversineDistanceKm } from '../utils/geo.js'

export function CarList({ cars, origin }) {
  const sorted = useMemo(() => {
    if (!origin) return cars
    return [...cars].sort(
      (a, b) =>
        haversineDistanceKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineDistanceKm(origin.lat, origin.lng, b.lat, b.lng),
    )
  }, [cars, origin])

  if (sorted.length === 0) {
    return <p className="empty-state">Brak aut z rabatem Relokacja w tej strefie.</p>
  }

  return (
    <ul className="car-list">
      {sorted.map((car) => (
        <li key={car.id}>
          <button type="button" onClick={() => window.open(googleMapsUrl(car.lat, car.lng), '_blank')}>
            <span className="badge">{car.discountSum} zł</span>
            <span className="plate">{car.regPlate}</span>
            <span className="location">{car.location}</span>
            {origin && (
              <span className="distance">
                {haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng).toFixed(1)} km
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
