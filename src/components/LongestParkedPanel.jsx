import { useEffect, useState } from 'react'
import { fetchLongestParked } from '../api.js'
import { formatElapsed } from '../utils/time.js'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LongestParkedPanel({ zoneId, onSelect, onClose }) {
  const [cars, setCars] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setCars(null)
    setError(null)

    fetchLongestParked(zoneId)
      .then((result) => {
        if (!cancelled) setCars(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [zoneId])

  return (
    <div className="list-pane">
      <div className="history-header">
        <button type="button" className="icon-button" onClick={onClose} title="Wróć do listy">
          <BackIcon />
        </button>
        <strong>Najdłużej stoją</strong>
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
                <button type="button" className="car-row" onClick={() => onSelect(car)}>
                  <div className="row-line">
                    <span className="chip time">#{i + 1} · {formatElapsed(car.parkedSince)}</span>
                    <span className="plate">{car.regPlate}</span>
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
