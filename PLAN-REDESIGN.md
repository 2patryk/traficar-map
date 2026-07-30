# Redesign: mobilny "łowca relokacji"

## Kontekst

Aplikacja wyrosła z desktopowego układu mapa + lista, a używana jest głównie **na telefonie w terenie**, gdzie jedyny cel to: *znajdź auto z rabatem Relokacja, na którym zarobię, i dojedź do niego*.

Główny problem strukturalny: lista, ranking i historia dzielą jedno miejsce w DOM (`App.jsx` renderuje `historyCar ? <CarHistory/> : showRanking ? <LongestParkedPanel/> : <CarList/>`). Panele wypychają się wzajemnie, tracą kontekst; funkcje wtórne (heatmapa, statystyki, ranking) mieszają się z główną ścieżką. Dodatkowo najważniejsza liczba (szacowany zwrot netto) jest drobnym tekstem w drugiej linii wiersza, a akcje (nawigacja, historia) to 16-pikselowe ikony.

Cel: mapa pełnoekranowa + przesuwany bottom sheet z warstwami widoków, jeden spójny stos nawigacji, karta auta ze zwrotem jako główną liczbą i nawigacją jako główną akcją. Stack: **TypeScript w całym repo + Tailwind v4 + shadcn/ui**, migracja etapami na gałęzi `redesign`, aplikacja działa po każdym etapie.

## Decyzje

| Temat | Decyzja |
|---|---|
| Priorytet urządzenia | Mobile-first; desktop = ten sam kod, sheet zamienia się w stały panel boczny |
| Układ | Mapa full-screen + bottom sheet (snap: peek / ½ / full) |
| Ranking, historia | Warstwy w stosie sheetu (ze strzałką powrotu) |
| Heatmapa | Przełącznik warstwy mapy |
| Statystyki | Osobny ekran (jak dziś, wejście z topbara) |
| Wiersz auta | Zwrot netto (główna liczba) · dystans+czas do mnie · trasa auto→strefa |
| Filtry widoczne | Segment „z rabatem / wszystkie"; reszta pod przyciskiem „Filtry" |
| Sort domyślny | „Najbliżej mnie" (jak dziś) |
| Parytet | Nic nie wypada — statystyki z wykresem i tabelą zostają |
| Dodatki | Śledzenie pozycji (watch + strzałka kierunku), duży CTA „Nawiguj" |
| Wygląd | Ciemna baza, fiolet zredukowany do stref na mapie, akcent (limonka/zieleń) tylko dla pieniędzy |

## Etapy

### 1. Fundament TS (frontend)
- `tsconfig.json` + `tsconfig.node.json`, alias `@/*` → `src/*` (wymagane przez shadcn), `vite-env.d.ts`.
- Zmiana rozszerzeń `src/**` na `.ts`/`.tsx`; typy kontraktu API w `src/types/api.ts` (Car, Zone, Discount, Parking, HistoryTimelineEntry, StatsSummary, HeatmapCell) — źródłem prawdy są dzisiejsze odpowiedzi z `server/api.js`.
- `src/api.js` → `api.ts` z typowanymi zwrotkami; istniejąca logika (`fetchCars` łączy feed z `fetchCarModels`) bez zmian.
- oxlint na TS, `npm run build` i `tsc --noEmit` muszą przechodzić na końcu etapu.

### 2. Tailwind v4 + shadcn + tokeny
- **Przed implementacją wczytać skill `vercel:shadcn`** (CLI, struktura, theming).
- `@tailwindcss/vite`, `src/styles/globals.css` z `@import "tailwindcss"` i tokenami z dzisiejszego `src/index.css` (`--bg`, `--surface`, `--border`, `--accent`…) przemapowanymi na zmienne shadcn (`--background`, `--card`, `--primary`…). Nowy token `--money` + `--money-negative`.
- Zachować `@media (prefers-color-scheme: light)` — czytelność w słońcu.
- Uwaga: Tailwind preflight vs `leaflet/dist/leaflet.css` — leaflet importować **po** Tailwind i sprawdzić kontrolki zoom/atrybucję.
- Komponenty shadcn: `drawer` (vaul, snap points), `button`, `badge`, `tabs`, `toggle-group`, `select`, `table`, `separator`, `scroll-area`, `skeleton`.
- `App.css` znika etapami — dopóki komponent nie jest przepisany, jego klasy zostają.

### 3. Stos nawigacji zamiast trzech flag
Dziś w `src/App.jsx`: `view`, `showRanking`, `historyCar`, `pinnedCar`, `selectedCarId` + trójstopniowy ternary. Zamiast tego:
- `src/hooks/usePanelStack.ts` — stos widoków sheetu: `{ kind: 'list' } | { kind: 'ranking' } | { kind: 'car', car } | { kind: 'history', car }`, operacje `push/pop/replace/reset`, Escape i gest w dół = `pop`.
- Stan sortowań (`listSort`, `rankingOrder`) i filtrów zostaje **poza** stosem, żeby przetrwał nawigację — dziś już tak jest, tego nie regresować.
- `pinnedCar` (auto z rankingu/historii nieobecne w przefiltrowanym feedzie) zostaje, wyliczane ze szczytu stosu.
- Zachować dzisiejsze zachowania mapy: `FitSelection`, `FitCity`, `FitHistory`, `PopupSync` (`src/components/CarMap.jsx`) — tylko przeniesione do `.tsx`.

### 4. Shell: mapa + sheet
- `src/components/AppShell.tsx`: mapa jako tło (`h-dvh`), `Topbar`, `MapLayerControls`, `CarSheet`.
- `Topbar`: strefa (`Select`), segment „z rabatem / wszystkie" (`ToggleGroup`), „Filtry", wejście w statystyki, licznik aut, czas aktualizacji. Kontrolki ≥ 44 px.
- `CarSheet` (vaul Drawer, `snapPoints={[0.12, 0.5, 0.95]}`, `modal={false}` żeby mapa pozostała interaktywna). Nagłówek arkusza: tytuł warstwy + strzałka powrotu, gdy stos > 1.
- **Ryzyko:** kolizja gestów vaul ↔ Leaflet drag. Mitygacja: uchwyt przeciągania tylko w nagłówku arkusza (`data-vaul-no-drag` na treści), test na realnym dotyku.
- Desktop (`md:`): ten sam stos w stałym panelu 380 px po prawej (dzisiejszy `.list-pane`), bez vaul.

### 5. Karta auta i wiersz listy
- `CarRow.tsx`: pierwsza linia — **zwrot netto** dużą cyfrą (`--money`, ujemny na `--money-negative`), tablica, dystans+czas do mnie; druga linia — lokalizacja + `formatDrive` auto→strefa. Bez ikon-linków (Maps/historia przenoszą się do karty).
- `CarDetail.tsx` (warstwa `car`): zwrot z rozbiciem (30 zł premii − koszt wg `relocationPayout` z `src/utils/payout.js`), paliwo/zasięg, czas postoju (`formatElapsedExact`), duży CTA **„Nawiguj"** (`googleMapsUrl` z `src/utils/geo.js`) i przycisk „Historia" (push warstwy).
- Reużyć bez zmian: `src/utils/geo.js` (`haversineDistanceKm`, `formatZoneDistance`, `formatDrive`, `zoneProximity`, `zoneEntryCandidates`), `src/utils/payout.js`, `src/utils/time.js`, `src/hooks/useCars.js`, `useDrivingRoutes.js`, `useRelocationZone.js`.

### 6. Mapa: warstwy i lokalizacja
- `MapLayerControls`: heatmapa (dziś przycisk w headerze), strefa relokacji, „śledź mnie".
- `useGeolocation.js` → `.ts` + tryb follow: dziś `watchPosition` aktualizuje tylko kropkę (`position`), a mapa rusza wyłącznie na jawny `fix`. Dodać `follow: boolean` — gdy włączony, kamera jedzie za pozycją; wyłącza się przy ręcznym przesunięciu mapy (`dragstart`).
- Strzałka kierunku: `coords.heading` z `watchPosition` na obrót ikony użytkownika (fallback: kropka bez strzałki, gdy `heading == null`).
- Numerowane pinezki historii (`historyIcon` w `CarMap.jsx`) i etykieta czasu postoju dla aut bez rabatu zostają.

### 7. Arkusz filtrów
- `FiltersSheet.tsx`: „tylko opłacalne" (`payouts.get(id) > 0`), maks. dystans do mnie (chipy 1/3/5/∞ km), typ auta (`fetchCarModels` już zwraca `type`: 1 osobowe, 2 dostawcze, 6 skutery — dziś nieużywane do filtrowania).
- Filtry po stronie klienta na `cars`; stan w `localStorage` (`traficar:filters`).
- Licznik aktywnych filtrów na przycisku „Filtry" — inaczej łatwo zapomnieć, że lista jest przycięta.

### 8. Ranking i historia jako warstwy
- `LongestParkedPanel` → `RankingView.tsx`: to samo API (`/api/stats/longest-parked?limit=100&order=`), sortowanie sterowane z góry, podświetlenie wybranego wiersza, klik = push warstwy `car`.
- `CarHistory` → `HistoryView.tsx`: bez zmian merytorycznych; timeline dalej karmi mapę (`onData`), mapa ukrywa inne auta i heatmapę w tej warstwie.

### 9. Ekran statystyk
- `StatsView.jsx` → `.tsx` na shadcn `Table` + `Tabs` (zakres dni), wykres SVG zostaje własny (**wczytać skill `dataviz` przed poprawą kolorów/osi**), przełącznik „tabela / wykres" zachowany.

### 10. Server na TypeScript
Ostatni etap, żeby nie blokować UI:
- `server/**.js` → `.ts`, `tsconfig` serwera, uruchamianie przez `tsx` w dev i skompilowane `dist/` w Dockerze; `server/Dockerfile` + `.github/workflows/deploy-server.yml` zaktualizowane.
- Typy odpowiedzi importowane ze wspólnego kontraktu (etap 1), żeby frontend i backend nie rozjechały się cicho.
- Migracje SQL i `better-sqlite3` bez zmian logicznych — czysty port typów.

## Pliki krytyczne

- `src/App.jsx` → `App.tsx` (rozbicie na `AppShell` + `usePanelStack`; dziś ~420 linii i cała nawigacja)
- `src/components/CarMap.jsx` → `.tsx` (warstwy, fit-helpery, ikony)
- `src/components/CarList.jsx`, `LongestParkedPanel.jsx`, `CarHistory.jsx`, `StatsView.jsx` → widoki w stosie
- `src/index.css`, `src/App.css` → `src/styles/globals.css` (tokeny) + klasy Tailwind w komponentach
- `src/api.js`, `src/hooks/*`, `src/utils/*` → port TS, logika bez zmian
- `server/api.js` + `Dockerfile` (etap 10)

## Weryfikacja

Po każdym etapie:
1. `npm run build` i `npx oxlint src/` bez błędów (`tsc --noEmit` po etapie 1).
2. `npm run dev` + przegląd w Chrome na viewporcie telefonu (390×844) — dev proxy kieruje `/api/*` na backend produkcyjny.
3. Ścieżka łowcy: wejście → lista sortowana „najbliżej mnie" → klik auto (kamera + pin) → karta ze zwrotem → „Nawiguj" otwiera Maps → powrót gestem/Escape bez utraty sortowania.
4. Ścieżki warstw: lista → ranking (100 rekordów, przełącznik najdłużej/najkrócej) → auto → historia (numerowane postoje, inne auta ukryte) → dwa powroty wracają dokładnie tam, gdzie byłem.
5. Regresje mapy: przełączenie strefy czyści zaznaczenie/pin/historię, heatmapa się przełącza, śledzenie pozycji wyłącza się po ręcznym przesunięciu mapy.
6. Statystyki: tabela stref + wykres + zakresy 24h/7d/30d jak dziś.
7. Desktop ≥ 768 px: stos renderuje się w panelu bocznym, mapa nie skacze.
