const KEY = process.env.CRONITOR_API_KEY

// Nigdy nie może wywalić ani zablokować cyklu — monitoring to nie ścieżka krytyczna.
export async function ping(monitor, params = {}) {
  if (!KEY) return
  const qs = new URLSearchParams({ env: 'production', host: 'mikrus', ...params })
  try {
    await fetch(`https://cronitor.link/p/${KEY}/${monitor}?${qs}`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // celowo puste
  }
}
