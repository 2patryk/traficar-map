import { useEffect, useState } from 'react'
import { fetchRelocationZoneShape } from '../api'
import type { ZoneShape } from '../types/api'

export function useRelocationZone(zoneId: string) {
  const [shape, setShape] = useState<ZoneShape | null>(null)
  // Bumped only when `shape` actually changes, so consumers (e.g. react-leaflet's
  // <GeoJSON>, which never re-reads an updated `data` prop) can key a remount on
  // it — keying on `zoneId` directly remounts too early, before the async fetch
  // for that zone has resolved, and then never again once it does.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!zoneId) {
      setShape(null)
      return
    }
    let cancelled = false
    fetchRelocationZoneShape(zoneId)
      .then((geo) => {
        if (cancelled) return
        setShape(geo)
        setVersion((v) => v + 1)
      })
      .catch(() => {
        if (!cancelled) setShape(null)
      })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  return { shape, version }
}
