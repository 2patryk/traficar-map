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
      <SelectTrigger className="h-11 rounded-xl border-border bg-secondary px-3 text-sm">
        <SelectValue placeholder="Wybierz miasto…">
          {(value: string | null) => zones.find((z) => String(z.id) === value)?.name ?? 'Wybierz miasto…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-40 rounded-xl border border-border p-1">
        {zones.map((zone) => (
          <SelectItem key={zone.id} value={String(zone.id)} className="rounded-lg py-2">
            {zone.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
