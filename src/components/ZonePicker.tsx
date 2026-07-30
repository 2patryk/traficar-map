import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Zone } from '../types/api'

interface ZonePickerProps {
  zones: Zone[]
  zoneId: string
  onChange: (zoneId: string) => void
}

export function ZonePicker({ zones, zoneId, onChange }: ZonePickerProps) {
  return (
    <Select value={zoneId} onValueChange={(value) => onChange(value ?? '')}>
      <SelectTrigger className="h-11 min-w-28 rounded-xl border-border bg-secondary px-3 text-sm">
        <SelectValue placeholder="Wybierz miasto…">
          {(value: string | null) => zones.find((z) => String(z.id) === value)?.name ?? 'Wybierz miasto…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {zones.map((zone) => (
          <SelectItem key={zone.id} value={String(zone.id)}>
            {zone.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
