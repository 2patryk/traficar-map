import { useCallback, useEffect, useRef, useState } from 'react'

export function useGeolocation() {
  const [position, setPosition] = useState(null)
  // Osobno od `position`: pozycja z jawnego kliknięcia "Moja lokalizacja" —
  // tylko ona ma przesuwać mapę. Ciche aktualizacje z watchPosition ruszają
  // wyłącznie kropkę, inaczej mapa skakałaby za użytkownikiem co kilka sekund.
  const [fix, setFix] = useState(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)
  const watchIdRef = useRef(null)

  const startWatch = useCallback(() => {
    if (watchIdRef.current != null) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000 },
    )
  }, [])

  const request = useCallback(
    ({ watch = false } = {}) => {
      if (!navigator.geolocation) {
        setDenied(true)
        return
      }
      setLoading(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setPosition(p)
          setFix(p)
          setDenied(false)
          setLoading(false)
          if (watch) startWatch()
        },
        () => {
          setDenied(true)
          setLoading(false)
        },
      )
    },
    [startWatch],
  )

  useEffect(() => {
    request()
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [request])

  return { position, fix, denied, loading, request }
}
