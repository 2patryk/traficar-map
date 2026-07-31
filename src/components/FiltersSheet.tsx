import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DEFAULT_FILTERS } from '../hooks/useFilters'
import type { Filters } from '../hooks/useFilters'
import type { CarModelType } from '../types/api'

const DISTANCE_CHIPS: { label: string; value: number | null }[] = [
  { label: '1 km', value: 1 },
  { label: '3 km', value: 3 },
  { label: '5 km', value: 5 },
  { label: '∞', value: null },
]

const CAR_TYPES: { type: CarModelType; label: string }[] = [
  { type: 1, label: 'Osobowe' },
  { type: 2, label: 'Dostawcze' },
  { type: 6, label: 'Skutery' },
]

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M4 5h16M7 12h10M11 19h2" strokeLinecap="round" />
    </svg>
  )
}

interface FiltersSheetProps {
  filters: Filters
  onChange: (filters: Filters) => void
  activeCount: number
  availableModels: { id: number; name: string }[]
}

export function FiltersSheet({ filters, onChange, activeCount, availableModels }: FiltersSheetProps) {
  // Przynajmniej jeden typ musi zostać zaznaczony — inaczej lista byłaby zawsze pusta
  const toggleType = (type: CarModelType) => {
    const has = filters.carTypes.includes(type)
    const next = has ? filters.carTypes.filter((t) => t !== type) : [...filters.carTypes, type]
    if (next.length > 0) onChange({ ...filters, carTypes: next })
  }

  // Pusta lista = bez filtra modelu, w odróżnieniu od typu auta
  const toggleModel = (id: number) => {
    const has = filters.modelIds.includes(id)
    const next = has ? filters.modelIds.filter((m) => m !== id) : [...filters.modelIds, id]
    onChange({ ...filters, modelIds: next })
  }

  return (
    <Drawer>
      <DrawerTrigger render={<Button type="button" variant="outline" className="relative h-11 rounded-xl px-3" />}>
        <FilterIcon />
        <span className="hidden sm:inline">Filtry</span>
        {activeCount > 0 && (
          <Badge className="absolute -top-1.5 -right-1.5 size-5 justify-center rounded-full p-0">
            {activeCount}
          </Badge>
        )}
      </DrawerTrigger>
      <DrawerContent className="mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-popover">
        <DrawerHeader>
          <DrawerTitle>Filtry</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-5 p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Tylko opłacalne (dodatni zwrot)</span>
            <input
              type="checkbox"
              checked={filters.payoutOnly}
              onChange={(e) => onChange({ ...filters, payoutOnly: e.target.checked })}
              className="size-5 accent-primary"
            />
          </label>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">Maks. dystans do mnie</p>
            <div className="flex gap-2">
              {DISTANCE_CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className={`sort-chip${filters.maxDistanceKm === c.value ? ' active' : ''}`}
                  onClick={() => onChange({ ...filters, maxDistanceKm: c.value })}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">Typ auta</p>
            <div className="flex gap-2">
              {CAR_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className={`sort-chip${filters.carTypes.includes(t.type) ? ' active' : ''}`}
                  onClick={() => toggleType(t.type)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {availableModels.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Model</p>
              <div className="flex flex-wrap gap-2">
                {availableModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`sort-chip${filters.modelIds.includes(m.id) ? ' active' : ''}`}
                    onClick={() => toggleModel(m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="flex-row gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onChange(DEFAULT_FILTERS)}>
            Wyczyść
          </Button>
          <DrawerClose render={<Button type="button" className="flex-1" />}>Gotowe</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
