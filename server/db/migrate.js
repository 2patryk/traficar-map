import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'traficar.db')
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations')

export function openDb() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  return db
}

export function migrate(db = openDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const applied = new Set(
    db.prepare('SELECT filename FROM schema_migrations').all().map((row) => row.filename)
  )

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString()
      )
    })()
    console.log(`applied migration: ${file}`)
  }

  return db
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  migrate()
  console.log(`db ready at ${DB_PATH}`)
}
