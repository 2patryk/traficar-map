import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ZonePicker } from './ZonePicker'
import { FiltersSheet } from './FiltersSheet'
import type { Filters } from '../hooks/useFilters'
import type { Zone } from '../types/api'

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface TopbarProps {
  zones: Zone[]
  zoneId: string
  onZoneChange: (zoneId: string) => void
  view: 'map' | 'stats'
  onToggleView: () => void
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
  carCount: number
  lastUpdated: Date | null
  onRefresh: () => void
  refreshing: boolean
  filters: Filters
  onFiltersChange: (filters: Filters) => void
  filtersActiveCount: number
  availableModels: { id: number; name: string }[]
}

export function Topbar({
  zones,
  zoneId,
  onZoneChange,
  view,
  onToggleView,
  showAll,
  onShowAllChange,
  carCount,
  lastUpdated,
  onRefresh,
  refreshing,
  filters,
  onFiltersChange,
  filtersActiveCount,
  availableModels,
}: TopbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur-md sm:px-4">
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-heading text-lg font-bold tracking-wide uppercase">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-money" />
          Traficar · Relokacja
        </span>
        {lastUpdated && (
          <span className="font-mono text-xs text-muted-foreground">
            aktualizacja {lastUpdated.toLocaleTimeString('pl-PL')}
          </span>
        )}
      </div>

      {view === 'map' && (
        <span className="inline-flex h-11 shrink-0 items-center rounded-xl bg-primary/15 px-3 font-mono text-sm font-bold text-primary">
          {carCount} {showAll ? 'aut' : 'z rabatem'}
        </span>
      )}

      <ZonePicker zones={zones} zoneId={zoneId} onChange={onZoneChange} />

      {view === 'map' && (
        <ToggleGroup
          value={[showAll ? 'all' : 'discount']}
          onValueChange={(vals) => onShowAllChange(vals[0] === 'all')}
          className="h-11 gap-0 rounded-xl border border-border bg-secondary p-1"
        >
          <ToggleGroupItem value="discount" className="h-9 rounded-lg px-3 text-sm data-[pressed]:bg-primary data-[pressed]:text-primary-foreground">
            Z rabatem
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="h-9 rounded-lg px-3 text-sm data-[pressed]:bg-primary data-[pressed]:text-primary-foreground">
            Wszystkie
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {view === 'map' && (
        <FiltersSheet filters={filters} onChange={onFiltersChange} activeCount={filtersActiveCount} availableModels={availableModels} />
      )}

      <Button
        type="button"
        variant={view === 'stats' ? 'default' : 'outline'}
        className="h-11 rounded-xl px-3"
        onClick={onToggleView}
        title="Statystyki floty"
      >
        <StatsIcon />
        <span className="hidden sm:inline">Statystyki</span>
      </Button>

      {view === 'map' && (
        <Button
          type="button"
          className="h-11 rounded-xl px-3"
          onClick={onRefresh}
          disabled={!zoneId || refreshing}
          title="Odśwież"
        >
          <RefreshIcon className={`size-4${refreshing ? ' animate-spin' : ''}`} />
          <span className="hidden sm:inline">Odśwież</span>
        </Button>
      )}
    </div>
  )
}
