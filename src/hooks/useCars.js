import { useCallback, useEffect, useState } from 'react'
import { fetchCars } from '../api.js'

const REFRESH_INTERVAL_MS = 60_000

export function useCars(zoneId, discountTypes) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(() => {
    if (!zoneId) return
    setLoading(true)
    fetchCars(zoneId, discountTypes)
      .then((data) => {
        setCars(data)
        setError(null)
        setLastUpdated(new Date())
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [zoneId, discountTypes])

  useEffect(() => {
    load()
    if (!zoneId) return
    const id = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [zoneId, load])

  return { cars, loading, error, refresh: load, lastUpdated }
}
