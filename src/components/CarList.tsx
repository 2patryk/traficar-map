import { useMemo, useState } from 'react'
import { formatDrive, formatZoneDistance, haversineDistanceKm } from '../utils/geo'
import type { DrivingRoute, LatLng, ZoneProximity } from '../utils/geo'
import { CarRow } from './CarRow'
import type { Car } from '../types/api'

type SortId = 'distance' | 'discount' | 'payout' | 'zone' | 'stale' | 'age'

const DEFAULT_SORT: SortId = 'distance'

interface CarListProps {
  cars: Car[]
  origin: LatLng | null
  loading: boolean
  showAll: boolean
  zoneDistances: Map<number, ZoneProximity> | null
  drivingRoutes: Map<number, DrivingRoute> | null
  payouts: Map<number, number> | null
  models?: Map<number, { name: string; type: number }> | null
  onSelect?: (car: Car) => void
  selectedCarId: number | null
  sortBy: SortId
  onSortChange: (sortBy: SortId) => void
}

const SORTS: { id: SortId; label: string; showAllOnly?: boolean }[] = [
  { id: 'distance', label: 'Najbliżej mnie' },
  { id: 'discount', label: 'Kwota rabatów' },
  { id: 'payout', label: 'Szac. zwrot' },
  { id: 'zone', label: 'Blisko strefy' },
  { id: 'stale', label: 'Najdłużej stoi', showAllOnly: true },
  { id: 'age', label: 'Najnowsze auto' },
]

// Numer boczny to 4-cyfrowy identyfikator floty — im wyższy, tym nowsze auto
export function carSideNumber(car: Car): number | null {
  const n = parseInt(car.sideNumber, 10)
  return Number.isFinite(n) ? n : null
}

export function CarList({ cars, origin, loading, showAll, zoneDistances, drivingRoutes, payouts, models, onSelect, selectedCarId, sortBy, onSortChange }: CarListProps) {
  // "Najdłużej stoi" ma sens tylko przy widoku wszystkich aut — poza nim wróć do domyślnego
  const activeSort: SortId = sortBy === 'stale' && !showAll ? 'distance' : sortBy
  const [dir, setDir] = useState<1 | -1>(1)

  // 1. klik: sortuj rosnąco · 2. klik: malejąco · 3. klik: wyjdź z filtra (wróć do domyślnego)
  const handleChipClick = (id: SortId) => {
    if (id !== activeSort) {
      setDir(1)
      onSortChange(id)
    } else if (dir === 1) {
      setDir(-1)
    } else {
      setDir(1)
      if (id !== DEFAULT_SORT) onSortChange(DEFAULT_SORT)
    }
  }

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
      age: (a, b) => (carSideNumber(b) ?? -Infinity) - (carSideNumber(a) ?? -Infinity) || distTo(a) - distTo(b),
    }

    return [...cars].sort((a, b) => cmp[activeSort](a, b) * dir)
  }, [cars, origin, activeSort, dir, zoneDistances, drivingRoutes, payouts])

  // Trasa autem gdy już policzona, wcześniej dystans w linii prostej
  const zoneLabel = (car: Car) => {
    const prox = zoneDistances?.get(car.id)
    if (!prox) return null
    if (prox.km === 0) return 'w strefie'
    const route = drivingRoutes?.get(car.id)
    return route ? `${formatDrive(route)} do strefy` : formatZoneDistance(prox.km)
  }

  const toolbar = (
    <div className="list-toolbar" role="tablist" aria-label="Sortowanie">
      {SORTS.filter((s) => !s.showAllOnly || showAll).map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={activeSort === s.id}
          className={`sort-chip${activeSort === s.id ? ' active' : ''}`}
          onClick={() => handleChipClick(s.id)}
        >
          {s.label}
          {activeSort === s.id && <span className="ml-1">{dir === 1 ? '↑' : '↓'}</span>}
        </button>
      ))}
    </div>
  )

  if (loading && sorted.length === 0) {
    return (
      <div className="list-pane">
        {toolbar}
        <p className="loading-state">{showAll ? 'Szukam aut…' : 'Szukam aut z rabatem…'}</p>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="list-pane">
        {toolbar}
        <p className="empty-state">
          {showAll
            ? 'Brak dostępnych aut w tej strefie.'
            : 'Brak aut z rabatem Relokacja w tej strefie. Spróbuj innego miasta.'}
        </p>
      </div>
    )
  }

  return (
    <div className="list-pane">
      {toolbar}
      <ul className="car-list" data-base-ui-swipe-ignore>
        {sorted.map((car) => (
          <li key={car.id}>
            <CarRow
              car={car}
              showAll={showAll}
              payout={payouts?.get(car.id) ?? null}
              distanceKm={origin ? haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng) : null}
              zoneLabel={zoneLabel(car)}
              modelName={models?.get(car.modelId)?.name ?? null}
              selected={car.id === selectedCarId}
              onClick={() => onSelect?.(car)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
