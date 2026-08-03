import Fastify from 'fastify'
import { openDb } from './db/migrate.js'
import type {
  Car,
  CarHistoryResponse,
  HealthResponse,
  HeatmapCell,
  RankedCar,
  StatsHistoryResponse,
  StatsSummary,
} from './contract.js'

process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection (ignored)', err)
})

const PORT = Number(process.env.PORT) || 3000
const STALE_AFTER_MS = 15 * 60 * 1000

// `as any`: better-sqlite3 types every row `unknown` without a generic per
// prepared statement — not worth an interface per query for an internal API
// layer. Same rationale as tsconfig's `strict: false`.
const db = openDb() as any
const fastify = Fastify({ logger: true })

fastify.addHook('onSend', async (_req, reply, payload) => {
  reply.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  return payload
})

const statements = {
  carsBase: db.prepare(`
    SELECT
      c.id, c.reg_plate AS regPlate, c.side_number AS sideNumber, c.model_id AS modelId,
      c.zone_id AS zoneId, c.fuel, c.range, p.lat, p.lng, p.location, p.started_at AS parkedSince
    FROM cars c
    JOIN parkings p ON p.car_id = c.id AND p.ended_at IS NULL
    WHERE c.zone_id = ?
  `),
  discountsForCar: db.prepare(`
    SELECT type AS name, amount, started_at AS since FROM discount_spans
    WHERE parking_id = (SELECT id FROM parkings WHERE car_id = ? AND ended_at IS NULL)
      AND ended_at IS NULL
  `),
  latestPollPerZone: db.prepare(`
    SELECT zone_id AS zoneId, MAX(finished_at) AS lastFinishedAt
    FROM poll_runs
    WHERE error IS NULL
    GROUP BY zone_id
  `),
  zones: db.prepare('SELECT id, name, lat, lng FROM zones'),
  carMeta: db.prepare('SELECT id, reg_plate AS regPlate, zone_id AS zoneId FROM cars WHERE id = ?'),
  historyParkings: db.prepare(`
    SELECT lat, lng, location, started_at AS startedAt, ended_at AS endedAt
    FROM parkings
    WHERE car_id = ? AND started_at >= ?
    ORDER BY started_at DESC
  `),
  historyTrips: db.prepare(`
    SELECT departed_at AS departedAt, arrived_at AS arrivedAt, straight_km AS straightKm
    FROM trips
    WHERE car_id = ? AND departed_at >= ?
    ORDER BY departed_at DESC
  `),
  longestParked: db.prepare(`
    SELECT
      c.id, c.reg_plate AS regPlate, c.fuel, c.range,
      p.lat, p.lng, p.location, p.started_at AS parkedSince
    FROM cars c
    JOIN parkings p ON p.car_id = c.id AND p.ended_at IS NULL
    WHERE c.zone_id = ?
    ORDER BY p.started_at ASC
    LIMIT ?
  `),
  shortestParked: db.prepare(`
    SELECT
      c.id, c.reg_plate AS regPlate, c.fuel, c.range,
      p.lat, p.lng, p.location, p.started_at AS parkedSince
    FROM cars c
    JOIN parkings p ON p.car_id = c.id AND p.ended_at IS NULL
    WHERE c.zone_id = ?
    ORDER BY p.started_at DESC
    LIMIT ?
  `),
  statsHistory: db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00Z', taken_at) AS bucket,
      ROUND(AVG(cars_available)) AS carsAvailable,
      ROUND(AVG(cars_relocation)) AS carsRelocation
    FROM zone_snapshots
    WHERE zone_id = ? AND taken_at >= ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `),
  statsLatestSnapshot: db.prepare(`
    SELECT cars_available AS carsAvailable, cars_relocation AS carsRelocation,
           relocation_amount_sum AS relocationAmountSum, taken_at AS takenAt
    FROM zone_snapshots
    WHERE zone_id = ?
    ORDER BY taken_at DESC
    LIMIT 1
  `),
  statsAverages: db.prepare(`
    SELECT
      ROUND(AVG(cars_available), 1) AS avgAvailable,
      ROUND(AVG(cars_relocation), 1) AS avgRelocation,
      MAX(cars_relocation) AS peakRelocation,
      MAX(relocation_amount_sum) AS peakRelocationAmount
    FROM zone_snapshots
    WHERE zone_id = ? AND taken_at >= ?
  `),
  heatmapCells: db.prepare(`
    SELECT
      ROUND(p.lat, 3) AS lat,
      ROUND(p.lng, 3) AS lng,
      SUM(
        (julianday(COALESCE(p.ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) - julianday(p.started_at)) * 1440
      ) AS minutesParked
    FROM parkings p
    JOIN cars c ON c.id = p.car_id
    WHERE c.zone_id = ? AND p.started_at >= ?
    GROUP BY lat, lng
    ORDER BY minutesParked DESC
    LIMIT 500
  `),
}

fastify.get('/api/cars', async (request, reply) => {
  const { zoneId, discountType } = request.query as any
  if (!zoneId) {
    reply.code(400)
    return { error: 'zoneId is required' }
  }

  const types = Array.isArray(discountType) ? discountType : discountType ? [discountType] : null

  const cars = statements.carsBase.all(Number(zoneId)).map((car) => {
    const discounts = statements.discountsForCar.all(car.id)
    return { ...car, discounts }
  })

  const filtered = types
    ? cars.filter((car) => car.discounts.some((d) => types.includes(d.name)))
    : cars

  return { cars: filtered } satisfies { cars: Car[] }
})

fastify.get('/api/cars/:id/history', async (request, reply) => {
  const carId = Number((request.params as any).id)
  const car = statements.carMeta.get(carId)
  if (!car) {
    reply.code(404)
    return { error: 'car not found' }
  }

  const days = Math.min(90, Math.max(1, Number((request.query as any).days) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const now = Date.now()

  const parkings = statements.historyParkings.all(carId, since).map((p) => ({
    type: 'parking',
    lat: p.lat,
    lng: p.lng,
    location: p.location,
    from: p.startedAt,
    to: p.endedAt,
    durationMin: Math.round(((p.endedAt ? Date.parse(p.endedAt) : now) - Date.parse(p.startedAt)) / 60000),
  }))

  const trips = statements.historyTrips.all(carId, since).map((t) => ({
    type: 'trip',
    km: t.straightKm,
    from: t.departedAt,
    to: t.arrivedAt,
  }))

  const timeline = [...parkings, ...trips].sort((a, b) => Date.parse(b.from) - Date.parse(a.from))
  const totalKm = trips.reduce((sum, t) => sum + (t.km ?? 0), 0)

  return { car, days, totalKm, timeline } satisfies CarHistoryResponse
})

fastify.get('/api/stats/longest-parked', async (request, reply) => {
  const { zoneId } = request.query as any
  if (!zoneId) {
    reply.code(400)
    return { error: 'zoneId is required' }
  }

  const limit = Math.min(100, Math.max(1, Number((request.query as any).limit) || 20))
  // `order=asc` = najkrócej stojące (najświeższe postoje) — sortujemy w SQL,
  // bo odwracanie top-N po stronie klienta dałoby tylko najkrótsze z najdłuższych
  const statement =
    (request.query as any).order === 'asc' ? statements.shortestParked : statements.longestParked
  const cars = statement.all(Number(zoneId), limit).map((car) => ({
    ...car,
    discounts: statements.discountsForCar.all(car.id),
  }))

  return { cars } satisfies { cars: RankedCar[] }
})

fastify.get('/api/stats/history', async (request, reply) => {
  const { zoneId } = request.query as any
  if (!zoneId) {
    reply.code(400)
    return { error: 'zoneId is required' }
  }
  const days = Math.min(90, Math.max(1, Number((request.query as any).days) || 7))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const series = statements.statsHistory.all(Number(zoneId), since)
  return { zoneId: Number(zoneId), days, series } satisfies StatsHistoryResponse
})

fastify.get('/api/stats/summary', async (request) => {
  const days = Math.min(90, Math.max(1, Number((request.query as any).days) || 7))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const zones = statements.zones.all().map((zone) => {
    const latest = statements.statsLatestSnapshot.get(zone.id)
    const avg = statements.statsAverages.get(zone.id, since)
    return {
      zoneId: zone.id,
      name: zone.name,
      carsAvailable: latest?.carsAvailable ?? null,
      carsRelocation: latest?.carsRelocation ?? null,
      relocationAmountSum: latest?.relocationAmountSum ?? null,
      lastSeenAt: latest?.takenAt ?? null,
      avgAvailable: avg?.avgAvailable ?? null,
      avgRelocation: avg?.avgRelocation ?? null,
      peakRelocation: avg?.peakRelocation ?? null,
      peakRelocationAmount: avg?.peakRelocationAmount ?? null,
    }
  })

  const totals = zones.reduce(
    (acc, z) => ({
      carsAvailable: acc.carsAvailable + (z.carsAvailable ?? 0),
      carsRelocation: acc.carsRelocation + (z.carsRelocation ?? 0),
    }),
    { carsAvailable: 0, carsRelocation: 0 }
  )

  return { days, totals, zones } satisfies StatsSummary
})

fastify.get('/api/stats/heatmap', async (request, reply) => {
  const { zoneId } = request.query as any
  if (!zoneId) {
    reply.code(400)
    return { error: 'zoneId is required' }
  }
  const days = Math.min(90, Math.max(1, Number((request.query as any).days) || 30))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const cells = statements.heatmapCells.all(Number(zoneId), since)
  return { zoneId: Number(zoneId), days, cells } satisfies { zoneId: number; days: number; cells: HeatmapCell[] }
})

fastify.get('/api/health', async (request, reply) => {
  const rows = statements.latestPollPerZone.all()
  const zones = statements.zones.all()
  const now = Date.now()

  const perZone = zones.map((zone) => {
    const row = rows.find((r) => r.zoneId === zone.id)
    const lastFinishedAt = row?.lastFinishedAt ?? null
    const ageMs = lastFinishedAt ? now - Date.parse(lastFinishedAt) : null
    return {
      zoneId: zone.id,
      name: zone.name,
      lastFinishedAt,
      stale: ageMs == null || ageMs > STALE_AFTER_MS,
    }
  })

  const stale = perZone.some((z) => z.stale)
  if (stale) reply.code(500)
  return { stale, zones: perZone } satisfies HealthResponse
})

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
