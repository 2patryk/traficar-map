import type { ReactNode } from 'react'
import { CarSheet } from './CarSheet'
import { useIsMobile } from '../hooks/useIsMobile'

interface AppShellProps {
  topbar: ReactNode
  statusStrip: ReactNode
  view: 'map' | 'stats'
  showMap: boolean
  stats: ReactNode
  map: ReactNode
  mapLayerControls: ReactNode
  panel: ReactNode
}

// Topbar zostaje w normalnym przepływie (wspólny dla map/stats), mapa
// wypełnia resztę viewportu. Sheet: Drawer na mobile, stały panel na desktopie
// (dawny .list-pane) — dokładnie ten sam `panel` w obu przypadkach.
export function AppShell({ topbar, statusStrip, view, showMap, stats, map, mapLayerControls, panel }: AppShellProps) {
  const isMobile = useIsMobile()

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      {topbar}
      {statusStrip}

      {view === 'stats' && stats}

      {view === 'map' && showMap && (
        <div className="relative min-h-0 flex-1">
          {/* z-0 (nie auto) zamyka wewnętrzne z-indexy Leaflet (kontrolki zoom,
              atrybucja idą do 1000) we własnym stacking contexcie — inaczej
              przebijały się nad panelem bocznym i sheetem */}
          <div className="absolute inset-0 z-0">{map}</div>
          {mapLayerControls}
          {isMobile ? (
            <CarSheet>{panel}</CarSheet>
          ) : (
            <aside className="absolute inset-y-0 right-0 z-20 flex w-[380px] flex-col border-l border-border bg-background">
              {panel}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
