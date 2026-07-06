export function ZonePicker({ zones, zoneId, onChange }) {
  return (
    <select
      className="zone-picker"
      value={zoneId ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Wybierz miasto…
      </option>
      {zones.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.name}
        </option>
      ))}
    </select>
  )
}
