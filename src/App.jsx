import { useEffect, useMemo, useState } from 'react'
import { fetchCarModels, fetchHeatmap, fetchZones } from './api.js'
import { relocationPayout } from './utils/payout.js'
import { useCars } from './hooks/useCars.js'
import { useGeolocation } from './hooks/useGeolocation.js'
import { useRelocationZone } from './hooks/useRelocationZone.js'
import { ZONE_CENTER_OVERRIDES, zoneCenter } from './utils/zoneCenters.js'
import { zoneEntryCandidates, zoneProximity } from './utils/geo.js'
import { fetchRouteGeometry, useDrivingRoutes } from './hooks/useDrivingRoutes.js'
import { ZonePicker } from './components/ZonePicker.jsx'
import { CarMap } from './components/CarMap.jsx'
import { CarList } from './components/CarList.jsx'
import { CarHistory } from './components/CarHistory.jsx'
import { LongestParkedPanel } from './components/LongestParkedPanel.jsx'
import { StatsView } from './components/StatsView.jsx'
import './App.css'

const DEFAULT_ZONE_NAME = 'Łódź'
const DISCOUNT_TYPES = ['Relokacja']

// Ranking zwraca auta bez `discountSum` (feed aut je liczy) — pinezka i lista
// potrzebują tego pola, więc dopełniamy je przy przenoszeniu auta między widokami
function withDiscountSum(car) {
  if (car.discountSum != null) return car
  return { ...car, discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0) }
}

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

function RankingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeatmapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3c3 3 5 5.5 5 8.5A5 5 0 0 1 7 11.5C7 8.5 9 6 12 3z" strokeLinejoin="round" />
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

  // Trasa autem (OSRM) do najszybszego punktu wjazdu do strefy — kandydaci
  // z granicy, wybór przez OSRM table w hooku
  const routeTargets = useMemo(() => {
    if (!zoneDistances || !relocationZone) return []
    const targets = []
    for (const car of cars) {
      const prox = zoneDistances.get(car.id)
      if (prox?.point) {
        const candidates = zoneEntryCandidates(car.lat, car.lng, relocationZone)
        if (candidates?.length) {
          targets.push({ id: car.id, from: { lat: car.lat, lng: car.lng }, candidates })
        }
      }
    }
    return targets
  }, [cars, zoneDistances, relocationZone])
  const drivingRoutes = useDrivingRoutes(routeTargets, relocationZone)

  const [models, setModels] = useState(null)
  useEffect(() => {
    fetchCarModels().then(setModels)
  }, [])

  // Szacowany zwrot za przestawienie: 30 zł premii minus koszt przejazdu
  // wg dystansu OSRM (auta w strefie i bez trasy — brak wartości)
  const payouts = useMemo(() => {
    if (!models) return null
    const byId = new Map()
    for (const car of cars) {
      if (!zoneDistances?.get(car.id)?.point) continue
      const route = drivingRoutes?.get(car.id)
      if (!route) continue
      byId.set(car.id, relocationPayout(models.get(car.modelId)?.name, route.km))
    }
    return byId
  }, [cars, models, zoneDistances, drivingRoutes])

  // Kliknięte auto: rysujemy jego trasę do strefy na mapie
  const [selectedCarId, setSelectedCarId] = useState(null)
  // Auto wybrane z rankingu może nie być w aktualnym feedzie (filtr "Relokacja"
  // albo zniknęło z listy) — trzymamy jego dane, żeby pinezka i podgląd działały
  const [pinnedCar, setPinnedCar] = useState(null)
  // Historia trzyma obiekt auta, nie id: gdy auto wypadnie z feedu (ktoś je
  // wynajął), panel nie może zniknąć w trakcie przeglądania
  const [historyCar, setHistoryCar] = useState(null)
  const [historyTimeline, setHistoryTimeline] = useState(null)
  const [showRanking, setShowRanking] = useState(false)
  // Stan sortowania podniesiony do App — panele się odmontowują przy przełączaniu
  // widoków, a wybrane sortowanie musi przetrwać powrót do panelu
  const [listSort, setListSort] = useState('distance')
  const [rankingOrder, setRankingOrder] = useState('desc')
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [view, setView] = useState('map')
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [heatmapCells, setHeatmapCells] = useState(null)

  useEffect(() => {
    if (!heatmapOn || !zoneId) {
      setHeatmapCells(null)
      return
    }
    let cancelled = false
    fetchHeatmap(zoneId).then((cells) => {
      if (!cancelled) setHeatmapCells(cells)
    })
    return () => {
      cancelled = true
    }
  }, [heatmapOn, zoneId])

  // Zmiana strefy unieważnia wszystko, co dotyczy aut z poprzedniej strefy
  useEffect(() => {
    setSelectedCarId(null)
    setSelectedRoute(null)
    setPinnedCar(null)
    setHistoryCar(null)
  }, [zoneId])

  useEffect(() => {
    if (!historyCar) setHistoryTimeline(null)
  }, [historyCar])

  // Escape wychodzi z nakładek w kolejności otwarcia: historia, ranking, zaznaczenie
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (historyCar) setHistoryCar(null)
      else if (showRanking) setShowRanking(false)
      else {
        setSelectedCarId(null)
        setPinnedCar(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyCar, showRanking])

  const selectedCar = useMemo(
    () =>
      cars.find((c) => c.id === selectedCarId) ??
      (pinnedCar?.id === selectedCarId ? pinnedCar : null),
    [cars, selectedCarId, pinnedCar],
  )

  // Auto z rankingu dokładamy do pinezek, dopóki nie ma go w feedzie —
  // inaczej klik w ranking niczego nie zaznacza przy filtrze "Relokacja"
  const mapCars = useMemo(() => {
    if (historyCar) return []
    if (!pinnedCar || cars.some((c) => c.id === pinnedCar.id)) return cars
    return [...cars, pinnedCar]
  }, [cars, pinnedCar, historyCar])

  useEffect(() => {
    // Zawsze czyścimy od razu — stara trasa nie może wisieć, gdy trwa fetch
    // nowej, bo mapa dopasuje się do trasy poprzedniego auta
    setSelectedRoute(null)
    if (!selectedCar) return
    const prox = zoneDistances?.get(selectedCar.id)
    if (!prox?.point) return
    // Geometria do najszybszego wjazdu z OSRM table; zanim table odpowie,
    // fallback na najbliższy punkt geometrycznie
    const dest = drivingRoutes?.get(selectedCar.id)?.to ?? prox.point
    let cancelled = false
    fetchRouteGeometry({ lat: selectedCar.lat, lng: selectedCar.lng }, dest)
      .then((coords) => {
        if (!cancelled && coords) setSelectedRoute({ carId: selectedCar.id, coords })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selectedCar, zoneDistances, drivingRoutes])

  // Lista: ponowny klik odznacza. Pinezka: zawsze zaznacza — toggle zamykałby
  // popup, który Leaflet właśnie otworzył tym samym kliknięciem.
  const selectCar = (car, { toggle = true } = {}) => {
    setSelectedCarId((id) => (toggle && id === car.id ? null : car.id))
  }

  // Historia otwiera się z listy, rankingu i mapy — zawsze z pełnym obiektem
  const showHistory = (car) => {
    const full = withDiscountSum(car)
    setHistoryCar(full)
    // Przypinamy też do mapy: po zamknięciu historii kadr wraca na to auto,
    // nawet gdy filtr "Relokacja" go nie zawiera
    setPinnedCar(full)
    setSelectedCarId(car.id)
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
          {view === 'map' && (
            <span className="car-count-badge" title="Liczba widocznych aut">
              {cars.length} {effectiveShowAll ? 'aut' : 'z rabatem'}
            </span>
          )}
          <ZonePicker zones={zones} zoneId={zoneId} onChange={setZoneId} />
          <button
            type="button"
            className={`icon-button${view === 'stats' ? ' primary' : ''}`}
            onClick={() => setView((v) => (v === 'stats' ? 'map' : 'stats'))}
            title="Statystyki floty"
          >
            <StatsIcon />
            <span className="btn-label">Statystyki</span>
          </button>
          {view === 'map' && (
            <>
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
                className={`icon-button${showRanking && !historyCar ? ' primary' : ''}`}
                onClick={() => {
                  setHistoryCar(null)
                  setShowRanking((v) => !v)
                }}
                disabled={!zoneId}
                title="Ranking najdłużej stojących aut w strefie"
              >
                <RankingIcon />
                <span className="btn-label">Ranking</span>
              </button>
              <button
                type="button"
                className={`icon-button${heatmapOn ? ' primary' : ''}`}
                onClick={() => setHeatmapOn((v) => !v)}
                disabled={!zoneId}
                title="Heatmapa długich postojów (30 dni)"
              >
                <HeatmapIcon />
                <span className="btn-label">Heatmapa</span>
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
            </>
          )}
        </div>
      </header>

      {zonesError && <p className="status-strip error">{zonesError}</p>}
      {error && <p className="status-strip error">{error}</p>}
      {denied && (
        <p className="status-strip hint">Brak dostępu do lokalizacji — sortowanie od centrum strefy.</p>
      )}

      {view === 'stats' && (
        <StatsView zones={zones} zoneId={zoneId} onZoneChange={setZoneId} />
      )}

      {view === 'map' && zoneId && (
        <main className="app-main">
          <CarMap
            cars={mapCars}
            center={center}
            userPosition={position}
            relocationZone={relocationZone}
            relocationZoneVersion={relocationZoneVersion}
            showAll={effectiveShowAll}
            zoneDistances={zoneDistances}
            drivingRoutes={drivingRoutes}
            payouts={payouts}
            selectedCar={historyCar ? null : selectedCar}
            selectedRoute={historyCar ? null : selectedRoute}
            onSelect={(car) => selectCar(car, { toggle: false })}
            onShowHistory={showHistory}
            historyTimeline={historyCar ? historyTimeline : null}
            heatmapCells={historyCar ? null : heatmapCells}
            zoneKey={zoneId}
          />
          {historyCar ? (
            <CarHistory
              carId={historyCar.id}
              regPlate={historyCar.regPlate}
              onClose={() => setHistoryCar(null)}
              onData={setHistoryTimeline}
            />
          ) : showRanking ? (
            <LongestParkedPanel
              zoneId={zoneId}
              order={rankingOrder}
              onOrderChange={setRankingOrder}
              selectedCarId={selectedCarId}
              onSelect={(car) => {
                // Panel zostaje otwarty: ranking to lista do przeglądania,
                // a zamknięcie po pierwszym kliknięciu wymuszało powrót za każdym razem
                setPinnedCar(withDiscountSum(car))
                setSelectedCarId(car.id)
              }}
              onShowHistory={showHistory}
              onClose={() => setShowRanking(false)}
            />
          ) : (
            <CarList
              cars={cars}
              origin={origin}
              loading={loading}
              showAll={effectiveShowAll}
              zoneDistances={zoneDistances}
              drivingRoutes={drivingRoutes}
              payouts={payouts}
              onSelect={selectCar}
              onShowHistory={showHistory}
              selectedCarId={selectedCarId}
              sortBy={listSort}
              onSortChange={setListSort}
            />
          )}
        </main>
      )}
    </div>
  )
}

export default App
