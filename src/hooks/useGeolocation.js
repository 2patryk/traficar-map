import { useEffect, useState } from 'react'

export function useGeolocation() {
  const [position, setPosition] = useState(null)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setDenied(true),
    )
  }, [])

  return { position, denied }
}
