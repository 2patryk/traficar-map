import { useMemo } from 'react'
import { formatDrive, formatZoneDistance, googleMapsUrl, haversineDistanceKm } from '../utils/geo'
import type { DrivingRoute, LatLng, ZoneProximity } from '../utils/geo'
import { formatElapsed } from '../utils/time'
import { formatPayout } from '../utils/payout'
import type { Car } from '../types/api'

type SortId = 'distance' | 'discount' | 'payout' | 'zone' | 'stale'

interface CarListProps {
  cars: Car[]
  origin: LatLng | null
  loading: boolean
  showAll: boolean
  zoneDistances: Map<number, ZoneProximity> | null
  drivingRoutes: Map<number, DrivingRoute> | null
  payouts: Map<number, number> | null
  onSelect?: (car: Car) => void
  onShowHistory?: (car: Car) => void
  selectedCarId: number | null
  sortBy: SortId
  onSortChange: (sortBy: SortId) => void
}

function GoIcon() {
  return (
    <svg className="go-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg className="go-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 12V6m0 6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SORTS: { id: SortId; label: string; showAllOnly?: boolean }[] = [
  { id: 'distance', label: 'Najbliżej mnie' },
  { id: 'discount', label: 'Kwota rabatów' },
  { id: 'payout', label: 'Szac. zwrot' },
  { id: 'zone', label: 'Blisko strefy' },
  { id: 'stale', label: 'Najdłużej stoi', showAllOnly: true },
]

export function CarList({ cars, origin, loading, showAll, zoneDistances, drivingRoutes, payouts, onSelect, onShowHistory, selectedCarId, sortBy, onSortChange }: CarListProps) {
  // "Najdłużej stoi" ma sens tylko przy widoku wszystkich aut — poza nim wróć do domyślnego
  const activeSort: SortId = sortBy === 'stale' && !showAll ? 'distance' : sortBy

  const sorted = useMemo(() => {
    const distTo = (car: Car) =>
      origin ? haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng) : 0
    // Auta bez wartości sortowanej lądują na końcu
    const zoneKm = (car: Car) => {
      const prox = zoneDistances?.get(car.id)
      if (!prox) return Infinity
      return drivingRoutes?.get(car.id)?.km ?? prox.km
    }
    const payout = (car: Car) => (payouts?.has(car.id) ? payouts.get(car.id)! : -Infinity)

    const cmp: Record<SortId, (a: Car, b: Car) => number> = {
      distance: (a, b) => distTo(a) - distTo(b),
      discount: (a, b) => (b.discountSum ?? 0) - (a.discountSum ?? 0) || distTo(a) - distTo(b),
      payout: (a, b) => payout(b) - payout(a) || distTo(a) - distTo(b),
      zone: (a, b) => zoneKm(a) - zoneKm(b) || distTo(a) - distTo(b),
      stale: (a, b) => Date.parse(a.parkedSince) - Date.parse(b.parkedSince),
    }

    return [...cars].sort(cmp[activeSort])
  }, [cars, origin, activeSort, zoneDistances, drivingRoutes, payouts])

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
  const zoneLabel = (car: Car) => {
    const prox = zoneDistances?.get(car.id)
    if (!prox) return null
    if (prox.km === 0) return 'w strefie'
    const route = drivingRoutes?.get(car.id)
    return route ? `${formatDrive(route)} do strefy` : formatZoneDistance(prox.km)
  }

  return (
    <div className="list-pane">
      <div className="list-toolbar" role="tablist" aria-label="Sortowanie">
        {SORTS.filter((s) => !s.showAllOnly || showAll).map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={activeSort === s.id}
            className={`sort-chip${activeSort === s.id ? ' active' : ''}`}
            onClick={() => onSortChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
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
                {showAll ? formatElapsed(car.parkedSince) : `${car.discountSum} zł`}
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
              {onShowHistory && (
                <span
                  className="maps-link"
                  role="link"
                  tabIndex={0}
                  title="Historia auta"
                  onClick={(e) => {
                    e.stopPropagation()
                    onShowHistory(car)
                  }}
                >
                  <HistoryIcon />
                </span>
              )}
            </div>
            <div className="row-line">
              <span className="location">{car.location}</span>
              {payouts?.has(car.id) && (
                <span className={`payout${payouts.get(car.id)! > 0 ? '' : ' negative'}`}>
                  {formatPayout(payouts.get(car.id)!)}
                </span>
              )}
              {zoneLabel(car) && <span className="zone-route">{zoneLabel(car)}</span>}
            </div>
          </button>
        </li>
      ))}
      </ul>
    </div>
  )
}
