import { useMemo } from 'react'
import { formatDrive, formatZoneDistance, googleMapsUrl, haversineDistanceKm } from '../utils/geo.js'
import { formatElapsed } from '../utils/time.js'

function GoIcon() {
  return (
    <svg className="go-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CarList({ cars, origin, loading, showAll, zoneDistances, drivingRoutes, onSelect, selectedCarId }) {
  const sorted = useMemo(() => {
    if (!origin) return cars
    return [...cars].sort(
      (a, b) =>
        haversineDistanceKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineDistanceKm(origin.lat, origin.lng, b.lat, b.lng),
    )
  }, [cars, origin])

  if (loading && sorted.length === 0) {
    return <p className="loading-state">{showAll ? 'Szukam aut…' : 'Szukam aut z rabatem…'}</p>
  }

  if (sorted.length === 0) {
    return (
      <p className="empty-state">
        {showAll
          ? 'Brak dostępnych aut w tej strefie.'
          : 'Brak aut z rabatem Relokacja w tej strefie. Spróbuj innego miasta.'}
      </p>
    )
  }

  // Trasa autem gdy już policzona, wcześniej dystans w linii prostej
  const zoneLabel = (car) => {
    const prox = zoneDistances?.get(car.id)
    if (!prox) return null
    if (prox.km === 0) return 'w strefie'
    const route = drivingRoutes?.get(car.id)
    return route ? `${formatDrive(route)} do strefy` : formatZoneDistance(prox.km)
  }

  return (
    <ul className="car-list">
      {sorted.map((car) => (
        <li key={car.id}>
          <button
            type="button"
            className={`car-row${car.id === selectedCarId ? ' selected' : ''}`}
            onClick={() => onSelect?.(car)}
          >
            <div className="row-line">
              <span className={showAll && !car.discountSum ? 'chip time' : 'chip'}>
                {showAll ? formatElapsed(car.lastUpdate) : `${car.discountSum} zł`}
              </span>
              <span className="plate">{car.regPlate}</span>
              {origin && (
                <span className="distance">
                  {haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng).toFixed(1)} km
                </span>
              )}
              <span
                className="maps-link"
                role="link"
                tabIndex={0}
                title="Otwórz w Google Maps"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(googleMapsUrl(car.lat, car.lng), '_blank')
                }}
              >
                <GoIcon />
              </span>
            </div>
            <div className="row-line">
              <span className="location">{car.location}</span>
              {zoneLabel(car) && <span className="zone-route">{zoneLabel(car)}</span>}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
