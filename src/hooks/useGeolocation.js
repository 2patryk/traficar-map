import { useCallback, useEffect, useState } from 'react'

export function useGeolocation() {
  const [position, setPosition] = useState(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setDenied(true)
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setDenied(false)
        setLoading(false)
      },
      () => {
        setDenied(true)
        setLoading(false)
      },
    )
  }, [])

  useEffect(() => {
    request()
  }, [request])

  return { position, denied, loading, request }
}
