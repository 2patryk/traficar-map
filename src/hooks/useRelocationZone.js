import { useEffect, useState } from 'react'
import { fetchRelocationZoneShape } from '../api.js'

export function useRelocationZone(zoneId) {
  const [shape, setShape] = useState(null)

  useEffect(() => {
    if (!zoneId) {
      setShape(null)
      return
    }
    let cancelled = false
    fetchRelocationZoneShape(zoneId)
      .then((geo) => {
        if (!cancelled) setShape(geo)
      })
      .catch(() => {
        if (!cancelled) setShape(null)
      })
    return () => {
      cancelled = true
    }
  }, [zoneId])

  return shape
}
