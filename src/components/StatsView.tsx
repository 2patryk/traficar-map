import { useEffect, useMemo, useState } from 'react'
import { fetchStatsHistory, fetchStatsSummary } from '../api'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { StatsHistoryPoint, StatsSummary, Zone } from '../types/api'

interface StatsViewProps {
  zones: Zone[]
  zoneId: string
  onZoneChange: (zoneId: string) => void
}

const RANGE_OPTIONS = [
  { value: 1, label: '24h' },
  { value: 7, label: '7 dni' },
  { value: 30, label: '30 dni' },
]

type SortKey = 'name' | 'carsAvailable' | 'carsRelocation' | 'relocationAmountSum'

function formatBucket(iso: string, days: number) {
  const d = new Date(iso)
  return days <= 1
    ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit' })
}

// Etykiety na końcach osi X zawsze z datą — w widoku 24h same godziny
// pierwszego i ostatniego punktu wychodzą identyczne (dokładnie doba różnicy)
function formatAxisEdge(iso: string) {
  return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Ładne okrągłe wartości osi Y (0, step, 2*step, …) zamiast surowego maxa —
// inaczej siatka ląduje na liczbach typu "137,4"
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const rawStep = max / count
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const norm = rawStep / mag
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  const step = niceNorm * mag
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.01; v += step) ticks.push(Math.round(v))
  return ticks
}

function SortChevron({ direction }: { direction: 'asc' | 'desc' | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={`size-3 shrink-0 transition-opacity ${direction ? 'opacity-100' : 'opacity-0'} ${direction === 'asc' ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SortableHead({
  label,
  active,
  direction,
  onClick,
  align = 'left',
}: {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
  align?: 'left' | 'right'
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 font-medium hover:text-foreground ${align === 'right' ? 'ml-auto flex-row-reverse' : ''} ${active ? 'text-foreground' : ''}`}
      >
        {label}
        <SortChevron direction={active ? direction : null} />
      </button>
    </TableHead>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-3xl font-bold tabular-nums ${accent ? 'text-money' : 'text-foreground'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function ZoneChart({ series, days, zoneName }: { series: StatsHistoryPoint[]; days: number; zoneName: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const W = 640
  const H = 220
  const PAD_X = 16
  const PAD_LEFT = 40
  const PAD_TOP = 16
  const PAD_BOTTOM = 28

  const rawMax = Math.max(1, ...series.flatMap((s) => [s.carsAvailable ?? 0, s.carsRelocation ?? 0]))
  const ticks = niceTicks(rawMax)
  const maxVal = ticks[ticks.length - 1]
  const n = series.length

  const xAt = (i: number) => PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD_LEFT - PAD_X))
  const yAt = (v: number) => H - PAD_BOTTOM - (v / maxVal) * (H - PAD_BOTTOM - PAD_TOP)

  const pathFor = (key: 'carsAvailable' | 'carsRelocation') =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(s[key] ?? 0)}`).join(' ')

  if (n === 0) {
    return <p className="empty-state">Za mało danych — wróć za chwilę.</p>
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-heading text-sm font-semibold tracking-wide text-foreground uppercase">{zoneName}</p>
            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-available" /> Dostępne
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-chart-relocation" /> Z Relokacją
              </span>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAsTable((v) => !v)}>
            {asTable ? 'Pokaż wykres' : 'Pokaż jako tabelę'}
          </Button>
        </div>

        {asTable ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Czas</TableHead>
                <TableHead>Dostępne</TableHead>
                <TableHead>Z Relokacją</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.map((s) => (
                <TableRow key={s.bucket}>
                  <TableCell>{formatBucket(s.bucket, days)}</TableCell>
                  <TableCell className="font-mono">{s.carsAvailable}</TableCell>
                  <TableCell className="font-mono">{s.carsRelocation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full rounded-lg bg-background"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const x = ((e.clientX - rect.left) / rect.width) * W
                const idx = Math.round(((x - PAD_LEFT) / (W - PAD_LEFT - PAD_X)) * (n - 1))
                setHoverIdx(Math.min(n - 1, Math.max(0, idx)))
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD_LEFT}
                    y1={yAt(t)}
                    x2={W - PAD_X}
                    y2={yAt(t)}
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text x={PAD_LEFT - 8} y={yAt(t)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="var(--muted-foreground)">
                    {t}
                  </text>
                </g>
              ))}
              <path d={pathFor('carsAvailable')} fill="none" stroke="var(--chart-available)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathFor('carsRelocation')} fill="none" stroke="var(--chart-relocation)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

              {[0, n - 1].map((i) => (
                <text
                  key={i}
                  x={xAt(i)}
                  y={H - PAD_BOTTOM + 16}
                  textAnchor={i === 0 ? 'start' : 'end'}
                  fontSize="10"
                  fill="var(--muted-foreground)"
                >
                  {formatAxisEdge(series[i].bucket)}
                </text>
              ))}

              {hoverIdx != null && (
                <>
                  <line
                    x1={xAt(hoverIdx)}
                    y1={PAD_TOP}
                    x2={xAt(hoverIdx)}
                    y2={H - PAD_BOTTOM}
                    stroke="var(--muted-foreground)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle cx={xAt(hoverIdx)} cy={yAt(series[hoverIdx].carsAvailable ?? 0)} r="4" fill="var(--chart-available)" stroke="var(--card)" strokeWidth="2" />
                  <circle cx={xAt(hoverIdx)} cy={yAt(series[hoverIdx].carsRelocation ?? 0)} r="4" fill="var(--chart-relocation)" stroke="var(--card)" strokeWidth="2" />
                </>
              )}
            </svg>

            <div className="h-5 font-mono text-xs text-muted-foreground">
              {hoverIdx != null && (
                <>
                  {formatBucket(series[hoverIdx].bucket, days)} · dostępne: {series[hoverIdx].carsAvailable} · z
                  Relokacją: {series[hoverIdx].carsRelocation}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function StatsView({ zones, zoneId, onZoneChange }: StatsViewProps) {
  const [days, setDays] = useState(1)
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [history, setHistory] = useState<StatsHistoryPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('carsAvailable')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchStatsSummary(days)
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [days])

  useEffect(() => {
    if (!zoneId) {
      setHistory(null)
      return
    }
    setHistory(null)
    fetchStatsHistory(zoneId, days)
      .then((data) => setHistory(data.series))
      .catch((err) => setError(err.message))
  }, [zoneId, days])

  const zoneName = useMemo(
    () => zones.find((z) => String(z.id) === String(zoneId))?.name ?? '',
    [zones, zoneId],
  )

  const sortedZones = useMemo(() => {
    if (!summary) return []
    const dir = sortDir === 'asc' ? 1 : -1
    return [...summary.zones].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * dir
    })
  }, [summary, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-4 sm:p-6">
      <h2 className="font-heading text-2xl font-bold tracking-wide uppercase">Statystyki floty</h2>

      {error && <p className="status-strip error">{error}</p>}

      {summary && (
        <section className="flex flex-col gap-3">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <StatCard label="Dostępne teraz" value={summary.totals.carsAvailable} />
            <StatCard label="Z rabatem Relokacja" value={summary.totals.carsRelocation} accent />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Strefa" active={sortKey === 'name'} direction={sortDir} onClick={() => toggleSort('name')} />
                  <SortableHead label="Dostępne" active={sortKey === 'carsAvailable'} direction={sortDir} onClick={() => toggleSort('carsAvailable')} />
                  <SortableHead label="Z Relokacją" active={sortKey === 'carsRelocation'} direction={sortDir} onClick={() => toggleSort('carsRelocation')} />
                  <SortableHead label="Suma rabatów" active={sortKey === 'relocationAmountSum'} direction={sortDir} onClick={() => toggleSort('relocationAmountSum')} align="right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedZones.map((z) => (
                  <TableRow
                    key={z.zoneId}
                    data-selected={String(z.zoneId) === String(zoneId) || undefined}
                    className="cursor-pointer data-[selected]:bg-primary/10"
                    onClick={() => onZoneChange(String(z.zoneId))}
                  >
                    <TableCell>{z.name}</TableCell>
                    <TableCell className="font-mono">{z.carsAvailable ?? '—'}</TableCell>
                    <TableCell className="font-mono text-money">{z.carsRelocation ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono">{z.relocationAmountSum ?? 0} zł</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Trend w czasie
          </h3>
          <Tabs value={days} onValueChange={(v) => setDays(v as number)}>
            <TabsList>
              {RANGE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {history ? (
          <ZoneChart series={history} days={days} zoneName={zoneName || 'Wybierz strefę'} />
        ) : (
          <p className="loading-state">Wczytuję…</p>
        )}
      </section>
    </div>
  )
}
