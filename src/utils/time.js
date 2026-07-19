// Skrótowy czas od `iso` do teraz: "5m", "3h", "2d". Poniżej minuty — "<1m".
export function formatElapsed(iso, now = Date.now()) {
  const diffMin = Math.floor((now - Date.parse(iso)) / 60_000)
  if (diffMin < 1) return '<1m'
  if (diffMin < 60) return `${diffMin}m`
  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
