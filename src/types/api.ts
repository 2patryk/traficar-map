export interface Zone {
  id: number
  name: string
  lat: number
  lng: number
}

export type CarModelType = 1 | 2 | 6 // 1 osobowe, 2 dostawcze, 6 skutery

export interface CarModel {
  name: string
  type: CarModelType
}

export interface Discount {
  name: string
  amount: number
}

export interface Car {
  id: number
  regPlate: string
  sideNumber: string
  modelId: number
  zoneId: number
  fuel: number
  range: number
  lat: number
  lng: number
  location: string
  parkedSince: string
  discounts: Discount[]
  discountSum?: number
}

export type RankedCar = Omit<Car, 'sideNumber' | 'zoneId' | 'discountSum'>

export interface HistoryTimelineParkingEntry {
  type: 'parking'
  lat: number
  lng: number
  location: string
  from: string
  to: string | null
  durationMin: number
}

export interface HistoryTimelineTripEntry {
  type: 'trip'
  km: number | null
  from: string
  to: string
}

export type HistoryTimelineEntry = HistoryTimelineParkingEntry | HistoryTimelineTripEntry

export interface CarHistoryResponse {
  car: { id: number; regPlate: string; zoneId: number }
  days: number
  totalKm: number
  timeline: HistoryTimelineEntry[]
}

export interface StatsHistoryPoint {
  bucket: string
  carsAvailable: number | null
  carsRelocation: number | null
}

export interface StatsHistoryResponse {
  zoneId: number
  days: number
  series: StatsHistoryPoint[]
}

export interface StatsZoneSummary {
  zoneId: number
  name: string
  carsAvailable: number | null
  carsRelocation: number | null
  relocationAmountSum: number | null
  lastSeenAt: string | null
  avgAvailable: number | null
  avgRelocation: number | null
  peakRelocation: number | null
  peakRelocationAmount: number | null
}

export interface StatsSummary {
  days: number
  totals: { carsAvailable: number; carsRelocation: number }
  zones: StatsZoneSummary[]
}

export interface HeatmapCell {
  lat: number
  lng: number
  minutesParked: number
}

export interface HealthZone {
  zoneId: number
  name: string
  lastFinishedAt: string | null
  stale: boolean
}

export interface HealthResponse {
  stale: boolean
  zones: HealthZone[]
}

// GeoJSON — tylko kształty zwracane przez /zones/:id/shapes
export interface GeoPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface GeoMultiPolygon {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type ZoneShape = GeoPolygon | GeoMultiPolygon
