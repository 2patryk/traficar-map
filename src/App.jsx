import { useEffect, useMemo, useState } from 'react'
import { fetchZones } from './api.js'
import { useCars } from './hooks/useCars.js'
import { useGeolocation } from './hooks/useGeolocation.js'
import { useRelocationZone } from './hooks/useRelocationZone.js'
import { zoneCenter } from './utils/zoneCenters.js'
import { ZonePicker } from './components/ZonePicker.jsx'
import { CarMap } from './components/CarMap.jsx'
import { CarList } from './components/CarList.jsx'
import './App.css'

const DEFAULT_ZONE_NAME = 'Łódź'
const DISCOUNT_TYPES = ['Relokacja']

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="6" />
    </svg>
  )
}

function App() {
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState('')
  const [zonesError, setZonesError] = useState(null)

  useEffect(() => {
    fetchZones()
      .then((data) => {
        setZones(data)
        const defaultZone = data.find((z) => z.name === DEFAULT_ZONE_NAME) ?? data[0]
        if (defaultZone) setZoneId(String(defaultZone.id))
      })
      .catch((err) => setZonesError(err.message))
  }, [])

  const { cars, loading, error, refresh, lastUpdated } = useCars(zoneId, DISCOUNT_TYPES)
  const { position, denied, loading: locating, request: requestLocation } = useGeolocation()
  const relocationZone = useRelocationZone(zoneId)

  const zone = useMemo(() => zones.find((z) => String(z.id) === String(zoneId)), [zones, zoneId])
  const origin = position ?? zoneCenter(zone)
  const center = useMemo(
    () => (origin ? [origin.lat, origin.lng] : [52.2297, 21.0122]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on primitives, not `origin`, so the array reference stays stable across unrelated re-renders
    [origin?.lat, origin?.lng],
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">
            <span className="live-dot" />
            Traficar · Relokacja
          </span>
          {lastUpdated && (
            <span className="brand-sub">aktualizacja {lastUpdated.toLocaleTimeString('pl-PL')}</span>
          )}
        </div>

        <div className="header-controls">
          <ZonePicker zones={zones} zoneId={zoneId} onChange={setZoneId} />
          <button
            type="button"
            className={`icon-button${locating ? ' busy' : ''}`}
            onClick={requestLocation}
            title="Użyj mojej lokalizacji"
          >
            <LocationIcon />
            Moja lokalizacja
          </button>
          <button
            type="button"
            className={`icon-button primary${loading ? ' spin' : ''}`}
            onClick={refresh}
            disabled={!zoneId || loading}
          >
            <RefreshIcon />
            Odśwież
          </button>
        </div>
      </header>

      {zonesError && <p className="status-strip error">{zonesError}</p>}
      {error && <p className="status-strip error">{error}</p>}
      {denied && (
        <p className="status-strip hint">Brak dostępu do lokalizacji — sortowanie od centrum strefy.</p>
      )}

      {zoneId && (
        <main className="app-main">
          <CarMap
            cars={cars}
            center={center}
            userPosition={position}
            relocationZone={relocationZone}
            zoneId={zoneId}
          />
          <CarList cars={cars} origin={origin} loading={loading} />
        </main>
      )}
    </div>
  )
}

export default App
