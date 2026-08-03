// Jednorazowy skrypt: usuwa historyczne "przejazdy" powstałe przez zanik/powrót
// auta z pollu (nocne odświeżenie floty) bez realnego ruchu.
// Uruchom: npx tsx server/scripts/clean-zero-km-trips.ts [--dry-run]
import { openDb } from '../db/migrate.js'

const MOVE_THRESHOLD_KM = 0.12 // spójne z MOVE_THRESHOLD_M w collector.ts

const db = openDb() as any
const dryRun = process.argv.includes('--dry-run')

const rows = db
  .prepare('SELECT id, car_id, straight_km, departed_at, arrived_at FROM trips WHERE straight_km < ?')
  .all(MOVE_THRESHOLD_KM)

console.log(`Znaleziono ${rows.length} przejazdów poniżej ${MOVE_THRESHOLD_KM * 1000}m`)

if (rows.length && dryRun) {
  console.log(rows.slice(0, 20))
}

if (!dryRun) {
  const del = db.prepare('DELETE FROM trips WHERE straight_km < ?')
  const result = del.run(MOVE_THRESHOLD_KM)
  console.log(`Usunięto ${result.changes} wierszy`)
}
