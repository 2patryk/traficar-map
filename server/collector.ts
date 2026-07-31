import { migrate } from './db/migrate.js'
import { ping } from './cronitor.js'

// fetch + AbortSignal.timeout occasionally rejects outside the awaiting
// try/catch (known Node/undici race) — without this handler that kills the
// whole process, turning one flaky request into a crash loop.
process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection (ignored, cycle continues)', err)
})

const API_BASE = 'https://fioletowe.live/api/v1'
const CYCLE_INTERVAL_MS = 2 * 60 * 1000
const MOVE_THRESHOLD_M = 120
const GAP_THRESHOLD_MIN = 10
const FETCH_TIMEOUT_MS = 15_000

// `as any`: better-sqlite3 types every row `unknown` without a generic per
// prepared statement — not worth an interface per query here (see tsconfig).
const db = migrate() as any

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`)
  return res.json()
}

async function loadReferenceData() {
  const { zones } = await fetchJson('/zones')
  const upsertZone = db.prepare(
    'INSERT INTO zones (id, name, lat, lng) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lng = excluded.lng'
  )
  db.transaction(() => {
    for (const z of zones) upsertZone.run(z.id, z.name, parseFloat(z.lat), parseFloat(z.lng))
  })()

  const { carModels } = await fetchJson('/car-models')
  const upsertModel = db.prepare(
    'INSERT INTO car_models (id, name, type) VALUES (?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type'
  )
  db.transaction(() => {
    for (const m of carModels) upsertModel.run(m.id, m.name, m.type)
  })()

  return zones.map((z) => z.id)
}

const statements = {
  lastGoodRun: db.prepare(
    "SELECT finished_at FROM poll_runs WHERE zone_id = ? AND error IS NULL ORDER BY started_at DESC LIMIT 1"
  ),
  openParkingsForZone: db.prepare(
    'SELECT p.* FROM parkings p JOIN cars c ON c.id = p.car_id ' +
      'WHERE c.zone_id = ? AND p.ended_at IS NULL'
  ),
  upsertCar: db.prepare(
    'INSERT INTO cars (id, reg_plate, side_number, model_id, zone_id, fuel, range, first_seen_at, last_seen_at) ' +
      'VALUES (@id, @regPlate, @sideNumber, @modelId, @zoneId, @fuel, @range, @now, @now) ' +
      'ON CONFLICT(id) DO UPDATE SET reg_plate = excluded.reg_plate, side_number = excluded.side_number, ' +
      'model_id = excluded.model_id, zone_id = excluded.zone_id, fuel = excluded.fuel, range = excluded.range, ' +
      'last_seen_at = excluded.last_seen_at'
  ),
  lastClosedParking: db.prepare(
    'SELECT * FROM parkings WHERE car_id = ? ORDER BY started_at DESC LIMIT 1'
  ),
  insertParking: db.prepare(
    'INSERT INTO parkings (car_id, lat, lng, location, started_at, fuel_start) ' +
      'VALUES (@carId, @lat, @lng, @location, @startedAt, @fuel) RETURNING id'
  ),
  closeParking: db.prepare(
    'UPDATE parkings SET ended_at = @endedAt, end_reason = @endReason, uncertain = @uncertain, fuel_end = @fuelEnd ' +
      'WHERE id = @id'
  ),
  insertTrip: db.prepare(
    'INSERT INTO trips (car_id, from_parking, to_parking, departed_at, arrived_at, straight_km, fuel_delta, uncertain) ' +
      'VALUES (@carId, @fromParking, @toParking, @departedAt, @arrivedAt, @straightKm, @fuelDelta, @uncertain)'
  ),
  openDiscountsForParking: db.prepare(
    'SELECT * FROM discount_spans WHERE parking_id = ? AND ended_at IS NULL'
  ),
  insertDiscount: db.prepare(
    'INSERT INTO discount_spans (car_id, parking_id, type, amount, started_at) ' +
      'VALUES (@carId, @parkingId, @type, @amount, @startedAt)'
  ),
  closeDiscount: db.prepare('UPDATE discount_spans SET ended_at = @endedAt WHERE id = @id'),
  insertPollRun: db.prepare(
    'INSERT INTO poll_runs (started_at, finished_at, zone_id, cars_seen, api_last_update, error) ' +
      'VALUES (@startedAt, @finishedAt, @zoneId, @carsSeen, @apiLastUpdate, @error)'
  ),
  insertZoneSnapshot: db.prepare(
    'INSERT INTO zone_snapshots (zone_id, taken_at, cars_available, cars_relocation, relocation_amount_sum) ' +
      'VALUES (@zoneId, @takenAt, @carsAvailable, @carsRelocation, @relocationAmountSum)'
  ),
}

function applyDiscountDiff(carId, parkingId, discounts, now) {
  const open = statements.openDiscountsForParking.all(parkingId)
  const current = discounts ?? []

  for (const span of open) {
    const stillActive = current.some((d) => d.name === span.type)
    if (!stillActive) statements.closeDiscount.run({ id: span.id, endedAt: now })
  }
  for (const d of current) {
    const alreadyOpen = open.some((span) => span.type === d.name)
    if (!alreadyOpen) {
      statements.insertDiscount.run({ carId, parkingId, type: d.name, amount: d.amount, startedAt: now })
    }
  }
}

function processZone(zoneId, apiCars, now, boundaryTime) {
  const openParkings = new Map<number, any>(
    statements.openParkingsForZone.all(zoneId).map((p: any) => [p.car_id, p]),
  )
  const seenCarIds = new Set()

  for (const car of apiCars) {
    seenCarIds.add(car.id)
    const lat = parseFloat(car.lat)
    const lng = parseFloat(car.lng)

    statements.upsertCar.run({
      id: car.id,
      regPlate: car.regPlate ?? null,
      sideNumber: car.sideNumber ?? null,
      modelId: car.modelId ?? null,
      zoneId,
      fuel: car.fuel ?? null,
      range: car.range ?? null,
      now,
    })

    const open = openParkings.get(car.id)

    if (!open) {
      const prevParking = statements.lastClosedParking.get(car.id)
      const { id: parkingId } = statements.insertParking.get({
        carId: car.id,
        lat,
        lng,
        location: car.location ?? null,
        startedAt: now,
        fuel: car.fuel ?? null,
      })
      if (prevParking && prevParking.ended_at) {
        const km = haversineMeters(prevParking.lat, prevParking.lng, lat, lng) / 1000
        statements.insertTrip.run({
          carId: car.id,
          fromParking: prevParking.id,
          toParking: parkingId,
          departedAt: prevParking.ended_at,
          arrivedAt: now,
          straightKm: km,
          fuelDelta: car.fuel != null && prevParking.fuel_end != null ? car.fuel - prevParking.fuel_end : null,
          uncertain: prevParking.uncertain,
        })
      }
      applyDiscountDiff(car.id, parkingId, car.discounts, now)
      continue
    }

    const distance = haversineMeters(open.lat, open.lng, lat, lng)
    if (distance < MOVE_THRESHOLD_M) {
      applyDiscountDiff(car.id, open.id, car.discounts, now)
      continue
    }

    statements.closeParking.run({
      id: open.id,
      endedAt: boundaryTime.time,
      endReason: 'moved',
      uncertain: boundaryTime.uncertain ? 1 : 0,
      fuelEnd: car.fuel ?? null,
    })
    const { id: newParkingId } = statements.insertParking.get({
      carId: car.id,
      lat,
      lng,
      location: car.location ?? null,
      startedAt: boundaryTime.time,
      fuel: car.fuel ?? null,
    })
    statements.insertTrip.run({
      carId: car.id,
      fromParking: open.id,
      toParking: newParkingId,
      departedAt: boundaryTime.time,
      arrivedAt: boundaryTime.time,
      straightKm: distance / 1000,
      fuelDelta: car.fuel != null && open.fuel_start != null ? car.fuel - open.fuel_start : null,
      uncertain: boundaryTime.uncertain ? 1 : 0,
    })
    applyDiscountDiff(car.id, newParkingId, car.discounts, now)
  }

  for (const [carId, open] of openParkings) {
    if (seenCarIds.has(carId)) continue
    statements.closeParking.run({
      id: open.id,
      endedAt: boundaryTime.time,
      endReason: 'rented',
      uncertain: boundaryTime.uncertain ? 1 : 0,
      fuelEnd: null,
    })
  }
}

async function runCycle(zoneIds) {
  const zonesFailed = []
  let carsSeenTotal = 0

  for (const zoneId of zoneIds) {
    const startedAt = new Date().toISOString()
    let error = null
    let carsSeen = 0
    let apiLastUpdate = null

    try {
      const { cars } = await fetchJson(`/cars?zoneId=${zoneId}`)
      carsSeen = cars.length
      apiLastUpdate = cars.reduce((max, c) => (c.lastUpdate > (max ?? '') ? c.lastUpdate : max), null)

      const lastGood = statements.lastGoodRun.get(zoneId)
      const now = new Date()
      const boundaryTime = lastGood
        ? {
            time: lastGood.finished_at,
            uncertain: now.getTime() - new Date(lastGood.finished_at).getTime() > GAP_THRESHOLD_MIN * 60 * 1000,
          }
        : { time: now.toISOString(), uncertain: false }

      const relocationCars = cars.filter((c) => c.discounts?.some((d) => d.name === 'Relokacja'))
      const relocationAmountSum = relocationCars.reduce(
        (sum, c) => sum + c.discounts.find((d) => d.name === 'Relokacja').amount,
        0
      )

      db.transaction(() => {
        processZone(zoneId, cars, now.toISOString(), boundaryTime)
        statements.insertZoneSnapshot.run({
          zoneId,
          takenAt: now.toISOString(),
          carsAvailable: carsSeen,
          carsRelocation: relocationCars.length,
          relocationAmountSum,
        })
      })()

      carsSeenTotal += carsSeen
    } catch (err) {
      error = err.message
      zonesFailed.push(zoneId)
    }

    statements.insertPollRun.run({
      startedAt,
      finishedAt: new Date().toISOString(),
      zoneId,
      carsSeen,
      apiLastUpdate,
      error,
    })
  }

  return { carsSeen: carsSeenTotal, zonesFailed }
}

async function main() {
  const zoneIds = await loadReferenceData()
  console.log(`collector started, ${zoneIds.length} zones, cycle every ${CYCLE_INTERVAL_MS / 1000}s`)

  const tick = async () => {
    const t0 = Date.now()
    const series = Date.now().toString(36)
    await ping('traficar-collector', { state: 'run', series })
    try {
      const { carsSeen, zonesFailed } = await runCycle(zoneIds)
      const durationS = ((Date.now() - t0) / 1000).toFixed(1)
      await ping('traficar-collector', {
        state: zonesFailed.length === zoneIds.length ? 'fail' : 'complete',
        series,
        metric: [`count:${carsSeen}`, `duration:${durationS}`, `error_count:${zonesFailed.length}`],
        message: zonesFailed.length ? `strefy bez danych: ${zonesFailed.join(',')}` : '',
      })
      console.log(
        `cycle done in ${durationS}s, ${carsSeen} cars, ${zonesFailed.length} zones failed` +
          (zonesFailed.length ? ` [${zonesFailed.join(',')}]` : '')
      )
    } catch (err) {
      console.error('cycle failed', err)
      await ping('traficar-collector', { state: 'fail', series, message: err.message })
    }
  }

  let running = false
  const guardedTick = async () => {
    if (running) {
      console.warn('previous cycle still running, skipping this tick')
      return
    }
    running = true
    try {
      await tick()
    } finally {
      running = false
    }
  }

  await guardedTick()
  setInterval(guardedTick, CYCLE_INTERVAL_MS)
}

main()
