// Jednorazowy skrypt: zamyka zduplikowane "otwarte" discount_spans powstałe
// przez stary bug w collectorze (auto znikało z pollu -> nowy rekord postoju
// zamiast wznowienia starego -> applyDiscountDiff zakładał nowe spany, a stare
// nigdy się nie zamykały). merge-stray-parkings.ts scalił te postoje, więc
// zombie-spany trafiły na jeden parking_id i widać je zdublowane w UI.
// Uruchom: npx tsx server/scripts/dedupe-discount-spans.ts [--dry-run]
import { openDb } from '../db/migrate.js'

const db = openDb() as any
const dryRun = process.argv.includes('--dry-run')

const openSpans = db
  .prepare(
    'SELECT id, car_id, type, started_at FROM discount_spans WHERE ended_at IS NULL ORDER BY car_id, type, started_at ASC'
  )
  .all()

const groups = new Map<string, typeof openSpans>()
for (const s of openSpans) {
  const key = `${s.car_id}:${s.type}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key)!.push(s)
}

const toClose: { id: number; endedAt: string }[] = []
for (const spans of groups.values()) {
  for (let i = 0; i < spans.length - 1; i++) {
    toClose.push({ id: spans[i].id, endedAt: spans[i + 1].started_at })
  }
}

console.log(`${toClose.length} zduplikowanych otwartych spanów do zamknięcia (z ${openSpans.length} otwartych łącznie)`)

if (!dryRun) {
  const close = db.prepare('UPDATE discount_spans SET ended_at = @endedAt WHERE id = @id')
  db.transaction(() => {
    for (const c of toClose) close.run(c)
  })()
  console.log('Zamknięto.')
}
