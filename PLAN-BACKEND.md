# traficar-map v2 — własny backend z historią aut

Cel: przestać wierzyć polu `lastUpdate` z API i mieć **własne, wiarygodne dane**:
jak długo auto faktycznie stoi w jednym miejscu, kiedy i dokąd się przemieszczało,
kiedy pojawił się na nim rabat.

Dokument uzupełnia `PLAN.md` (MVP frontendu, zrealizowany). Nie zastępuje go.

---

## 1. Dlaczego w ogóle backend

Dziś aplikacja czyta `car.lastUpdate` z `fioletowe.live` i pokazuje „stoi od X".
To jest niepoprawne:

| Problem | Skutek |
|---|---|
| `lastUpdate` zmienia się przy **każdej** zmianie rekordu (paliwo, zasięg, rabat, `available`), nie tylko przy zmianie pozycji | Auto stojące 3 dni potrafi pokazać „12m", bo doszedł mu rabat |
| Auto wynajęte **znika** z odpowiedzi `/cars` (API zwraca tylko dostępne) | Bez własnego zapisu nie wiadomo, że auto pojechało — po powrocie wygląda jak „stało cały czas" |
| Brak jakiejkolwiek historii | Nie da się zrobić trasy auta, statystyk, „najdłużej stojące w tym miesiącu" |

Rozwiązanie: własny poller zapisujący stan floty do bazy + własne API dla frontendu.

### Zmierzone fakty (2026-07-29)

- 10 stref: Kraków, Warszawa, Wrocław, Poznań, Trójmiasto, Śląsk, Lublin, Łódź, Szczecin, Rzeszów
- ~1014 dostępnych aut łącznie (Warszawa 288, Trójmiasto 250, Kraków 129, … Lublin 0)
- `GET /api/v1/cars?zoneId=N` bez filtrów zwraca całą dostępną flotę strefy
- Odpowiedź ma własne pole `lastUpdate` (moment scrapu po stronie fioletowe.live) — warto zapisywać
- `cache-control: max-age=30` — sens ma odpytywanie nie częściej niż co ~1 min
- `lat`/`lng` to **stringi** z 7 miejscami po przecinku
- Brak klucza API, brak rate limitu w dokumentacji — 10 requestów na cykl to nic

---

## 2. Architektura: Mikrus 2.1 + Docker

Frontend zostaje na Vercelu (statyczny SPA), backend jedzie na własnym VPS-ie.

```
┌──────────────── Mikrus 2.1 (1 GB RAM, 10 GB dysk, Finlandia, 75 zł/rok) ────────────┐
│                                                                                      │
│   docker compose:                                                                    │
│   ┌────────────────────────┐        ┌──────────────────────────┐                     │
│   │ collector (Node 24)    │        │ api (Node 24, Fastify)   │                     │
│   │ setInterval 2 min      │───┐    │ port 3000 → port Mikrusa │◄── frontend         │
│   │ 10 stref sekwencyjnie  │   │    └────────────┬─────────────┘                     │
│   └───────────┬────────────┘   │                 │                                   │
│               │                └── ./data/traficar.db (SQLite, wolumen) ──┘          │
│               ▼                                                                       │
└───────────────┼───────────────────────────────────────────────────────────────────────┘
                ▼
        fioletowe.live/api/v1
```

### Dlaczego tak

| Decyzja | Wybór | Uzasadnienie |
|---|---|---|
| Hosting backendu | **Mikrus 2.1** | Vercel Cron na Hobby odpala się **max raz na dobę** — bezużyteczne przy pollingu co 2 min. Własny proces z `setInterval` nie ma tego ograniczenia. 75 zł/rok < 5 USD/mies. za Railway |
| Baza | **SQLite** (`better-sqlite3`), WAL | Przy 1 GB RAM Postgres w Dockerze zjada 200–300 MB na nic. Tu jest **jeden pisarz** (collector) i garść czytelników — dokładnie profil, w którym SQLite bije Postgresa. Backup = skopiowanie pliku. Migracja na Postgresa później to zmiana warstwy zapytań, schemat zostaje |
| Runtime | Node 24 LTS, `better-sqlite3` (synchroniczne, bez puli połączeń) | Collector to skrypt, nie serwer — synchroniczne API upraszcza transakcje |
| API | Fastify | Lekki, ~50 MB RSS. Express też przejdzie |
| Kontenery | 2 serwisy w jednym `docker-compose.yml`, wspólny wolumen `./data` | Rozdzielenie zbierania od serwowania: restart API nie gubi cyklu, crash collectora nie kładzie strony |
| Ekspozycja | Subdomena Mikrusa (`*.mikr.us`, HTTPS z Cytrusa) lub własna domena | Frontend na Vercelu woła `https://traficar.mikr.us/api/*` |
| CORS vs rewrite | **Rewrite w `vercel.json`**: `/api/*` → `https://<host-mikrusa>/api/*` | Frontend nadal woła względne `/api`, zero konfiguracji CORS, zero preflightów |

### Budżet zasobów (1 GB RAM / 10 GB dysk)

| Element | RAM | Dysk |
|---|---|---|
| collector | ~90 MB | — |
| api (Fastify) | ~70 MB | — |
| SQLite + WAL | w procesach, page cache systemu | ~250 MB / rok danych |
| system + Docker | ~250 MB | ~2 GB |
| **Zapas** | **~500 MB** | **~7 GB** |

Mieści się z dużym marginesem. Gdyby zabrakło — najpierw retencja (§3), potem Mikrus 3.0.

---

## 3. Model danych

Zasada: **nie zapisujemy snapshotu przy każdym pollu** (1000 aut × 720 cykli =
720 tys. wierszy dziennie). Zapisujemy **zmiany stanu** — auto stojące bez ruchu nie
generuje żadnego wiersza, tylko przesunięcie `last_seen_at`.

```sql
PRAGMA journal_mode = WAL;      -- czytelnicy nie blokują pisarza
PRAGMA synchronous = NORMAL;    -- rozsądny kompromis na VPS-ie

-- referencyjne, odświeżane raz na dobę
CREATE TABLE zones      (id INTEGER PRIMARY KEY, name TEXT, lat REAL, lng REAL);
CREATE TABLE car_models (id INTEGER PRIMARY KEY, name TEXT, type INTEGER);

-- rejestr aut
CREATE TABLE cars (
  id            INTEGER PRIMARY KEY,   -- id z API
  reg_plate     TEXT,
  side_number   INTEGER,
  model_id      INTEGER REFERENCES car_models(id),
  zone_id       INTEGER REFERENCES zones(id),
  first_seen_at TEXT,                  -- ISO 8601 UTC
  last_seen_at  TEXT                   -- ostatni cykl, w którym auto było w odpowiedzi
);
CREATE INDEX cars_plate ON cars(reg_plate);

-- SERCE SYSTEMU: postoje. Jeden wiersz = jeden ciągły postój w jednym miejscu.
CREATE TABLE parkings (
  id         INTEGER PRIMARY KEY,
  car_id     INTEGER REFERENCES cars(id),
  lat        REAL, lng REAL,
  location   TEXT,                     -- adres z API
  started_at TEXT,                     -- pierwszy cykl z tą pozycją
  ended_at   TEXT,                     -- NULL = auto nadal tu stoi
  end_reason TEXT,                     -- 'moved' | 'rented' | 'gone'
  uncertain  INTEGER DEFAULT 0,        -- 1 = zamknięty po luce w zbieraniu
  fuel_start REAL, fuel_end REAL
);
CREATE UNIQUE INDEX parkings_open ON parkings(car_id) WHERE ended_at IS NULL;
CREATE INDEX parkings_car_time ON parkings(car_id, started_at DESC);

-- przejazdy: luka między dwoma postojami
CREATE TABLE trips (
  id           INTEGER PRIMARY KEY,
  car_id       INTEGER,
  from_parking INTEGER REFERENCES parkings(id),
  to_parking   INTEGER REFERENCES parkings(id),
  departed_at  TEXT, arrived_at TEXT,
  straight_km  REAL,                   -- haversine; trasy drogowej nie znamy
  fuel_delta   REAL,
  uncertain    INTEGER DEFAULT 0
);

-- historia rabatów: kiedy auto dostało/straciło Relokację
CREATE TABLE discount_spans (
  id         INTEGER PRIMARY KEY,
  car_id     INTEGER,
  parking_id INTEGER REFERENCES parkings(id),
  type       TEXT,                     -- 'Relokacja' | 'Tankowanie' | 'Sprzątanie'
  amount     INTEGER,
  started_at TEXT, ended_at TEXT
);

-- audyt: bez tego nie wiadomo, czy luka to przejazd czy padnięty collector
CREATE TABLE poll_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT, finished_at TEXT,
  zone_id INTEGER, cars_seen INTEGER,
  api_last_update TEXT,                -- pole lastUpdate z odpowiedzi API
  error TEXT
);
```

### Logika jednego cyklu (per strefa)

```
1. GET /api/v1/cars?zoneId=Z                → lista aut dostępnych
2. Wczytaj otwarte postoje dla strefy       → mapa car_id -> parking
3. Dla każdego auta z API:
   a) brak otwartego postoju        → INSERT parkings (nowe auto lub powrót z najmu)
                                       + jeśli był poprzedni postój → INSERT trips
   b) otwarty postój, dystans < 30 m → nic (tylko cars.last_seen_at = now)
   c) otwarty postój, dystans ≥ 30 m → UPDATE ended_at = czas poprzedniego cyklu,
                                       end_reason='moved' + nowy parking + trip
   d) diff rabatów                   → otwórz/zamknij discount_spans
4. Auta obecne w otwartych postojach, a NIEOBECNE w odpowiedzi:
   → ended_at = czas poprzedniego cyklu, end_reason = 'rented'
5. INSERT poll_runs
```

Cały krok 3–4 dla strefy w **jednej transakcji** (`db.transaction(...)`) — w SQLite to
jeden `fsync`, cały cykl 10 stref schodzi w ~2 s.

**Próg 30 m** — GPS w autach dryfuje o kilkanaście metrów na postoju. 30 m odcina szum,
a nie gubi realnego przeparkowania. Stała `MOVE_THRESHOLD_M` do kalibracji po tygodniu danych.

**`rented` vs `gone`**: auto nieobecne > 48 h → nocny job zmienia `end_reason` na `gone`
(wycofane z floty / serwis).

**Luka w zbieraniu**: jeśli poprzedni udany `poll_runs` był > 10 min temu, `ended_at`
ustawiamy na **jego** czas, nie na teraz, i oznaczamy `uncertain = 1`.

**Objętość**: auto zmienia miejsce ~4 ×/dobę → ~4 tys. `parkings` + ~4 tys. `trips`
dziennie, ~250 MB/rok. Retencja: rekordy starsze niż 180 dni kasuje nocny job
(opcjonalnie po agregacji do `car_stats_daily`), potem `VACUUM`.

---

## 4. API dla frontendu

| Endpoint | Zwraca |
|---|---|
| `GET /api/cars?zoneId=&discountType=` | To co dziś, ale z `parkedSince` (z `parkings.started_at`) zamiast `lastUpdate` |
| `GET /api/cars/:id/history?days=30` | Oś czasu: `[{type:'parking', lat, lng, location, from, to, durationMin}, {type:'trip', km, from, to}]` |
| `GET /api/cars/:id` | Bieżący stan + aktualny postój + suma km z 30 dni |
| `GET /api/stats/longest-parked?zoneId=` | Top N po `now - started_at` |
| `GET /api/health` | Ostatni udany `poll_runs` per strefa — widać, czy zbieranie żyje. **Musi zwracać HTTP 500**, gdy najnowszy wpis jest starszy niż 15 min; `200 {"stale": true}` nie zostanie wykryte przez zewnętrzny uptime check (§7) |

Endpointy czytają **wyłącznie z SQLite**, nie proxują do fioletowe.live — frontend
przestaje zależeć od dostępności tamtego API na ścieżce krytycznej.

Nagłówek `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` — CDN Vercela
zdejmie ruch z Mikrusa (1 GB RAM nie lubi ruchu).

---

## 5. Zmiany we frontendzie

- `vercel.json` — rewrite `/api/*` na Mikrusa zamiast na `fioletowe.live`
- `src/api.js` — kształt odpowiedzi zostaje zgodny (`discountSum`, liczbowe `lat`/`lng`),
  więc komponenty się nie zmieniają; dochodzi `parkedSince`
- `src/utils/time.js` — `formatElapsed(car.parkedSince)` zamiast `car.lastUpdate`
- Sortowanie „najdłużej stojące" (już istnieje) zaczyna działać poprawnie i można je
  włączyć **także** w widoku z rabatami
- **Nowy** `src/components/CarHistory.jsx` — panel po kliknięciu auta: oś czasu postojów
  i przejazdów, polilinia na mapie (Leaflet `Polyline` + numerowane markery), suma km
- **Nowy** `src/components/HealthBadge.jsx` — „dane sprzed 2 min", ostrzeżenie gdy
  collector milczy > 15 min

---

## 6. Kroki wdrożenia

- [x] **Krok 0 — Mikrus**: eve137 (srv71), Ubuntu 24.04, docker + compose przez `get.docker.com`,
      porty przydzielone: `20137`, `30137` (1:1 NAT), SSH na `10137` zabezpieczone kluczem
- [x] **Krok 1 — repo `server/`**: `server/Dockerfile`, `docker-compose.yml`,
      `server/db/migrate.js` + `migrations/001_init.sql` (schemat z §3), wolumen `./data`
- [x] **Krok 2 — collector**: `server/collector.js` — `setInterval` 2 min, 10 stref
      sekwencyjnie, logika z §3, transakcja per strefa, `poll_runs`.
      Idempotencja: dwa uruchomienia w tej samej minucie nie mogą zdublować postoju
- [x] **Krok 3 — API**: `server/api.js` (Fastify), `/api/cars` i `/api/health`
- [x] **Krok 4 — deploy + przełączenie frontendu**: `docker compose up -d` na porcie `20137`,
      rewrite w `vercel.json` (`/api/cars`, `/api/health` → Mikrus; `/api/v1/*` zostaje na
      fioletowe.live), `formatElapsed(parkedSince)`. **Wada `lastUpdate` zniknęła w produkcji**
      (`traficar-map.vercel.app`).
      **HTTPS Mikrus↔Vercel odłożone**: Cytrus (jedyna gotowa opcja) jest płatny, decyzja
      użytkownika — zostajemy na plain HTTP na tym odcinku. Dane publiczne (pozycje aut),
      zero sekretów w requeście, przeglądarka i tak łączy się z Vercelem po HTTPS. Do
      rewizji, jeśli pojawi się tania/darmowa domena pod Cloudflare (Caddy + DNS-01)
- [ ] **Krok 5 — historia**: `/api/cars/:id/history` + `CarHistory.jsx`
- [ ] **Krok 6 — statystyki**: `/api/stats/longest-parked`, ranking, opcjonalnie heatmapa
      miejsc długiego postoju (agregat `parkings` po siatce ~200 m)
- [ ] **Krok 7 — utrzymanie**: nocny job (retencja 180 dni, `gone`, `VACUUM`),
      backup `sqlite3 .backup` + `rsync`/`rclone` poza Mikrusa, monitoring przez Cronitor (§7)

**Kolejność ma znaczenie**: kroki 1–4 dają natychmiastową wartość bez nowego UI.
Historia (5–6) i tak wymaga kilku dni zebranych danych.

---

## 7. Monitoring — Cronitor

Collector to proces, którego awarię widać dopiero po fakcie: dane po prostu przestają
przychodzić, a aplikacja dalej pokazuje ostatni znany stan. Potrzebny **dead man's switch**
— alert, gdy ping *nie przyszedł*. Cronitor robi dokładnie to.

Plan **Hacker (darmowy): 5 monitorów**, alerty na e-mail i Slack. Budżet:

| Monitor | Typ | Wykrywa |
|---|---|---|
| `traficar-collector` | job (telemetry ping) | cykl nie wystartował, wywalił się albo zawisł |
| `traficar-api` | uptime check na `/api/health` | kontener API leży lub dane są przeterminowane |
| `traficar-nightly` | job | backup / retencja nie przeszły |

Zostają 2 monitory w zapasie. Klucz w `CRONITOR_API_KEY` (env kontenera, nigdy w repo).

### Ping z collectora

```js
// server/cronitor.js
const KEY = process.env.CRONITOR_API_KEY

// Nigdy nie może wywalić ani zablokować cyklu — monitoring to nie ścieżka krytyczna.
export async function ping(monitor, params = {}) {
  if (!KEY) return
  const qs = new URLSearchParams({ env: 'production', host: 'mikrus', ...params })
  try {
    await fetch(`https://cronitor.link/p/${KEY}/${monitor}?${qs}`, {
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // celowo puste
  }
}
```

```js
// server/collector.js
const series = Date.now().toString(36)   // wiąże run z complete/fail
const t0 = Date.now()
await ping('traficar-collector', { state: 'run', series })

try {
  const { carsSeen, zonesFailed } = await runCycle()
  await ping('traficar-collector', {
    state: zonesFailed.length === 10 ? 'fail' : 'complete',
    series,
    metric: [`count:${carsSeen}`, `duration:${(Date.now() - t0) / 1000}`,
             `error_count:${zonesFailed.length}`].join(','),
    message: zonesFailed.length ? `strefy bez danych: ${zonesFailed.join(',')}` : '',
  })
} catch (err) {
  await ping('traficar-collector', { state: 'fail', series, message: err.message })
}
```

Monitor tworzy się automatycznie przy pierwszym pingu (`cronitor.link/p/:apiKey/:monitorKey`).
W panelu dostawiamy reguły: „brak pingu od 10 min" oraz „duration > 60 s".

### Decyzje

- **`state=run` + `state=complete`**, nie sam heartbeat po zakończeniu — dzięki temu
  Cronitor mierzy czas trwania i wykryje cykl, który wystartował i zawisł na `fetch`
- **Partial failure ≠ `fail`**: 1 strefa z 10 padła → `complete` z `error_count`.
  Alert `fail` przy każdym czknięciu pojedynczego requestu to prosta droga do
  ignorowania alertów. Reguła „error_count > 3" jako osobny, łagodniejszy próg
- **720 pingów/dobę** na monitor — normalne obciążenie job monitora, mieści się w free tierze
- `/api/health` zwraca **500** przy przeterminowanych danych (§4) — inaczej uptime check
  zawsze widzi „zielono", nawet gdy collector nie żyje od godziny
- Alternatywa: **healthchecks.io** (20 checków, open source, do postawienia w tym samym
  `docker-compose`). Odrzucona jako główny mechanizm — monitoring padłby razem z Mikrusem,
  a dead man's switch musi żyć poza monitorowaną maszyną

---

## 8. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Mikrus pada / restart hosta | `restart: unless-stopped` w compose; dane w wolumenie; przerwa = luka oznaczona `uncertain`; alert z Cronitora (§7) w ciągu 10 min |
| Collector zawisa bez crashu (np. `fetch` bez timeoutu) | Kontener stoi, `restart` nie zadziała. Wykrywa to `state=run` bez `complete` w Cronitorze + `AbortSignal.timeout` na każdym requeście do fioletowe.live |
| Utrata pliku SQLite | Nocny `sqlite3 traficar.db ".backup"` + wysyłka poza VPS, pilnowana monitorem `traficar-nightly`. **Bez tego jedna awaria dysku kasuje całą historię** |
| 1 GB RAM + ruch na `/api` | Cache CDN Vercela (`s-maxage=60`), limit rozmiaru odpowiedzi, `?days` ograniczone do 90 |
| `fioletowe.live` pada / zmienia API | `poll_runs.error` + `HealthBadge`; historia zostaje, aplikacja pokazuje ostatni znany stan z etykietą wieku |
| Wynajem krótszy niż cykl 2 min | Niewykrywalny — auto zniknie i wróci między pollami. Akceptujemy |
| Zmiana `id` auta po stronie Traficara | `reg_plate` jako drugi klucz; nowe `id` przy znanej rejestracji → ostrzeżenie w logu |
| SQLite okaże się za ciasny (wiele instancji API, analityka ad hoc) | Schemat jest przenośny — migracja na Postgresa (kontener obok albo Neon) bez zmiany logiki |

---

## 8. Co to odblokowuje później

- Powiadomienia: „auto z Relokacją 60 zł stoi 200 m od ciebie od 3 dni"
- Predykcja: gdzie i o której najczęściej pojawiają się rabaty (`discount_spans`)
- Ranking „martwych" aut — stoją tygodniami, prawie na pewno dostaną wysoki rabat
- Wyszukiwarka po rejestracji (API ma `/cars/search`) + pełna historia auta
- Eksport CSV / publiczny dashboard statystyk floty
