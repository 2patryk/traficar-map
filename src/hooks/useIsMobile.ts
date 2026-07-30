import { useEffect, useState } from 'react'

// Próg pokrywa się z dawnym @media (min-width: 860px) z App.css — poniżej
// tego progu sheet jedzie jako dolny Drawer, powyżej jako stały panel boczny.
const BREAKPOINT = 860

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < BREAKPOINT)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    onChange()
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
