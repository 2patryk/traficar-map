import { useEffect, useMemo, useState } from 'react'
import { fetchCarModels, fetchHeatmap, fetchZones } from './api'
import { relocationPayout } from './utils/payout'
import { useCars } from './hooks/useCars'
import { useGeolocation } from './hooks/useGeolocation'
import { useRelocationZone } from './hooks/useRelocationZone'
import { usePanelStack } from './hooks/usePanelStack'
import { ZONE_CENTER_OVERRIDES, zoneCenter } from './utils/zoneCenters'
import { zoneEntryCandidates, zoneProximity } from './utils/geo'
import type { LatLng } from './utils/geo'
import { fetchRouteGeometry, useDrivingRoutes } from './hooks/useDrivingRoutes'
import type { RouteTarget } from './hooks/useDrivingRoutes'
import { ZonePicker } from './components/ZonePicker'
import { CarMap } from './components/CarMap'
import { CarList } from './components/CarList'
import { CarHistory } from './components/CarHistory'
import { LongestParkedPanel } from './components/LongestParkedPanel'
import { StatsView } from './components/StatsView'
import type { Car, HeatmapCell, HistoryTimelineParkingEntry, RankedCar, Zone } from './types/api'
import './App.css'

const DEFAULT_ZONE_NAME = 'Łódź'
const DISCOUNT_TYPES = ['Relokacja']

// Ranking zwraca auta bez `discountSum` (feed aut je liczy) — pinezka i lista
// potrzebują tego pola, więc dopełniamy je przy przenoszeniu auta między widokami
function withDiscountSum(car: Car | RankedCar): Car {
  if ('discountSum' in car && car.discountSum != null) return car
  return { ...car, discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0) } as Car
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
  const [zones, setZones] = useState<Zone[]>([])
  const [zoneId, setZoneId] = useState('')
  const [zonesError, setZonesError] = useState<string | null>(null)
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

  // Stos warstw sheetu: baza (list/ranking) + opcjonalnie car/history na wierzchu.
  // Wybór auta (`car`) i historia (`history`) korzystają z pełnego obiektu
  // trzymanego w warstwie — auto z rankingu spoza przefiltrowanego feedu dalej
  // działa, bo pinezka/podgląd czytają go stamtąd, nie z listy `cars`.
  const { stack, top, push, pop, replace, setBase, collapseToBase } = usePanelStack()
  const base = stack[0]
  const carLayer = stack[1]?.kind === 'car' ? stack[1] : null
  const historyLayer = top.kind === 'history' ? top : null
  const pinnedCar = carLayer?.car ?? null

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
    const targets: RouteTarget[] = []
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

  const [models, setModels] = useState<Map<number, { name: string; type: number }> | null>(null)
  useEffect(() => {
    fetchCarModels().then(setModels)
  }, [])

  // Szacowany zwrot za przestawienie: 30 zł premii minus koszt przejazdu
  // wg dystansu OSRM (auta w strefie i bez trasy — brak wartości)
  const payouts = useMemo(() => {
    if (!models) return null
    const byId = new Map<number, number>()
    for (const car of cars) {
      if (!zoneDistances?.get(car.id)?.point) continue
      const route = drivingRoutes?.get(car.id)
      if (!route) continue
      byId.set(car.id, relocationPayout(models.get(car.modelId)?.name, route.km))
    }
    return byId
  }, [cars, models, zoneDistances, drivingRoutes])

  const [historyTimeline, setHistoryTimeline] = useState<HistoryTimelineParkingEntry[] | null>(null)
  // Stan sortowań i filtrów zostaje poza stosem — musi przetrwać nawigację między warstwami
  const [listSort, setListSort] = useState<'distance' | 'discount' | 'payout' | 'zone' | 'stale'>('distance')
  const [rankingOrder, setRankingOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedRoute, setSelectedRoute] = useState<{ carId: number; coords: number[][] } | null>(null)
  const [view, setView] = useState<'map' | 'stats'>('map')
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[] | null>(null)

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

  // Zmiana strefy unieważnia wszystko, co dotyczy aut z poprzedniej strefy —
  // baza (list/ranking) zostaje, nakładki (auto/historia) znikają
  useEffect(() => {
    collapseToBase()
    setSelectedRoute(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collapseToBase ma stabilną tożsamość
  }, [zoneId])

  useEffect(() => {
    if (!historyLayer) setHistoryTimeline(null)
  }, [historyLayer])

  // Escape schodzi po stosie: najpierw nakładki (historia, potem auto),
  // a gdy stos jest płaski — zamyka ranking
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (stack.length > 1) pop()
      else if (base.kind === 'ranking') setBase({ kind: 'list' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stack.length, base.kind, pop, setBase])

  // Trasa autem gdy już policzona, wcześniej dystans w linii prostej — auto
  // z feedu ma świeże współrzędne, `pinnedCar` może być chwilę starszą kopią
  const selectedCar = useMemo(() => {
    if (!pinnedCar) return null
    return cars.find((c) => c.id === pinnedCar.id) ?? pinnedCar
  }, [cars, pinnedCar])

  // Auto z rankingu dokładamy do pinezek, dopóki nie ma go w feedzie —
  // inaczej klik w ranking niczego nie zaznacza przy filtrze "Relokacja"
  const mapCars = useMemo(() => {
    if (historyLayer) return []
    if (!pinnedCar || cars.some((c) => c.id === pinnedCar.id)) return cars
    return [...cars, pinnedCar]
  }, [cars, pinnedCar, historyLayer])

  useEffect(() => {
    // Zawsze czyścimy od razu — stara trasa nie może wisieć, gdy trwa fetch
    // nowej, bo mapa dopasuje się do trasy poprzedniego auta
    setSelectedRoute(null)
    if (!selectedCar) return
    const prox = zoneDistances?.get(selectedCar.id)
    if (!prox?.point) return
    // Geometria do najszybszego wjazdu z OSRM table; zanim table odpowie,
    // fallback na najbliższy punkt geometrycznie
    const dest: LatLng = drivingRoutes?.get(selectedCar.id)?.to ?? prox.point
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

  // Lista: ponowny klik odznacza (pop warstwy `car`). Pinezka na mapie: zawsze
  // zaznacza — toggle zamykałby popup, który Leaflet właśnie otworzył tym samym kliknięciem.
  const selectCar = (car: Car | RankedCar, { toggle = true }: { toggle?: boolean } = {}) => {
    const full = withDiscountSum(car)
    if (top.kind === 'car' && top.car.id === full.id) {
      if (toggle) pop()
      return
    }
    if (top.kind === 'car') replace({ kind: 'car', car: full })
    else push({ kind: 'car', car: full })
  }

  // Historia otwiera się z listy, rankingu i mapy — zawsze z pełnym obiektem.
  // Zapewnia warstwę `car` pod spodem, żeby po zamknięciu historii (pop)
  // auto zostało zaznaczone tak samo jak przed wejściem w historię.
  const showHistory = (car: Car | RankedCar) => {
    const full = withDiscountSum(car)
    if (top.kind !== 'car' || top.car.id !== full.id) {
      if (top.kind === 'car') replace({ kind: 'car', car: full })
      else push({ kind: 'car', car: full })
    }
    push({ kind: 'history', car: full })
  }

  const toggleRanking = () => {
    setBase({ kind: base.kind === 'ranking' ? 'list' : 'ranking' })
  }

  const zone = useMemo(() => zones.find((z) => String(z.id) === String(zoneId)), [zones, zoneId])
  const origin = position ?? zoneCenter(zone)

  // The map's camera follows the selected zone or an explicit location request —
  // it must NOT be driven by `origin` directly, since once geolocation succeeds
  // `origin` stays pinned to the user's position forever, and switching zones
  // would never move the map again.
  const [focus, setFocus] = useState<LatLng | null>(null)

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
    (): [number, number] => (focus ? [focus.lat, focus.lng] : [defaultCenter.lat, defaultCenter.lng]),
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
                className={`icon-button${base.kind === 'ranking' && !historyLayer ? ' primary' : ''}`}
                onClick={toggleRanking}
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
            selectedCar={historyLayer ? null : selectedCar}
            selectedRoute={historyLayer ? null : selectedRoute}
            onSelect={(car) => selectCar(car, { toggle: false })}
            onShowHistory={showHistory}
            historyTimeline={historyLayer ? historyTimeline : null}
            heatmapCells={historyLayer ? null : heatmapCells}
            zoneKey={zoneId}
          />
          {historyLayer ? (
            <CarHistory
              carId={historyLayer.car.id}
              regPlate={historyLayer.car.regPlate}
              onClose={pop}
              onData={setHistoryTimeline}
            />
          ) : base.kind === 'ranking' ? (
            <LongestParkedPanel
              zoneId={zoneId}
              order={rankingOrder}
              onOrderChange={setRankingOrder}
              selectedCarId={pinnedCar?.id ?? null}
              onSelect={(car) => selectCar(car, { toggle: false })}
              onShowHistory={showHistory}
              onClose={() => setBase({ kind: 'list' })}
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
              selectedCarId={pinnedCar?.id ?? null}
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
