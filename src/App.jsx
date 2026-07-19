import { useEffect, useMemo, useState } from 'react'
import { fetchZones } from './api.js'
import { useCars } from './hooks/useCars.js'
import { useGeolocation } from './hooks/useGeolocation.js'
import { useRelocationZone } from './hooks/useRelocationZone.js'
import { ZONE_CENTER_OVERRIDES, zoneCenter } from './utils/zoneCenters.js'
import { zoneProximity } from './utils/geo.js'
import { fetchRouteGeometry, useDrivingRoutes } from './hooks/useDrivingRoutes.js'
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

function CarsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14M5 11a2 2 0 0 0-2 2v4h2m14-6a2 2 0 0 1 2 2v4h-2m-14 0v2m0-2h14m0 0v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function App() {
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState('')
  const [zonesError, setZonesError] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetchZones()
      .then((data) => {
        setZones(data)
        const defaultZone = data.find((z) => z.name === DEFAULT_ZONE_NAME) ?? data[0]
        if (defaultZone) setZoneId(String(defaultZone.id))
      })
      .catch((err) => setZonesError(err.message))
  }, [])

  const { cars, carsShowAll, loading, error, refresh, lastUpdated } = useCars(
    zoneId,
    showAll ? null : DISCOUNT_TYPES,
  )
  // Renderujemy auta w trybie, w którym je pobrano — po przełączeniu stare
  // dane zostają na ekranie we właściwej formie, aż dojedzie nowy fetch.
  const effectiveShowAll = carsShowAll ?? showAll
  const { position, fix, denied, loading: locating, request: requestLocation } = useGeolocation()
  const { shape: relocationZone, version: relocationZoneVersion } = useRelocationZone(zoneId)

  // Bliskość strefy relokacji — tylko dla aut z rabatem Relokacja (dla innych
  // bez znaczenia). Liczona raz na zmianę danych, bo kształt strefy ma tysiące
  // wierzchołków. Wartość: { km, point } albo { km: 0 } gdy auto w strefie.
  const zoneDistances = useMemo(() => {
    if (!relocationZone) return null
    const byId = new Map()
    for (const car of cars) {
      if (car.discounts?.some((d) => d.name === 'Relokacja')) {
        byId.set(car.id, zoneProximity(car.lat, car.lng, relocationZone))
      }
    }
    return byId
  }, [cars, relocationZone])

  // Trasa autem (OSRM) od auta do najbliższego punktu granicy strefy
  const routeTargets = useMemo(() => {
    if (!zoneDistances) return []
    const targets = []
    for (const car of cars) {
      const prox = zoneDistances.get(car.id)
      if (prox?.point) {
        targets.push({ id: car.id, from: { lat: car.lat, lng: car.lng }, to: prox.point })
      }
    }
    return targets
  }, [cars, zoneDistances])
  const drivingRoutes = useDrivingRoutes(routeTargets)

  // Kliknięte auto: rysujemy jego trasę do strefy na mapie
  const [selectedCarId, setSelectedCarId] = useState(null)
  const [selectedRoute, setSelectedRoute] = useState(null)

  useEffect(() => {
    setSelectedCarId(null)
    setSelectedRoute(null)
  }, [zoneId])

  const selectedCar = useMemo(
    () => cars.find((c) => c.id === selectedCarId) ?? null,
    [cars, selectedCarId],
  )

  useEffect(() => {
    if (!selectedCar) {
      setSelectedRoute(null)
      return
    }
    const prox = zoneDistances?.get(selectedCar.id)
    if (!prox?.point) {
      setSelectedRoute(null)
      return
    }
    let cancelled = false
    fetchRouteGeometry({ lat: selectedCar.lat, lng: selectedCar.lng }, prox.point)
      .then((coords) => {
        if (!cancelled && coords) setSelectedRoute({ carId: selectedCar.id, coords })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedCar, zoneDistances])

  const selectCar = (car) => {
    setSelectedCarId((id) => (id === car.id ? null : car.id))
  }

  const zone = useMemo(() => zones.find((z) => String(z.id) === String(zoneId)), [zones, zoneId])
  const origin = position ?? zoneCenter(zone)

  // The map's camera follows the selected zone or an explicit location request —
  // it must NOT be driven by `origin` directly, since once geolocation succeeds
  // `origin` stays pinned to the user's position forever, and switching zones
  // would never move the map again.
  const [focus, setFocus] = useState(null)

  useEffect(() => {
    const zc = zoneCenter(zone)
    if (zc) setFocus(zc)
  }, [zone])

  // Mapę przesuwa tylko jawny fix z kliknięcia, nie ciche aktualizacje watcha
  useEffect(() => {
    if (fix) setFocus(fix)
  }, [fix])

  const defaultCenter = ZONE_CENTER_OVERRIDES[DEFAULT_ZONE_NAME]
  const center = useMemo(
    () => (focus ? [focus.lat, focus.lng] : [defaultCenter.lat, defaultCenter.lng]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on primitives, not `focus`, so the array reference stays stable across unrelated re-renders
    [focus?.lat, focus?.lng],
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
            className={`icon-button${showAll ? ' primary' : ''}`}
            onClick={() => setShowAll((v) => !v)}
            title={showAll ? 'Pokaż tylko auta z relokacją' : 'Pokaż wszystkie auta (czas postoju)'}
          >
            <CarsIcon />
            <span className="btn-label">Wszystkie</span>
          </button>
          <button
            type="button"
            className={`icon-button${locating ? ' busy' : ''}`}
            onClick={() => requestLocation({ watch: true })}
            title="Użyj mojej lokalizacji"
          >
            <LocationIcon />
            <span className="btn-label">Moja lokalizacja</span>
          </button>
          <button
            type="button"
            className={`icon-button primary${loading ? ' spin' : ''}`}
            onClick={refresh}
            disabled={!zoneId || loading}
            title="Odśwież"
          >
            <RefreshIcon />
            <span className="btn-label">Odśwież</span>
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
            relocationZoneVersion={relocationZoneVersion}
            showAll={effectiveShowAll}
            zoneDistances={zoneDistances}
            drivingRoutes={drivingRoutes}
            selectedCar={selectedCar}
            selectedRoute={selectedRoute}
            onSelect={selectCar}
          />
          <CarList
            cars={cars}
            origin={origin}
            loading={loading}
            showAll={effectiveShowAll}
            zoneDistances={zoneDistances}
            drivingRoutes={drivingRoutes}
            onSelect={selectCar}
            selectedCarId={selectedCarId}
          />
        </main>
      )}
    </div>
  )
}

export default App
