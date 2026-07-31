import { useEffect, useState } from 'react'
import { fetchLongestParked } from '../api'
import { formatElapsed } from '../utils/time'
import type { RankedCar } from '../types/api'

interface RankingViewProps {
  zoneId: string
  order: 'asc' | 'desc'
  onOrderChange: (order: 'asc' | 'desc') => void
  selectedCarId: number | null
  onSelect: (car: RankedCar) => void
  onShowHistory?: (car: RankedCar) => void
  onClose: () => void
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
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

export function RankingView({ zoneId, order, onOrderChange, selectedCarId, onSelect, onShowHistory, onClose }: RankingViewProps) {
  const [cars, setCars] = useState<RankedCar[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCars(null)
    setError(null)

    fetchLongestParked(zoneId, 100, order)
      .then((result) => {
        if (!cancelled) setCars(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [zoneId, order])

  return (
    <div className="list-pane">
      <div className="history-header">
        <button type="button" className="icon-button" onClick={onClose} title="Wróć do listy">
          <BackIcon />
        </button>
        <strong>{order === 'desc' ? 'Najdłużej stoją' : 'Najkrócej stoją'}</strong>
        <button
          type="button"
          className="sort-toggle"
          onClick={() => onOrderChange(order === 'desc' ? 'asc' : 'desc')}
          title="Zmień kolejność sortowania"
        >
          {order === 'desc' ? 'najdłużej ↓' : 'najkrócej ↑'}
        </button>
      </div>

      {error && <p className="status-strip error">{error}</p>}
      {!error && !cars && <p className="loading-state">Wczytuję ranking…</p>}
      {cars && cars.length === 0 && <p className="empty-state">Brak aut w tej strefie.</p>}

      {cars && cars.length > 0 && (
        <ul className="car-list">
          {cars.map((car, i) => {
            const discountSum = (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0)
            return (
              <li key={car.id}>
                <button
                  type="button"
                  className={`car-row${car.id === selectedCarId ? ' selected' : ''}`}
                  onClick={() => onSelect(car)}
                >
                  <div className="row-line">
                    <span className="chip time">#{i + 1} · {formatElapsed(car.parkedSince)}</span>
                    <span className="plate">{car.regPlate}</span>
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
                    {discountSum > 0 && <span className="payout">{discountSum} zł</span>}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
