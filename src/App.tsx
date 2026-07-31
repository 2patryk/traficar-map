import { useEffect, useMemo, useState } from 'react'
import { fetchCarModels, fetchHeatmap, fetchZones } from './api'
import { relocationPayout } from './utils/payout'
import { useCars } from './hooks/useCars'
import { useGeolocation } from './hooks/useGeolocation'
import { useRelocationZone } from './hooks/useRelocationZone'
import { usePanelStack } from './hooks/usePanelStack'
import { useFilters } from './hooks/useFilters'
import { useIsMobile } from './hooks/useIsMobile'
import { ZONE_CENTER_OVERRIDES, zoneCenter } from './utils/zoneCenters'
import { zoneEntryCandidates, zoneProximity, haversineDistanceKm } from './utils/geo'
import type { LatLng } from './utils/geo'
import { fetchRouteGeometry, useDrivingRoutes } from './hooks/useDrivingRoutes'
import type { RouteTarget } from './hooks/useDrivingRoutes'
import { AppShell } from './components/AppShell'
import { Topbar } from './components/Topbar'
import { MapLayerControls } from './components/MapLayerControls'
import { CarMap } from './components/CarMap'
import { CarList } from './components/CarList'
import { CarDetail } from './components/CarDetail'
import { HistoryView } from './components/HistoryView'
import { StatsView } from './components/StatsView'
import type { Car, HeatmapCell, HistoryTimelineParkingEntry, Zone } from './types/api'
import './App.css'

const DEFAULT_ZONE_NAME = 'Łódź'
const DISCOUNT_TYPES = ['Relokacja']

function withDiscountSum(car: Car): Car {
  if (car.discountSum != null) return car
  return { ...car, discountSum: (car.discounts ?? []).reduce((sum, d) => sum + d.amount, 0) }
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
  const { position, fix, denied, loading: locating, follow, toggleFollow, stopFollow } = useGeolocation()
  const { shape: relocationZone, version: relocationZoneVersion } = useRelocationZone(zoneId)
  const [zoneOn, setZoneOn] = useState(true)
  const { filters, setFilters, activeCount: filtersActiveCount } = useFilters()

  const [models, setModels] = useState<Map<number, { name: string; type: number }> | null>(null)
  useEffect(() => {
    fetchCarModels().then(setModels)
  }, [])

  const zone = useMemo(() => zones.find((z) => String(z.id) === String(zoneId)), [zones, zoneId])
  const origin = position ?? zoneCenter(zone)

  // Filtry klienckie (FiltersSheet) — typ auta domyślnie tylko osobowe (tak
  // jak dawniej filtrował sam serwer), reszta opcjonalna. Stosowane przed
  // liczeniem tras/payoutów, żeby nie tracić OSRM-owych zapytań na odfiltrowane auta.
  const visibleCars = useMemo(() => {
    return cars.filter((car) => {
      const type = models?.get(car.modelId)?.type
      if (type != null && !filters.carTypes.includes(type as 1 | 2 | 6)) return false
      if (filters.modelIds.length > 0 && !filters.modelIds.includes(car.modelId)) return false
      if (filters.maxDistanceKm != null && origin) {
        const km = haversineDistanceKm(origin.lat, origin.lng, car.lat, car.lng)
        if (km > filters.maxDistanceKm) return false
      }
      return true
    })
  }, [cars, models, filters, origin])

  // Modele dostępne do wyboru w filtrze — z aut w bieżącej strefie (po typie,
  // ale przed filtrem modelu, żeby zawężanie nie chowało własnych opcji)
  const availableModels = useMemo(() => {
    const byId = new Map<number, string>()
    for (const car of cars) {
      const type = models?.get(car.modelId)?.type
      if (type != null && !filters.carTypes.includes(type as 1 | 2 | 6)) continue
      const name = models?.get(car.modelId)?.name
      if (name) byId.set(car.modelId, name)
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [cars, models, filters.carTypes])

  // Stos warstw sheetu: baza (list/ranking) + opcjonalnie car/history na wierzchu.
  // Wybór auta (`car`) i historia (`history`) korzystają z pełnego obiektu
  // trzymanego w warstwie — auto z rankingu spoza przefiltrowanego feedu dalej
  // działa, bo pinezka/podgląd czytają go stamtąd, nie z listy `cars`.
  const { stack, top, push, pop, replace, collapseToBase } = usePanelStack()
  const carLayer = stack[1]?.kind === 'car' ? stack[1] : null
  const historyLayer = top.kind === 'history' ? top : null
  const pinnedCar = carLayer?.car ?? null

  // Bliskość strefy relokacji — tylko dla aut z rabatem Relokacja (dla innych
  // bez znaczenia). Liczona raz na zmianę danych, bo kształt strefy ma tysiące
  // wierzchołków. Wartość: { km, point } albo { km: 0 } gdy auto w strefie.
  const zoneDistances = useMemo(() => {
    if (!relocationZone) return null
    const byId = new Map()
    for (const car of visibleCars) {
      if (car.discounts?.some((d) => d.name === 'Relokacja')) {
        byId.set(car.id, zoneProximity(car.lat, car.lng, relocationZone))
      }
    }
    return byId
  }, [visibleCars, relocationZone])

  // Trasa autem (OSRM) do najszybszego punktu wjazdu do strefy — kandydaci
  // z granicy, wybór przez OSRM table w hooku
  const routeTargets = useMemo(() => {
    if (!zoneDistances || !relocationZone) return []
    const targets: RouteTarget[] = []
    for (const car of visibleCars) {
      const prox = zoneDistances.get(car.id)
      if (prox?.point) {
        const candidates = zoneEntryCandidates(car.lat, car.lng, relocationZone)
        if (candidates?.length) {
          targets.push({ id: car.id, from: { lat: car.lat, lng: car.lng }, candidates })
        }
      }
    }
    return targets
  }, [visibleCars, zoneDistances, relocationZone])
  const drivingRoutes = useDrivingRoutes(routeTargets, relocationZone)

  // Szacowany zwrot za przestawienie: 30 zł premii minus koszt przejazdu
  // wg dystansu OSRM (auta w strefie i bez trasy — brak wartości)
  const payoutsRaw = useMemo(() => {
    if (!models) return null
    const byId = new Map<number, number>()
    for (const car of visibleCars) {
      if (!zoneDistances?.get(car.id)?.point) continue
      const route = drivingRoutes?.get(car.id)
      if (!route) continue
      byId.set(car.id, relocationPayout(models.get(car.modelId)?.name, route.km))
    }
    return byId
  }, [visibleCars, models, zoneDistances, drivingRoutes])

  // "Tylko opłacalne" odfiltrowuje listę/mapę już po policzeniu payoutów —
  // nie ma sensu przeliczać tras inaczej z tego powodu
  const filteredCars = useMemo(() => {
    if (!filters.payoutOnly) return visibleCars
    return visibleCars.filter((car) => (payoutsRaw?.get(car.id) ?? -Infinity) > 0)
  }, [visibleCars, filters.payoutOnly, payoutsRaw])
  const payouts = payoutsRaw

  const [historyTimeline, setHistoryTimeline] = useState<HistoryTimelineParkingEntry[] | null>(null)
  // Stan sortowań i filtrów zostaje poza stosem — musi przetrwać nawigację między warstwami
  const [listSort, setListSort] = useState<'distance' | 'discount' | 'payout' | 'zone' | 'stale' | 'age'>('distance')
  const [selectedRoute, setSelectedRoute] = useState<{ carId: number; coords: number[][] } | null>(null)
  const [view, setView] = useState<'map' | 'stats'>('map')
  const [heatmapOn, setHeatmapOn] = useState(false)

  // Mapa jest pełnoekranowa, sheet/panel boczny tylko na niej LEŻĄ — bez tego
  // fitBounds/flyTo centrują punkty tak, jakby nic ich nie zasłaniało, i
  // najważniejsze auto ląduje pod sheetem (mobile) albo pod panelem (desktop)
  const isMobile = useIsMobile()
  const [sheetSnapPoint, setSheetSnapPoint] = useState(0.5)
  const mapPadding = useMemo(
    () =>
      isMobile
        ? { top: 0, right: 0, bottom: Math.round(window.innerHeight * sheetSnapPoint), left: 0 }
        : { top: 0, right: 380, bottom: 0, left: 0 },
    [isMobile, sheetSnapPoint],
  )
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

  // Escape zdejmuje nakładki ze stosu (historia, potem auto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (stack.length > 1) pop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stack.length, pop])

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
    if (!pinnedCar || filteredCars.some((c) => c.id === pinnedCar.id)) return filteredCars
    return [...filteredCars, pinnedCar]
  }, [filteredCars, pinnedCar, historyLayer])

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
  const selectCar = (car: Car, { toggle = true }: { toggle?: boolean } = {}) => {
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
  const showHistory = (car: Car) => {
    const full = withDiscountSum(car)
    if (top.kind !== 'car' || top.car.id !== full.id) {
      if (top.kind === 'car') replace({ kind: 'car', car: full })
      else push({ kind: 'car', car: full })
    }
    push({ kind: 'history', car: full })
  }

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

  // "Śledź mnie": w trybie follow kamera jedzie za KAŻDĄ aktualizacją watcha,
  // nie tylko za jawnym fix — wyłącza się przy ręcznym przesunięciu mapy
  useEffect(() => {
    if (follow && position) setFocus(position)
  }, [follow, position])

  const defaultCenter = ZONE_CENTER_OVERRIDES[DEFAULT_ZONE_NAME]
  const center = useMemo(
    (): [number, number] => (focus ? [focus.lat, focus.lng] : [defaultCenter.lat, defaultCenter.lng]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on primitives, not `focus`, so the array reference stays stable across unrelated re-renders
    [focus?.lat, focus?.lng],
  )

  const statusStrip = (
    <>
      {zonesError && <p className="status-strip error">{zonesError}</p>}
      {error && <p className="status-strip error">{error}</p>}
      {denied && (
        <p className="status-strip hint">Brak dostępu do lokalizacji — sortowanie od centrum strefy.</p>
      )}
    </>
  )

  return (
    <AppShell
      view={view}
      showMap={Boolean(zoneId)}
      sheetSnapPoint={sheetSnapPoint}
      onSheetSnapPointChange={setSheetSnapPoint}
      topbar={
        <Topbar
          zones={zones}
          zoneId={zoneId}
          onZoneChange={setZoneId}
          view={view}
          onToggleView={() => setView((v) => (v === 'stats' ? 'map' : 'stats'))}
          showAll={effectiveShowAll}
          onShowAllChange={setShowAll}
          carCount={filteredCars.length}
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          refreshing={loading}
          filters={filters}
          onFiltersChange={setFilters}
          filtersActiveCount={filtersActiveCount}
          availableModels={availableModels}
        />
      }
      statusStrip={statusStrip}
      stats={<StatsView zones={zones} zoneId={zoneId} onZoneChange={setZoneId} />}
      map={
        <CarMap
          cars={mapCars}
          center={center}
          userPosition={position}
          relocationZone={zoneOn ? relocationZone : null}
          relocationZoneVersion={relocationZoneVersion}
          showAll={effectiveShowAll}
          ageColorActive={listSort === 'age'}
          zoneDistances={zoneDistances}
          drivingRoutes={drivingRoutes}
          payouts={payouts}
          models={models}
          selectedCar={historyLayer ? null : selectedCar}
          selectedRoute={historyLayer ? null : selectedRoute}
          onSelect={(car) => selectCar(car, { toggle: false })}
          onShowHistory={showHistory}
          historyTimeline={historyLayer ? historyTimeline : null}
          heatmapCells={historyLayer ? null : heatmapCells}
          zoneKey={zoneId}
          onManualDrag={stopFollow}
          mapPadding={mapPadding}
        />
      }
      mapLayerControls={
        <MapLayerControls
          heatmapOn={heatmapOn}
          onToggleHeatmap={() => setHeatmapOn((v) => !v)}
          zoneOn={zoneOn}
          onToggleZone={() => setZoneOn((v) => !v)}
          follow={follow}
          onToggleFollow={toggleFollow}
          locating={locating}
          disabled={!zoneId}
        />
      }
      panel={
        historyLayer ? (
          <HistoryView
            carId={historyLayer.car.id}
            regPlate={historyLayer.car.regPlate}
            onClose={pop}
            onData={setHistoryTimeline}
          />
        ) : top.kind === 'car' ? (
          <CarDetail
            car={top.car}
            payout={payouts?.get(top.car.id) ?? null}
            route={drivingRoutes?.get(top.car.id) ?? null}
            proximity={zoneDistances?.get(top.car.id) ?? null}
            modelName={models?.get(top.car.modelId)?.name ?? null}
            onClose={pop}
            onShowHistory={() => showHistory(top.car)}
          />
        ) : (
          <CarList
            cars={filteredCars}
            origin={origin}
            loading={loading}
            showAll={effectiveShowAll}
            zoneDistances={zoneDistances}
            drivingRoutes={drivingRoutes}
            payouts={payouts}
            models={models}
            onSelect={selectCar}
            selectedCarId={pinnedCar?.id ?? null}
            sortBy={listSort}
            onSortChange={setListSort}
          />
        )
      }
    />
  )
}

export default App
