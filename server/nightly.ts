import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb } from './db/migrate.js'
import { ping } from './cronitor.js'

process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection (ignored)', err)
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'traficar.db')
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups')

const RETENTION_DAYS = 180
const GONE_AFTER_HOURS = 48
const BACKUP_KEEP_DAYS = 14
const RUN_HOUR_UTC = 3

// `as any`: better-sqlite3 types every row `unknown` without a generic per
// prepared statement — not worth an interface per query here (see tsconfig).
const db = openDb() as any

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function markGoneCars() {
  const cutoff = new Date(Date.now() - GONE_AFTER_HOURS * 60 * 60 * 1000).toISOString()
  const result = db
    .prepare(
      `UPDATE parkings SET end_reason = 'gone'
       WHERE end_reason = 'rented' AND ended_at < ?
         AND car_id NOT IN (SELECT car_id FROM parkings WHERE ended_at IS NULL)`
    )
    .run(cutoff)
  return result.changes
}

function applyRetention() {
  const cutoff = isoDaysAgo(RETENTION_DAYS)
  const changes: Record<string, number> = {}
  changes.trips = db.prepare('DELETE FROM trips WHERE departed_at < ?').run(cutoff).changes
  changes.discountSpans = db
    .prepare("DELETE FROM discount_spans WHERE started_at < ? AND ended_at IS NOT NULL")
    .run(cutoff).changes
  changes.parkings = db
    .prepare('DELETE FROM parkings WHERE started_at < ? AND ended_at IS NOT NULL')
    .run(cutoff).changes
  changes.pollRuns = db.prepare('DELETE FROM poll_runs WHERE started_at < ?').run(cutoff).changes
  changes.zoneSnapshots = db
    .prepare('DELETE FROM zone_snapshots WHERE taken_at < ?')
    .run(cutoff).changes
  return changes
}

async function backupDb() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const dest = path.join(BACKUP_DIR, `traficar-${stamp}.db`)
  await db.backup(dest)

  const cutoffMs = Date.now() - BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const filePath = path.join(BACKUP_DIR, file)
    if (fs.statSync(filePath).mtimeMs < cutoffMs) fs.unlinkSync(filePath)
  }
  return dest
}

async function runNightly() {
  await ping('traficar-nightly', { state: 'run' })
  try {
    const goneCount = markGoneCars()
    const retentionChanges = applyRetention()
    db.exec('VACUUM')
    const backupPath = await backupDb()

    console.log(`nightly done: gone=${goneCount}, retention=${JSON.stringify(retentionChanges)}, backup=${backupPath}`)
    await ping('traficar-nightly', {
      state: 'complete',
      message: `gone=${goneCount} backup=${path.basename(backupPath)}`,
    })
  } catch (err) {
    console.error('nightly failed', err)
    await ping('traficar-nightly', { state: 'fail', message: err.message })
  }
}

function msUntilNextRun() {
  const next = new Date()
  next.setUTCHours(RUN_HOUR_UTC, 0, 0, 0)
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - Date.now()
}

async function main() {
  if (process.env.NIGHTLY_RUN_NOW) {
    await runNightly()
    return
  }
  const delay = msUntilNextRun()
  console.log(`nightly job scheduled, next run in ${Math.round(delay / 60000)} min`)
  setTimeout(async function loop() {
    await runNightly()
    setTimeout(loop, 24 * 60 * 60 * 1000)
  }, delay)
}

main()
