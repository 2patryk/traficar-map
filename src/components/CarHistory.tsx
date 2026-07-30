import { useEffect, useState } from 'react'
import { fetchCarHistory } from '../api'
import { formatDurationMin } from '../utils/time'
import type { CarHistoryResponse, HistoryTimelineParkingEntry } from '../types/api'

interface CarHistoryProps {
  carId: number
  regPlate: string
  onClose: () => void
  onData?: (timeline: HistoryTimelineParkingEntry[] | null) => void
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CarHistory({ carId, regPlate, onClose, onData }: CarHistoryProps) {
  const [data, setData] = useState<CarHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(null)
    onData?.(null)

    fetchCarHistory(carId)
      .then((result) => {
        if (cancelled) return
        setData(result)
        onData?.(
          result.timeline
            .filter((e): e is HistoryTimelineParkingEntry => e.type === 'parking')
            .reverse(),
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
      onData?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onData ma stabilną tożsamość (setter z App), nie chcemy re-fetchować przy jego zmianie
  }, [carId])

  return (
    <div className="list-pane">
      <div className="history-header">
        <button type="button" className="icon-button" onClick={onClose} title="Wróć do listy">
          <BackIcon />
        </button>
        <strong>{regPlate}</strong>
        <span className="history-subtitle">historia z 30 dni</span>
      </div>

      {error && <p className="status-strip error">{error}</p>}
      {!error && !data && <p className="loading-state">Wczytuję historię…</p>}

      {data && (
        <>
          {data.totalKm > 0 && (
            <p className="history-total">Razem w linii prostej: {data.totalKm.toFixed(1)} km</p>
          )}
          {data.timeline.length === 0 ? (
            <p className="empty-state">Brak zarejestrowanych postojów w tym okresie.</p>
          ) : (
            <ul className="car-list history-list">
              {data.timeline.map((entry, i) => (
                <li key={i}>
                  {entry.type === 'parking' ? (
                    <div className="car-row history-row">
                      <div className="row-line">
                        <span className="chip time">{formatDurationMin(entry.durationMin)}</span>
                        <span className="location">{entry.location ?? 'nieznana lokalizacja'}</span>
                      </div>
                      <div className="row-line">
                        <span className="zone-route">
                          od {formatWhen(entry.from)}
                          {entry.to ? ` do ${formatWhen(entry.to)}` : ' · nadal tu stoi'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="car-row history-row history-trip">
                      <div className="row-line">
                        <span className="chip">przejazd</span>
                        <span className="location">{entry.km?.toFixed(1)} km w linii prostej</span>
                      </div>
                      <div className="row-line">
                        <span className="zone-route">{formatWhen(entry.from)}</span>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
