// Skrótowy czas od `iso` do teraz, dwie jednostki: "1d 2h", "3h 15m", "45m".
// Poniżej minuty — "<1m".
export function formatElapsed(iso, now = Date.now()) {
  const diffMin = Math.floor((now - Date.parse(iso)) / 60_000)
  if (diffMin < 1) return '<1m'
  if (diffMin < 60) return `${diffMin}m`

  const hours = Math.floor(diffMin / 60)
  const minutes = diffMin % 60
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`
}

// Pełna precyzja co do minuty: "1d 2h 17m" — do popupu po kliknięciu w pinezkę
export function formatElapsedExact(iso, now = Date.now()) {
  const diffMin = Math.floor((now - Date.parse(iso)) / 60_000)
  if (diffMin < 1) return '<1m'

  const days = Math.floor(diffMin / 1440)
  const hours = Math.floor((diffMin % 1440) / 60)
  const minutes = diffMin % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

// Czas trwania z gotowej liczby minut (np. z API): "1d 2h", "45m"
export function formatDurationMin(totalMin) {
  if (totalMin < 1) return '<1m'
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const minutes = totalMin % 60

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  if (days === 0) parts.push(`${minutes}m`)
  return parts.join(' ')
}
