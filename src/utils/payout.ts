// Szacowany zwrot za relokację: stała premia 30 zł minus koszt przejazdu.
// Stawki Traficar: start 4,99 zł + 2,39 zł/km; Arkana 5,99 zł + 2,69 zł/km.
// Kilometry z trasy OSRM, zaokrąglane W GÓRĘ do pełnego km (3,5 → 4).
const BONUS = 30

export function relocationPayout(modelName: string | null | undefined, routeKm: number) {
  const arkana = /arkana/i.test(modelName ?? '')
  const start = arkana ? 5.99 : 4.99
  const perKm = arkana ? 2.69 : 2.39
  return BONUS - start - perKm * Math.ceil(routeKm)
}

export function formatPayout(zl: number) {
  return `${zl.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
}
