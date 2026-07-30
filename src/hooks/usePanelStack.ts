import { useCallback, useState } from 'react'
import type { Car } from '../types/api'

// Stos warstw sheetu. `list`/`ranking` to baza (indeks 0, wymieniana przez
// toggle, nie push/pop) — `car`/`history` to nakładki pushowane na wierzch.
// Strzałka powrotu w nagłówku sheetu pokazuje się tylko gdy stack.length > 1.
export type PanelLayer =
  | { kind: 'list' }
  | { kind: 'ranking' }
  | { kind: 'car'; car: Car }
  | { kind: 'history'; car: Car }

const DEFAULT_BASE: PanelLayer = { kind: 'list' }

export function usePanelStack(initialBase: PanelLayer = DEFAULT_BASE) {
  const [stack, setStack] = useState<PanelLayer[]>([initialBase])

  const push = useCallback((layer: PanelLayer) => {
    setStack((s) => [...s, layer])
  }, [])

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }, [])

  const replace = useCallback((layer: PanelLayer) => {
    setStack((s) => [...s.slice(0, -1), layer])
  }, [])

  // Podmienia bazę (list <-> ranking) i odrzuca wszystkie nakładki nad nią —
  // baza to toggle z headera, nie krok nawigacji do cofnięcia gestem.
  const setBase = useCallback((layer: PanelLayer) => {
    setStack([layer])
  }, [])

  // Zostaje sama baza (obecny kind), nakładki (auto/historia) znikają —
  // do użycia przy zmianie strefy, która unieważnia wybór auta.
  const collapseToBase = useCallback(() => {
    setStack((s) => (s.length > 1 ? [s[0]] : s))
  }, [])

  return { stack, top: stack[stack.length - 1], push, pop, replace, setBase, collapseToBase }
}
