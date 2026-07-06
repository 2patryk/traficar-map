# traficar-map — plan realizacji

Mapa aut Traficar z rabatem **Relokacja**: ikonki z sumą rabatów na mapie + lista aut
posortowana od najbliższych, z klikiem otwierającym Google Maps z pinezką.

---

## 1. Wyniki researchu

### API — https://fioletowe.live (Traficar Map API v1.5, FastAPI + Swagger)

Darmowe, publiczne, bez klucza API (open-source: `divadsn/traficar-map`).

**Kluczowy endpoint:**

```
GET https://fioletowe.live/api/v1/cars?zoneId={id}&discounts=true&discountType=Relokacja
```

Ustalenia z testów na żywo (2026-07-06):

| Fakt | Konsekwencja |
|---|---|
| `zoneId` jest **wymagany** — bez niego `401 Unauthorized` | Aplikacja musi mieć wybór miasta (dropdown ze stref) |
| Sam `discountType` **nie filtruje** — trzeba dodać `discounts=true` | Zawsze wysyłamy oba parametry |
| Auto może mieć kilka rabatów naraz (np. Relokacja 30 + Sprzątanie 30) | Na ikonce pokazujemy **sumę** `discounts[].amount` |
| `lat`/`lng` przychodzą jako **stringi** | `parseFloat()` przy parsowaniu |
| **Brak nagłówków CORS** | Dev: proxy Vite (już skonfigurowane w `vite.config.js`). Prod: rewrite na hostingu (patrz §5) |
| `cache-control: max-age=30` po stronie API | Odświeżanie co ~60 s wystarczy, częściej nie ma sensu |

**Pozostałe endpointy:**
- `GET /api/v1/zones` — lista miast (id, name, lat, lng centrum) → zasila dropdown
- `GET /api/v1/car-models` — modele aut (nazwa modelu do listy/popupu)
- `GET /api/v1/cars/nearby?lat=&lng=&radius=` — nieprzydatny (radius max 1000 m, brak filtra rabatów)

**Model `CarV1`:** `id, lat, lng, location, zoneId, modelId, regPlate, sideNumber,
fuel, range, discounts: [{name, amount}] | null, available, lastUpdate`

**Enum `discountType`:** `Tankowanie | Sprzątanie | Relokacja` — architektura filtrowania
ma przyjmować tablicę typów, żeby w przyszłości dodać resztę jednym checkboxem.

### Mapa — wybór biblioteki

| Opcja | Koszt | Klucz API | Werdykt |
|---|---|---|---|
| **Leaflet + OpenStreetMap (react-leaflet)** | darmowe | nie | ✅ **wybrane** — zero konfiguracji, `DivIcon` idealny na ikonki z kwotą |
| MapLibre GL + OpenFreeMap | darmowe | nie | ładniejsze kafelki wektorowe, ale większa biblioteka — przerost formy |
| Google Maps JS API | $200 kredytu/mies., potem płatne | tak + karta kredytowa | ❌ niepotrzebne — Google Maps użyjemy tylko jako **link** (deep link jest darmowy) |

**Deep link do Google Maps z pinezką** (bez klucza, otwiera aplikację na telefonie):
`https://www.google.com/maps/search/?api=1&query={lat},{lng}`

---

## 2. Architektura (minimalna)

```
src/
  api.js            — fetchZones(), fetchCars(zoneId, discountTypes)
  hooks/useCars.js  — pobieranie + auto-refresh co 60 s
  utils/geo.js      — haversine (dystans user → auto), link do Google Maps
  components/
    CarMap.jsx      — react-leaflet: MapContainer + markery DivIcon z sumą zł
    CarList.jsx     — lista sortowana po dystansie, klik = otwórz Google Maps
    ZonePicker.jsx  — dropdown miast z /api/v1/zones
  App.jsx           — stan: strefa, auta, pozycja usera; layout mapa + lista
```

Bez Reduxa, bez routera, bez TypeScriptu — jeden ekran, `useState`/`useEffect` wystarczą.

---

## 3. Kroki implementacji

- [x] **Krok 0 — scaffold**: Vite + React, `npm i react-leaflet leaflet`, proxy `/api` w `vite.config.js`
- [ ] **Krok 1 — warstwa API** (`api.js`): `fetchZones()`, `fetchCars(zoneId, ['Relokacja'])`;
      parsowanie lat/lng na liczby, wyliczenie `discountSum` per auto
- [ ] **Krok 2 — mapa** (`CarMap.jsx`): kafelki OSM, markery `L.divIcon` z kwotą
      (np. fioletowy badge „60 zł"), popup z detalami (model, adres, paliwo/zasięg),
      import `leaflet/dist/leaflet.css`
- [ ] **Krok 3 — geolokalizacja + lista** (`CarList.jsx`): `navigator.geolocation.getCurrentPosition`,
      haversine, sortowanie rosnąco po dystansie; fallback gdy brak zgody — sortowanie
      od centrum strefy; klik pozycji → `window.open(googleMapsUrl)`
- [ ] **Krok 4 — wybór miasta + odświeżanie**: `ZonePicker` (zapamiętanie w `localStorage`),
      `setInterval` 60 s w `useCars`, przycisk ręcznego odświeżenia
- [ ] **Krok 5 — szlif**: layout mobilny (mapa u góry, lista pod spodem / przełącznik),
      stany loading/error/pusto („brak aut z relokacją w tej strefie")

## 4. Przyszłe rozszerzenia (poza MVP)

- Checkboxy Tankowanie / Sprzątanie (API przyjmuje `discountType` jako tablicę — gotowe)
- Filtr `discountAmount` (min. kwota, API wspiera 5–60 co 5)
- Marker pozycji użytkownika na mapie

## 5. Deploy (kwestia CORS na produkcji)

Proxy Vite działa tylko w dev. Na produkcji rewrite `/api/*` → `https://fioletowe.live/api/*`:
- **Vercel**: `vercel.json` → `rewrites`
- **Netlify**: `_redirects` → `/api/* https://fioletowe.live/api/:splat 200`
- **Cloudflare Pages**: prosty Worker/Function proxy
