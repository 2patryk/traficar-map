import { useCallback, useEffect, useState } from 'react'
import { fetchCars } from '../api.js'

const REFRESH_INTERVAL_MS = 60_000

export function useCars(zoneId, discountTypes) {
  // `carsFor` pamięta, dla jakich parametrów pobrano dane — przy przełączeniu
  // filtra stare auta renderujemy dalej w ICH trybie, aż przyjdą świeże.
  const [result, setResult] = useState({ cars: [], carsFor: undefined })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(() => {
    if (!zoneId) return
    setLoading(true)
    fetchCars(zoneId, discountTypes)
      .then((data) => {
        setResult({ cars: data, carsFor: discountTypes })
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

  // Tryb, w jakim faktycznie pobrano widoczne dane (undefined = jeszcze nic)
  const carsShowAll = result.carsFor === undefined ? undefined : result.carsFor === null

  return { cars: result.cars, carsShowAll, loading, error, refresh: load, lastUpdated }
}
