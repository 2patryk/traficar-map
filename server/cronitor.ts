const KEY = process.env.CRONITOR_API_KEY

type PingParams = Record<string, string | number | string[] | undefined | null>

// Nigdy nie może wywalić ani zablokować cyklu — monitoring to nie ścieżka krytyczna.
// `metric` musi iść jako powtórzone parametry (metric=a&metric=b) — Cronitor
// odpowiada 500 gdy dostanie kilka metryk sklejonych przecinkiem w jednym polu.
export async function ping(monitor: string, params: PingParams = {}): Promise<void> {
  if (!KEY) return
  const qs = new URLSearchParams({ env: 'production', host: 'mikrus' })
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v))
    else qs.append(key, String(value))
  }
  try {
    await fetch(`https://cronitor.link/p/${KEY}/${monitor}?${qs}`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // celowo puste
  }
}
