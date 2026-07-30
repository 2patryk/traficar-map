import { Button } from '@/components/ui/button'

function HeatmapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M12 3c3 3 5 5.5 5 8.5A5 5 0 0 1 7 11.5C7 8.5 9 6 12 3z" strokeLinejoin="round" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6" />
    </svg>
  )
}

interface MapLayerControlsProps {
  heatmapOn: boolean
  onToggleHeatmap: () => void
  locating: boolean
  onRequestLocation: () => void
  disabled: boolean
}

// Pionowa kolumna floatujących przycisków nad mapą, nad sheetem (peek).
// Docelowo (etap 6) dojdzie strefa relokacji jako przełącznik warstwy.
export function MapLayerControls({ heatmapOn, onToggleHeatmap, locating, onRequestLocation, disabled }: MapLayerControlsProps) {
  return (
    <div className="pointer-events-auto absolute right-3 bottom-[max(14rem,16dvh)] z-20 flex flex-col gap-2 md:right-[calc(380px+0.75rem)] md:bottom-3">
      <Button
        type="button"
        size="icon"
        variant={heatmapOn ? 'default' : 'secondary'}
        className="size-11 rounded-full shadow-lg"
        onClick={onToggleHeatmap}
        disabled={disabled}
        title="Heatmapa długich postojów (30 dni)"
      >
        <HeatmapIcon />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className={`size-11 rounded-full shadow-lg${locating ? ' animate-pulse' : ''}`}
        onClick={onRequestLocation}
        title="Użyj mojej lokalizacji"
      >
        <LocationIcon />
      </Button>
    </div>
  )
}
