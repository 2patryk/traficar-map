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
  const PAD = 32

  const maxVal = Math.max(1, ...series.flatMap((s) => [s.carsAvailable ?? 0, s.carsRelocation ?? 0]))
  const n = series.length

  const xAt = (i: number) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD * 2))
  const yAt = (v: number) => H - PAD - (v / maxVal) * (H - PAD * 2)

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
                const idx = Math.round(((x - PAD) / (W - PAD * 2)) * (n - 1))
                setHoverIdx(Math.min(n - 1, Math.max(0, idx)))
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
              <path d={pathFor('carsAvailable')} fill="none" stroke="var(--chart-available)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d={pathFor('carsRelocation')} fill="none" stroke="var(--chart-relocation)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

              {hoverIdx != null && (
                <>
                  <line
                    x1={xAt(hoverIdx)}
                    y1={PAD}
                    x2={xAt(hoverIdx)}
                    y2={H - PAD}
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
  // `null` = tylko liczby live (bez zakresu) — sekcja trendu nie odpala
  // zapytania historycznego, dopóki użytkownik świadomie nie wybierze zakresu
  const [days, setDays] = useState<number | null>(null)
  const [summary, setSummary] = useState<StatsSummary | null>(null)
  const [history, setHistory] = useState<StatsHistoryPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('carsAvailable')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchStatsSummary(days ?? 7)
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [days])

  useEffect(() => {
    if (!zoneId || days == null) {
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
          <Tabs value={days} onValueChange={(v) => setDays(v as number | null)}>
            <TabsList>
              {RANGE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {days == null ? (
          <p className="empty-state">
            Wybierz zakres, żeby zobaczyć trend {zoneName ? `dla strefy ${zoneName}` : ''}.
          </p>
        ) : history ? (
          <ZoneChart series={history} days={days} zoneName={zoneName || 'Wybierz strefę'} />
        ) : (
          <p className="loading-state">Wczytuję…</p>
        )}
      </section>
    </div>
  )
}
