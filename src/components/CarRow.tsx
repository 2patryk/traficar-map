import { formatElapsed } from '../utils/time'
import { formatPayout } from '../utils/payout'
import type { Car } from '../types/api'

interface CarRowProps {
  car: Car
  showAll: boolean
  payout: number | null
  distanceKm: number | null
  zoneLabel: string | null
  modelName: string | null
  selected: boolean
  onClick: () => void
}

// Zwrot netto — nie kwota rabatu — jest tu główną liczbą: to ona mówi, czy
// w ogóle opłaca się jechać. Rabat/czas postoju to tylko fallback, gdy
// trasa do strefy jeszcze nie policzona (albo auto bez rabatu w trybie "wszystkie").
export function CarRow({ car, showAll, payout, distanceKm, zoneLabel, modelName, selected, onClick }: CarRowProps) {
  const headline =
    payout != null
      ? formatPayout(payout)
      : car.discountSum
        ? `${car.discountSum} zł`
        : showAll
          ? formatElapsed(car.parkedSince)
          : '—'

  const headlineClass =
    payout != null
      ? payout > 0
        ? 'text-money'
        : 'text-money-negative'
      : 'text-muted-foreground'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        selected ? 'border-primary bg-secondary' : 'border-border bg-card hover:border-primary/50'
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className={`font-mono text-2xl font-bold tabular-nums ${headlineClass}`}>{headline}</span>
        <span className="font-mono text-sm font-semibold text-foreground">{car.regPlate}</span>
        <span className="font-mono text-xs text-muted-foreground">#{car.sideNumber}</span>
        {distanceKm != null && (
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
            {distanceKm.toFixed(1)} km
          </span>
        )}
      </div>
      {modelName && <div className="mt-0.5 text-xs text-muted-foreground">{modelName}</div>}
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{car.location}</span>
        {zoneLabel && (
          <span className="shrink-0 font-mono text-xs text-accent">{zoneLabel}</span>
        )}
      </div>
    </button>
  )
}
