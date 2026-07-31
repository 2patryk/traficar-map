import { useCallback, useEffect, useRef, useState } from 'react'
import type { LatLng } from '../utils/geo'

export interface GeoPosition extends LatLng {
  heading: number | null
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null)
  // Osobno od `position`: pozycja z jawnego kliknięcia — tylko ona (i tryb
  // `follow`) mają przesuwać mapę. Ciche aktualizacje z watchPosition same
  // ruszają wyłącznie kropkę, inaczej mapa skakałaby za użytkownikiem co chwilę.
  const [fix, setFix] = useState<LatLng | null>(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [follow, setFollow] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  const startWatch = useCallback(() => {
    if (watchIdRef.current != null) return
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading }),
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
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading }
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

  // "Śledź mnie": kamera jedzie za każdą aktualizacją watcha, dopóki
  // użytkownik ręcznie nie przesunie mapy (stopFollow z dragstart)
  const toggleFollow = useCallback(() => {
    setFollow((was) => {
      if (!was) request({ watch: true })
      return !was
    })
  }, [request])

  const stopFollow = useCallback(() => setFollow(false), [])

  useEffect(() => {
    request()
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [request])

  return { position, fix, denied, loading, follow, toggleFollow, stopFollow }
}
