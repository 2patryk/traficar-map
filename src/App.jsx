import { useEffect, useMemo, useState } from 'react'
import { fetchZones } from './api.js'
import { useCars } from './hooks/useCars.js'
import { useGeolocation } from './hooks/useGeolocation.js'
import { ZonePicker } from './components/ZonePicker.jsx'
import { CarMap } from './components/CarMap.jsx'
import { CarList } from './components/CarList.jsx'
import './App.css'

const ZONE_STORAGE_KEY = 'traficar-map:zoneId'
const DISCOUNT_TYPES = ['Relokacja']

function App() {
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState(() => localStorage.getItem(ZONE_STORAGE_KEY) ?? '')
  const [zonesError, setZonesError] = useState(null)

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err) => setZonesError(err.message))
  }, [])

  useEffect(() => {
    if (zoneId) localStorage.setItem(ZONE_STORAGE_KEY, zoneId)
  }, [zoneId])

  const { cars, loading, error, refresh } = useCars(zoneId, DISCOUNT_TYPES)
  const { position, denied } = useGeolocation()

  const zone = useMemo(() => zones.find((z) => String(z.id) === String(zoneId)), [zones, zoneId])
  const origin = position ?? (zone ? { lat: parseFloat(zone.lat), lng: parseFloat(zone.lng) } : null)
  const center = origin ? [origin.lat, origin.lng] : [52.2297, 21.0122]

  return (
    <div className="app">
      <header className="app-header">
        <h1>Traficar — rabat Relokacja</h1>
        <ZonePicker zones={zones} zoneId={zoneId} onChange={setZoneId} />
        <button type="button" onClick={refresh} disabled={!zoneId || loading}>
          {loading ? 'Odświeżanie…' : 'Odśwież'}
        </button>
      </header>

      {zonesError && <p className="error">{zonesError}</p>}
      {error && <p className="error">{error}</p>}
      {!zoneId && <p className="empty-state">Wybierz miasto, aby zobaczyć auta.</p>}
      {denied && <p className="hint">Brak dostępu do lokalizacji — sortowanie od centrum strefy.</p>}

      {zoneId && (
        <main className="app-main">
          <CarMap cars={cars} center={center} />
          <CarList cars={cars} origin={origin} />
        </main>
      )}
    </div>
  )
}

export default App
