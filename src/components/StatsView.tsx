import { useEffect, useMemo, useState } from 'react'
import { fetchStatsHistory, fetchStatsSummary } from '../api'
import type { StatsHistoryPoint, StatsSummary, Zone } from '../types/api'

interface StatsViewProps {
  zones: Zone[]
  zoneId: string
  onZoneChange: (zoneId: string) => void
}

const DAY_OPTIONS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7 dni' },
  { value: 30, label: '30 dni' },
]

function formatBucket(iso: string, days: number) {
  const d = new Date(iso)
  return days <= 1
    ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit' })
}

function ZoneChart({ series, days }: { series: StatsHistoryPoint[]; days: number }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const W = 640
  const H = 220
  const PAD = 32

  const maxVal = Math.max(1, ...series.flatMap((s) => [s.carsAvailable ?? 0, s.carsRelocation ?? 0]))
  const n = series.length

  const xAt = (i: number) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2))
  const yAt = (v: number) => H - PAD - (v / maxVal) * (H - PAD * 2)

  const pathFor = (key: 'carsAvailable' | 'carsRelocation') =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(s[key] ?? 0)}`).join(' ')

  if (n === 0) {
    return <p className="empty-state">Za mało danych — wróć za chwilę.</p>
  }

  return (
    <div className="stats-chart-wrap">
      <div className="stats-chart-toolbar">
        <div className="stats-legend">
          <span className="legend-item">
            <span className="legend-dot available" /> Dostępne
          </span>
          <span className="legend-item">
            <span className="legend-dot relocation" /> Z Relokacją
          </span>
        </div>
        <button type="button" className="sort-chip" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Pokaż wykres' : 'Pokaż jako tabelę'}
        </button>
      </div>

      {asTable ? (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Czas</th>
                <th>Dostępne</th>
                <th>Z Relokacją</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.bucket}>
                  <td>{formatBucket(s.bucket, days)}</td>
                  <td>{s.carsAvailable}</td>
                  <td>{s.carsRelocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="stats-chart"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * W
            const idx = Math.round(((x - PAD) / (W - PAD * 2)) * (n - 1))
            setHoverIdx(Math.min(n - 1, Math.max(0, idx)))
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="chart-axis" />
          <path d={pathFor('carsAvailable')} className="chart-line available" />
          <path d={pathFor('carsRelocation')} className="chart-line relocation" />

          {hoverIdx != null && (
            <>
              <line
                x1={xAt(hoverIdx)}
                y1={PAD}
                x2={xAt(hoverIdx)}
                y2={H - PAD}
                className="chart-crosshair"
              />
              <circle cx={xAt(hoverIdx)} cy={yAt(series[hoverIdx].carsAvailable ?? 0)} r="4" className="chart-dot available" />
              <circle cx={xAt(hoverIdx)} cy={yAt(series[hoverIdx].carsRelocation ?? 0)} r="4" className="chart-dot relocation" />
            </>
          )}
        </svg>
      )}

      {hoverIdx != null && !asTable && (
        <div className="chart-tooltip">
          {formatBucket(series[hoverIdx].bucket, days)} · dostępne: {series[hoverIdx].carsAvailable} ·
          {' '}z Relokacją: {series[hoverIdx].carsRelocation}
        </div>
      )}
    </div>
  )
}

export function StatsView({ zones, zoneId, onZoneChange }: StatsViewProps) {
  const [days, setDays] = useState(7)
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [history, setHistory] = useState<StatsHistoryPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStatsSummary(days)
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [days])

  useEffect(() => {
    if (!zoneId) return
    setHistory(null)
    fetchStatsHistory(zoneId, days)
      .then((data) => setHistory(data.series))
      .catch((err) => setError(err.message))
  }, [zoneId, days])

  const zoneName = useMemo(
    () => zones.find((z) => String(z.id) === String(zoneId))?.name ?? '',
    [zones, zoneId]
  )

  return (
    <div className="stats-view">
      <div className="stats-header">
        <h2>Statystyki floty</h2>
        <div className="list-toolbar">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`sort-chip${days === opt.value ? ' active' : ''}`}
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="status-strip error">{error}</p>}

      {summary && (
        <>
          <p className="history-total">
            Łącznie teraz: {summary.totals.carsAvailable} dostępnych, {summary.totals.carsRelocation} z rabatem Relokacja
          </p>
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Strefa</th>
                  <th>Dostępne</th>
                  <th>Z Relokacją</th>
                  <th>Śr. dostępne ({days}d)</th>
                  <th>Śr. z Relokacją ({days}d)</th>
                  <th>Suma rabatów teraz</th>
                </tr>
              </thead>
              <tbody>
                {summary.zones.map((z) => (
                  <tr
                    key={z.zoneId}
                    className={String(z.zoneId) === String(zoneId) ? 'selected-row' : ''}
                    onClick={() => onZoneChange(String(z.zoneId))}
                  >
                    <td>{z.name}</td>
                    <td>{z.carsAvailable ?? '—'}</td>
                    <td>{z.carsRelocation ?? '—'}</td>
                    <td>{z.avgAvailable ?? '—'}</td>
                    <td>{z.avgRelocation ?? '—'}</td>
                    <td>{z.relocationAmountSum ?? 0} zł</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="stats-zone-title">{zoneName || 'Wybierz strefę'} — w czasie</h3>
      {history ? <ZoneChart series={history} days={days} /> : <p className="loading-state">Wczytuję…</p>}
    </div>
  )
}
