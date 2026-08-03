import type { ReactNode } from 'react'
import { Drawer, DrawerContent } from '@/components/ui/drawer'

// peek / ¼ / ½ / ¾ / full — dodatkowe przystanki między peek/½/full z
// PLAN-REDESIGN. Base UI wybiera po puszczeniu najbliższy punkt do pozycji
// (plus niewielki boost od prędkości) — przy tylko trzech, szeroko
// rozstawionych punktach trzeba było przeciągnąć niemal do połowy dystansu,
// inaczej sheet wracał do startu. Gęstsza siatka obniża ten próg.
const SNAP_POINTS = [0.12, 0.3, 0.5, 0.72, 0.95]

interface CarSheetProps {
  children: ReactNode
  snapPoint: number
  onSnapPointChange: (snapPoint: number) => void
}

// Trwały dolny sheet (mobile) — nigdy się nie zamyka, tylko zmienia snap.
// Uchwyt przeciągania jest osobnym elementem (DrawerSwipeHandle), ale
// data-base-ui-swipe-ignore leży teraz na samych scrollowalnych listach
// (.car-list, CarDetail) zamiast na całym children — dzięki temu górna część
// panelu (pasek sortowania, nagłówek) też łapie gest przeciągania, tak jak
// intuicyjnie próbuje to robić kciuk, zamiast tylko wąskiego uchwytu.
// snapPoint kontrolowany od góry — mapa musi znać wysokość sheetu, żeby
// fitBounds/flyTo nie centrowały punktów pod nim.
// snapToSequentialPoints: bez tego szybki swipe w dół ma twardy skrót w
// Base UI — "duża prędkość + ruch w dół = zamknij drawer" — który dla
// trwałego sheeta (nigdy się nie zamyka) zawsze kończył się wymuszonym
// powrotem na środkowy punkt. Tryb sekwencyjny liczy tylko realny dystans
// do najbliższego snap pointu, bez tego skrótu.
export function CarSheet({ children, snapPoint, onSnapPointChange }: CarSheetProps) {
  return (
    <Drawer
      open
      onOpenChange={() => {}}
      modal={false}
      disablePointerDismissal
      showSwipeHandle
      snapPoints={SNAP_POINTS}
      snapToSequentialPoints
      snapPoint={snapPoint}
      onSnapPointChange={(v) => onSnapPointChange((v as number | null) ?? SNAP_POINTS[2])}
    >
      <DrawerContent className="mx-auto max-w-none rounded-t-2xl border-t border-border bg-popover shadow-2xl focus:outline-none">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
