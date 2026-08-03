// Jednorazowy skrypt: scala sąsiednie postoje tego samego auta w tym samym
// miejscu, między którymi nie ma żadnego przejazdu (zwykle relikt po
// clean-zero-km-trips.ts albo starym buggu w collectorze).
// Uruchom: npx tsx server/scripts/merge-stray-parkings.ts [--dry-run]
import { openDb } from '../db/migrate.js'

const MOVE_THRESHOLD_KM = 0.12 // spójne z MOVE_THRESHOLD_M w collector.ts

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const db = openDb() as any
const dryRun = process.argv.includes('--dry-run')

const carIds = db.prepare('SELECT DISTINCT car_id FROM parkings ORDER BY car_id').all().map((r: any) => r.car_id)

const hasTripBetween = db.prepare(
  'SELECT 1 FROM trips WHERE from_parking = ? AND to_parking = ? LIMIT 1'
)
const relinkDiscounts = db.prepare('UPDATE discount_spans SET parking_id = @newId WHERE parking_id = @oldId')
const relinkTripsFrom = db.prepare('UPDATE trips SET from_parking = @newId WHERE from_parking = @oldId')
const relinkTripsTo = db.prepare('UPDATE trips SET to_parking = @newId WHERE to_parking = @oldId')
const mergeParking = db.prepare(
  'UPDATE parkings SET ended_at = @endedAt, end_reason = @endReason, uncertain = @uncertain, fuel_end = @fuelEnd WHERE id = @id'
)
const deleteParking = db.prepare('DELETE FROM parkings WHERE id = ?')

let mergedCount = 0
let inspected = 0

const doMerges = () => {
  for (const carId of carIds) {
    const rows = db
      .prepare('SELECT * FROM parkings WHERE car_id = ? ORDER BY started_at ASC')
      .all(carId)

    let anchor = rows[0]
    for (let i = 1; i < rows.length; i++) {
      const next = rows[i]
      inspected++

      if (!anchor.ended_at) {
        // anchor nigdy się nie powinien nie-zamknąć przed kolejnym postojem —
        // ale gdyby tak było, po prostu przesuwamy okno dalej
        anchor = next
        continue
      }

      const distance = haversineMeters(anchor.lat, anchor.lng, next.lat, next.lng)
      const bridged = hasTripBetween.get(anchor.id, next.id)

      if (!bridged && distance < MOVE_THRESHOLD_KM * 1000) {
        mergedCount++
        if (!dryRun) {
          relinkDiscounts.run({ newId: anchor.id, oldId: next.id })
          relinkTripsFrom.run({ newId: anchor.id, oldId: next.id })
          relinkTripsTo.run({ newId: anchor.id, oldId: next.id })
          mergeParking.run({
            id: anchor.id,
            endedAt: next.ended_at,
            endReason: next.end_reason,
            uncertain: next.uncertain,
            fuelEnd: next.fuel_end,
          })
          deleteParking.run(next.id)
          // anchor scalony w bazie — dociągamy świeży stan zamiast trzymać stary obiekt
          anchor = { ...anchor, ended_at: next.ended_at, end_reason: next.end_reason, fuel_end: next.fuel_end }
        }
        continue
      }

      anchor = next
    }
  }
}

if (dryRun) {
  doMerges()
  console.log(`Sprawdzono ${inspected} par postojów, do scalenia: ${mergedCount}`)
} else {
  db.transaction(doMerges)()
  console.log(`Scalono ${mergedCount} par postojów`)
}
