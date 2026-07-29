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
