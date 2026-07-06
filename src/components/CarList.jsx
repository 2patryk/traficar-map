import { useMemo } from 'react'
import { googleMapsUrl, haversineDistanceKm } from '../utils/geo.js'

function GoIcon() {
  return (
    <svg className="go-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CarList({ cars, origin, loading }) {
  const sorted = useMemo(() => {
    if (!origin) return cars
    return [...cars].sort(
      (a, b) =>
        haversineDistanceKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineDistanceKm(origin.lat, origin.lng, b.lat, b.lng),
    )
  }, [cars, origin])

  if (loading && sorted.length === 0) {
    return <p className="loading-state">Szukam aut z rabatem…</p>
  }

  if (sorted.length === 0) {
    return <p className="empty-state">Brak aut z rabatem Relokacja w tej strefie. Spróbuj innego miasta.</p>
  }

  return (
    <ul className="car-list">
      {sorted.map((car) => (
        <li key={car.id}>
          <button
            type="button"
            className="car-row"
            onClick={() => window.open(googleMapsUrl(car.lat, car.lng), '_blank')}
          >
            <span className="chip">{car.discountSum} zł</span>
            <span className="plate">{car.regPlate}</span>
            <span className="location">{car.location}</span>
            {origin && (
              <span className="distance">
                {haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng).toFixed(1)} km
              </span>
            )}
            <GoIcon />
          </button>
        </li>
      ))}
    </ul>
  )
}
