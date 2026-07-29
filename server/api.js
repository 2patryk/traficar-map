import Fastify from 'fastify'
import { openDb } from './db/migrate.js'

const PORT = Number(process.env.PORT) || 3000
const STALE_AFTER_MS = 15 * 60 * 1000

const db = openDb()
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
    SELECT type AS name, amount FROM discount_spans
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
}

fastify.get('/api/cars', async (request, reply) => {
  const { zoneId, discountType } = request.query
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

  return { cars: filtered }
})

fastify.get('/api/cars/:id/history', async (request, reply) => {
  const carId = Number(request.params.id)
  const car = statements.carMeta.get(carId)
  if (!car) {
    reply.code(404)
    return { error: 'car not found' }
  }

  const days = Math.min(90, Math.max(1, Number(request.query.days) || 30))
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

  return { car, days, totalKm, timeline }
})

fastify.get('/api/stats/longest-parked', async (request, reply) => {
  const { zoneId } = request.query
  if (!zoneId) {
    reply.code(400)
    return { error: 'zoneId is required' }
  }

  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20))
  const cars = statements.longestParked.all(Number(zoneId), limit).map((car) => ({
    ...car,
    discounts: statements.discountsForCar.all(car.id),
  }))

  return { cars }
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
  return { stale, zones: perZone }
})

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
