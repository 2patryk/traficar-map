import type { ReactNode } from 'react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

// peek / ½ / full — jak w PLAN-REDESIGN
const SNAP_POINTS = [0.12, 0.5, 0.95]

interface CarSheetProps {
  children: ReactNode
  snapPoint: number
  onSnapPointChange: (snapPoint: number) => void
}

// Trwały dolny sheet (mobile) — nigdy się nie zamyka, tylko zmienia snap.
// Uchwyt przeciągania jest osobnym elementem (DrawerSwipeHandle), a treść ma
// data-base-ui-swipe-ignore, żeby scroll listy nie był brany za gest resize.
// snapPoint kontrolowany od góry — mapa musi znać wysokość sheetu, żeby
// fitBounds/flyTo nie centrowały punktów pod nim.
export function CarSheet({ children, snapPoint, onSnapPointChange }: CarSheetProps) {
  return (
    <Drawer
      open
      onOpenChange={() => {}}
      modal={false}
      disablePointerDismissal
      showSwipeHandle
      snapPoints={SNAP_POINTS}
      snapPoint={snapPoint}
      onSnapPointChange={(v) => onSnapPointChange((v as number | null) ?? SNAP_POINTS[1])}
    >
      <DrawerContent className="mx-auto max-w-none rounded-t-2xl border-t border-border bg-popover shadow-2xl focus:outline-none">
        <div data-base-ui-swipe-ignore className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
