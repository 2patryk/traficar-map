import { Button } from '@/components/ui/button'
import { googleMapsUrl, formatDrive, formatZoneDistance } from '../utils/geo'
import type { DrivingRoute, ZoneProximity } from '../utils/geo'
import { formatElapsedExact } from '../utils/time'
import { formatPayout } from '../utils/payout'
import type { Car } from '../types/api'

// Ta sama stała co w utils/payout.js (premia za relokację) — używana tu
// tylko do wyświetlenia rozbicia, nie do przeliczenia zwrotu.
const RELOCATION_BONUS = 30

interface CarDetailProps {
  car: Car
  payout: number | null
  route: DrivingRoute | null
  proximity: ZoneProximity | null
  modelName: string | null
  onClose: () => void
  onShowHistory: () => void
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function NavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M12 2L19 21l-7-4-7 4L12 2z" strokeLinejoin="round" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 12V6m0 6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CarDetail({ car, payout, route, proximity, modelName, onClose, onShowHistory }: CarDetailProps) {
  const zoneText =
    proximity == null
      ? null
      : proximity.km === 0
        ? 'w strefie'
        : route
          ? `${formatDrive(route)} do strefy`
          : formatZoneDistance(proximity.km)

  return (
    <div className="list-pane">
      <div className="history-header">
        <button type="button" className="icon-button" onClick={onClose} title="Wróć">
          <BackIcon />
        </button>
        <strong>{car.regPlate}</strong>
        <span className="font-mono text-xs text-muted-foreground">#{car.sideNumber}</span>
        {modelName && <span className="ml-auto text-sm text-muted-foreground">{modelName}</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div>
          <div
            className={`font-mono text-4xl font-bold tabular-nums ${
              payout == null ? 'text-muted-foreground' : payout > 0 ? 'text-money' : 'text-money-negative'
            }`}
          >
            {payout != null ? formatPayout(payout) : car.discountSum ? `${car.discountSum} zł` : '—'}
          </div>
          {payout != null && route && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatPayout(RELOCATION_BONUS)} premii − {formatPayout(RELOCATION_BONUS - payout)} kosztu przejazdu
              ({formatDrive(route)})
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Lokalizacja</dt>
            <dd className="text-foreground">{car.location}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Stoi od</dt>
            <dd className="font-mono text-foreground">{formatElapsedExact(car.parkedSince)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paliwo</dt>
            <dd className="font-mono text-foreground">{car.fuel}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Zasięg</dt>
            <dd className="font-mono text-foreground">{car.range} km</dd>
          </div>
          {zoneText && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Strefa relokacji</dt>
              <dd className="font-mono text-accent">{zoneText}</dd>
            </div>
          )}
          {car.discounts.length > 0 && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Rabaty</dt>
              <dd className="text-foreground">
                {car.discounts.map((d, i) => (
                  <div key={i} className="flex justify-between gap-2 font-mono">
                    <span>
                      {d.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">od {formatElapsedExact(d.since)}</span>
                    </span>
                    <span className="whitespace-nowrap">{d.amount} zł</span>
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto flex flex-col gap-2">
          <Button
            className="h-12 rounded-xl text-base font-semibold"
            render={<a href={googleMapsUrl(car.lat, car.lng)} target="_blank" rel="noreferrer" />}
          >
            <NavIcon />
            Nawiguj
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onShowHistory}>
            <HistoryIcon />
            Historia auta
          </Button>
        </div>
      </div>
    </div>
  )
}
