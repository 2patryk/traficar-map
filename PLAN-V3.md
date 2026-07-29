# traficar-map v3 — plan dalszego rozwoju

Dokument uzupełnia `PLAN.md` (MVP frontendu) i `PLAN-BACKEND.md` (własny backend z historią).
Oba zrealizowane. Ten plan mówi, co dalej i **dlaczego akurat to**.

Data: 2026-07-29.

---

## 0. Ramy — decyzje użytkownika

| Pytanie | Decyzja | Konsekwencja dla planu |
|---|---|---|
| Odbiorca | **Tylko ja**, narzędzie prywatne | Zero kont, zero RODO, zero rate limitingu, zero moderacji. Ustawienia w `localStorage`. Można pisać UI „dla siebie" — gęste, bez onboardingu |
| Cel | **Zarabianie na rabatach** + **statystyki floty** | Dwa filary: kalkulator/typowanie (§3, §4) i analityka (§5). Wygoda „szukam auta do jazdy" schodzi na dalszy plan |
| Powiadomienia | **Żadne** | Cały rozdział alertów (Telegram/Web Push/e-mail) wypada. Model pozostaje **pull**: wchodzę do apki, gdy chcę. Upraszcza backend o subskrypcje, harmonogram, deduplikację alertów |
| Zakres źródeł | **Tylko Traficar** | Zero scrapingu innych operatorów. Cała energia w głębokość funkcji na jednym źródle |
| Dojazd do auta | **Rower / hulajnoga** | Promień opłacalności ~15 km/h, routing rowerowy, nie pieszy i nie samochodowy. Odblokowuje auta w promieniu kilku km, których dziś nie widać jako sensowne |
| Kwoty rabatów | Relokacja 30 zł, Sprzątanie 30 zł, Tankowanie 15 zł | Kalkulator musi liczyć **sumę wielu rabatów**, nie stałe 30 zł |
| Dziennik zarobków | **Nie** | Brak rozliczania wstecz. Wartość wyłącznie w tym, co pokazać *teraz*: które auto opłaca się wziąć |

---

## 1. Research — co daje wartość w takich aplikacjach

Przegląd aplikacji carsharingowych i towarzyszących ([Free2move](https://www.free2move.com/de/en/car-sharing/app/),
[take&drive](https://takeanddrive.eu/en/), [przegląd rynku Mobindustry](https://mobindustry.net/blog/top-8-carsharing-mobile-apps/),
[ranking aplikacji 2025](https://rentdabcar.pl/aplikacje-do-carsharingu-ranking-2025)) daje powtarzalny
zestaw funkcji. Poniżej — co z tego ma sens **tutaj**, przy powyższych ramach:

| Funkcja z rynku | Werdykt dla tego projektu |
|---|---|
| Wyszukiwanie po bliskości, sortowanie po dystansie dojścia | ✅ **Jest**, ale liczone w linii prostej / trasą samochodową. Do zmiany na trasę **rowerową** (§3) |
| Zaawansowane filtry (model, paliwo, wyposażenie) | ✅ **Warte dodania** — ale filtry pod zarabianie (min. zysk, zł/h, typ rabatu), nie pod komfort jazdy (§3.5) |
| Push „auto pojawiło się w pobliżu" / radar | ❌ **Odrzucone decyzją** — brak alertów. Zastąpione widokiem „Kandydaci" (§4), który pokazuje to samo, ale na żądanie |
| Rezerwacja, płatność, otwieranie auta | ❌ Poza zasięgiem — to zamknięte API oficjalnej apki Traficara. Zostaje deep link |
| Predykcja dostępności / inteligentne podpowiedzi | ✅ **Największa niewykorzystana wartość** — mamy własną historię, której oficjalna apka nie pokazuje (§4) |
| Ulubione / zapisane miejsca | ✅ Tanie i użyteczne: zapisane punkty startu (dom, praca) zamiast polegania na GPS (§3.6) |
| Statystyki, eksport, dashboard | ✅ Drugi filar celu (§5) |
| Czat, wsparcie, oceny, dokumentacja szkód | ❌ Bez sensu w narzędziu prywatnym |

**Wniosek z researchu**: rynkowe apki optymalizują *wygodę wynajmu*. Ta apka ma przewagę,
której żadna z nich nie ma — **własną historię floty**. Cała nieoczywista wartość siedzi
w rzeczach, które da się policzyć tylko z historii: ile czasu żyje rabat, jak długo auto
musi stać, żeby go dostać, gdzie rabaty się rodzą. To jest §4 i to jest priorytet, gdy
tylko uzbiera się dość danych.

---

## 2. Fakty zmierzone na żywym API (2026-07-29)

Sprawdzone przed pisaniem planu, bo część założeń w kodzie już się rozjechała:

- **Rabaty przychodzą bez flagi `discounts=true`.** `GET /cars?zoneId=N` zwraca pole
  `discounts` wypełnione. Flaga `discounts=true` **filtruje** listę do aut z rabatem.
  Collector woła bez flagi → dostaje rabaty dla całej floty. **Logika jest poprawna**
  (wcześniejsza notatka w `PLAN.md` sugerowała inaczej i mogła zmylić przy refaktorze).
- **Rozkład rabatów w całej Polsce** (próbka 10 stref, 958 aut):

  | Typ | Kwota | Liczba aut |
  |---|---|---|
  | Relokacja | 30 zł | 118 |
  | Tankowanie | 15 zł | 45 |
  | Sprzątanie | 30 zł | 35 |

  **19% floty ma jakiś rabat**, z czego **13 aut miało dwa naraz** (do 45–60 zł na jednym aucie).
  Dziś apka pokazuje wyłącznie Relokację — **ignoruje ~44% okazji**.
- **Kwoty są stałe per typ** w tej próbce. `payout.js` z zaszytym `BONUS = 30` jest
  poprawny dla Relokacji, ale błędny dla auta z Tankowaniem (15) i dla auta z dwoma rabatami.
- **Routing rowerowy**: `router.project-osrm.org` (używany dziś przez `useDrivingRoutes.js`)
  wystawia wyłącznie profil `driving`. Publiczna **Valhalla** (`valhalla1.openstreetmap.de/route`,
  `costing: "bicycle"`) działa i zwraca sensowne trasy — zweryfikowane zapytaniem testowym na Łodzi.
- **Zebrane dane własne**: collector wystartował dopiero co, więc `discount_spans` i `trips`
  mają dziś praktycznie zerową historię. To **nie blokuje** §3 i §5, ale twardo blokuje §4.

---

## 3. Etap A — kalkulator opłacalności v2 (rower + wszystkie rabaty)

**Cel**: odpowiedzieć na jedno pytanie — *które auto opłaca się wziąć teraz i ile na tym zarobię na godzinę*.
Największa wartość na jednostkę pracy, działa od pierwszego dnia, nie czeka na dane.

- [ ] **A1 — wszystkie typy rabatów**
      `DISCOUNT_TYPES` z `['Relokacja']` na `['Relokacja','Tankowanie','Sprzątanie']`, checkboxy w UI
      (architektura była na to przygotowana od `PLAN.md` §1). Marker na mapie pokazuje **sumę** z rozbiciem
      w popupie. Odblokowuje ~44% okazji niewidocznych dziś.

- [ ] **A2 — `payout.js` v2**
      Zamiast stałej `BONUS = 30`: suma `discounts[].amount` z auta. Stawki przejazdu zostają
      per model (Arkana droższa). Nowy wynik to obiekt, nie liczba:
      `{ gross, driveCost, net, minutes, plnPerHour }`.
      **Narzut czasowy per typ rabatu** (konfigurowalny, wartości startowe do kalibracji):
      Relokacja +0 min, Tankowanie +15 min (zjazd na stację, tankowanie), Sprzątanie +20 min.
      Bez tego 15 zł za Tankowanie wygląda w rankingu lepiej, niż jest naprawdę.

- [ ] **A3 — dojazd rowerem (`useApproachRoutes.js`)**
      Valhalla `costing: "bicycle"`, macierz przez `/sources_to_targets` (1 źródło = moja pozycja,
      N celów = auta), ograniczone do ~25 najbliższych w linii prostej. Cache w `sessionStorage`
      po zaokrąglonej parze współrzędnych.
      **Fallback** przy błędzie/limicie publicznej instancji: `haversine × 1.35 / 15 km/h` — musi być,
      bo publiczny endpoint nie daje żadnej gwarancji dostępności, a ranking nie może się przez to wysypać.

- [ ] **A4 — metryka rankingowa `zł/h`**
      `net / (czas roweru + czas przejazdu relokacyjnego + narzut typu)`.
      To jest właściwa miara, nie sam zysk: 20 zł za 15 minut bije 28 zł za 70 minut.
      Sortowanie przełączalne: `zł/h` (domyślne) / zysk netto / dystans.

- [ ] **A5 — filtry pod zarabianie**
      Max dystans rowerem (suwak, domyślnie 4 km), min. zysk netto (domyślnie > 0 zł),
      min. `zł/h`, typ rabatu, poziom paliwa. Stan filtrów w `localStorage`.
      Osobno: **ukryj auta ze stratą** — dziś kalkulator potrafi pokazać ujemny wynik i i tak trzyma auto na liście.

- [ ] **A6 — zapisane punkty startu**
      „Dom", „Praca" jako zapisane współrzędne zamiast czekania na GPS (który w budynku potrafi
      minutami zwracać śmieci). Przełącznik: moja pozycja / zapisany punkt.

- [ ] **A7 — dokąd zrelokować (deficyt floty)**
      Dziś `zoneEntryCandidates` liczy najbliższy sensowny wjazd do strefy. Ulepszenie: wybierać cel
      nie po „najbliżej granicy", tylko po **najmniejszej gęstości aut** w promieniu — tam, gdzie
      floty brakuje. Dane są na miejscu: bieżące pozycje wszystkich aut strefy + siatka jak w heatmapie.
      **Założenie do weryfikacji**: że Traficar faktycznie premiuje deficytowe obszary. Nawet jeśli nie —
      cel w rejonie bez aut i tak jest bezpieczniejszy niż punkt tuż za granicą strefy.

---

## 4. Etap B — typowanie i predykcja rabatów

**Cel**: przestać reagować na rabaty i zacząć je wyprzedzać. To jedyna część, która korzysta
z danych, jakich nie ma nikt inny.

**Twarda zależność**: sensowne wyniki wymagają **min. 14 dni** ciągłego zbierania.
Collector ruszył ~2026-07-29 → realny start prac nad B: **około 12 sierpnia 2026**.
Wcześniej można napisać zapytania, ale nie da się ocenić, czy cokolwiek z nich wynika.

- [ ] **B1 — `/api/stats/discount-lifecycle`**
      Z `discount_spans`: mediana i rozkład czasu życia rabatu, per typ i strefa.
      Odpowiada na „ile mam czasu, zanim ktoś inny weźmie to auto" — czyli czy w ogóle warto jechać
      przez pół miasta. Prosty, natychmiast użyteczny wynik.

- [ ] **B2 — `/api/stats/discount-origin`**
      Ile godzin auto stało nieruchomo, zanim dostało Relokację (join `parkings` × `discount_spans`).
      Daje empiryczny **próg kandydata** zamiast zgadywanego.

- [ ] **B3 — widok „Kandydaci"**
      Lista aut **bez rabatu**, stojących dłużej niż próg z B2, z empirycznym
      `P(rabat w ciągu 24 h)`. Model celowo prosty i wytłumaczalny: częstość historyczna
      w koszykach (czas postoju × strefa × pora dnia), bez uczenia maszynowego.
      Przy tej wielkości danych regresja i tak nie pobije częstości, a przestaje być zrozumiała.
      To jest funkcjonalny zamiennik odrzuconych alertów — ta sama informacja, ale wtedy, gdy sam po nią wejdę.

- [ ] **B4 — heatmapa *rabatów*** (nie postojów)
      Dzisiejsza heatmapa waży minutami postoju. Druga warstwa ważona liczbą rabatów pokazuje,
      **gdzie rabaty się rodzą** — czyli gdzie warto zostawiać auta i gdzie patrzeć.

- [ ] **B5 — profil dobowy i tygodniowy**
      O której i w które dni pojawia się najwięcej rabatów w mojej strefie. Wykres SVG w stylu
      istniejącego w `StatsView.jsx` — bez nowych zależności.

---

## 5. Etap C — analityka floty i eksport

**Cel**: drugi filar — wiedza o flocie sama w sobie. Nie zależy od etapu B, można robić równolegle.

- [ ] **C1 — wyszukiwarka po rejestracji + karta auta**
      `/api/cars/search?plate=`, wejście w pełną historię konkretnego auta (`CarHistory.jsx` już istnieje).
      Indeks `cars_plate` jest w schemacie od początku, nieużywany.

- [ ] **C2 — eksport CSV / JSON**
      `parkings`, `trips`, `discount_spans` z filtrem zakresu dat i strefy. Bez tego każda analiza
      ad hoc oznacza SSH na Mikrusa i ręczne `sqlite3`.

- [ ] **C3 — dashboard floty v2**
      Rozszerzenie `StatsView.jsx`: rotacja (przejazdy/auto/dobę), mediana czasu postoju,
      % floty nieruszanej 7 dni, udział aut z rabatem w czasie, porównanie stref obok siebie.

- [ ] **C4 — ranking martwych aut**
      `LongestParkedPanel` pokazuje najdłużej stojące. Dodać auta z `end_reason = 'gone'`
      (zniknęły z floty) i wykrywanie powrotów — to sygnał serwisu/wycofania, i jednocześnie
      najlepsi kandydaci na wysoki rabat po powrocie.

- [ ] **C5 — agregaty dzienne `car_stats_daily`**
      **Zależność czasowa**: `nightly.js` kasuje surowe rekordy starsze niż 180 dni.
      Agregaty muszą powstać, **zanim** pierwsze dane zaczną wypadać (styczeń 2027), inaczej
      analiza rok-do-roku będzie niemożliwa. Nie pilne, ale nieodwracalne, jeśli się przegapi.

---

## 6. Etap D — fundament (dług techniczny)

Bez tego reszta stoi na piasku. **D1 ma najwyższy priorytet w całym dokumencie** — jest jedyną
pozycją, której koszt zaniechania jest nieodwracalny.

- [ ] **D1 — odblokować GitHub Actions** ⚠️
      Konto ma problem z płatnościami, więc nie działa **ani deploy, ani offsite backup**
      (`.github/workflows/backup.yml`). Oznacza to, że **jedyna kopia całej historii leży na Mikrusie**.
      Jedna awaria dysku = utrata wszystkiego, na czym opiera się §4 i §5.
      Do rozwiązania w Billing & plans. Jeśli konto zostaje zablokowane — awaryjnie lokalny cron
      `rsync` z Mikrusa na maszynę domową; byle nie zostawiać jednej kopii.

- [ ] **D2 — HTTPS na odcinku Vercel ↔ Mikrus**
      Dziś plain HTTP (świadoma decyzja z `PLAN-BACKEND.md` §6 — Cytrus jest płatny).
      Tańsza opcja do sprawdzenia: **Cloudflare Tunnel** (`cloudflared` obok w compose) — darmowy,
      nie wymaga otwartego portu ani publicznego IP, wymaga własnej domeny w Cloudflare
      (~15 zł/rok za `.pl`/`.xyz`). Nie jest pilne (dane publiczne, zero sekretów), ale to
      najtańsze domknięcie znanej luki.

- [ ] **D3 — testy logiki collectora**
      Najbardziej krytyczna i najbardziej podchwytliwa część systemu jest dziś bez testów:
      próg 30 m, `rented` vs `gone`, zamykanie postoju po luce w zbieraniu (`uncertain`),
      idempotencja przy dwóch przebiegach w tej samej minucie. Testy na sztucznych sekwencjach
      cykli, `node:test` + baza SQLite w pamięci — zero nowych zależności.
      Regresja w tym miejscu **cicho psuje historię**, a wykryjesz ją dopiero po tygodniach.

- [ ] **D4 — kalibracja `MOVE_THRESHOLD_M`**
      Po 2 tygodniach danych: rozkład dystansów między kolejnymi obserwacjami tego samego auta.
      Jeśli 30 m odcina za mało (dryf GPS tworzy fikcyjne przeparkowania) albo za dużo —
      poprawić na podstawie liczb, nie przeczucia. Wynik wpisać do `PLAN-BACKEND.md`.

- [ ] **D5 — indeksy pod zapytania z §4 i §5**
      `discount_spans(type, started_at)` i `parkings(started_at)` nie mają dziś indeksów.
      Przy 250 MB/rok i 1 GB RAM na Mikrusie skan całej tabeli na każde wejście w statystyki
      jest odczuwalny. Dodać razem z pierwszym zapytaniem, które ich potrzebuje.

---

## 7. Kolejność

```
TERAZ          D1 (backup!) ────────────────────────────────────────────
               A1 → A2 → A3 → A4 → A5      natychmiastowa wartość, zero zależności od danych
               A6, A7                      szlif kalkulatora
               C1, C2                      tanie, przydatne od razu

~12 SIERPNIA   D4 (kalibracja progu)       wymaga 2 tyg. danych
               B1 → B2 → B3                serce predykcji
               B4, B5, D5

PÓŹNIEJ        C3, C4                      analityka pełną parą
               D2, D3                      domknięcie długu
               C5                          przed styczniem 2027 (retencja 180 dni)
```

Uzasadnienie kolejności: **A daje pieniądze od jutra i nie czeka na nic.** B daje najwięcej,
ale fizycznie nie może ruszyć wcześniej. D1 jest przed wszystkim, bo to jedyna pozycja,
której nie da się nadrobić po fakcie.

---

## 8. Świadomie poza zakresem

| Rzecz | Dlaczego nie |
|---|---|
| Alerty (Telegram / Web Push / e-mail) | Decyzja użytkownika. Model pull. §4 (B3) pokrywa tę potrzebę na żądanie |
| Inni operatorzy (Panek, 4Mobility) | Brak publicznego API jak `fioletowe.live` — własny scraper per operator + unifikacja modelu + stałe utrzymanie. Koszt nieproporcjonalny do zysku przy jednym użytkowniku |
| Konta, multi-user, RODO, rate limiting | Narzędzie prywatne |
| Dziennik wykonanych relokacji | Decyzja użytkownika — liczy się planowanie do przodu, nie rozliczenia wstecz |
| Rezerwacja / otwieranie auta z apki | Zamknięte API oficjalnej aplikacji |
| Planer łańcucha relokacji (auto po aucie) | Nie wybrany jako sposób poruszania się. Do rozważenia dopiero, gdyby dojazd rowerem okazał się wąskim gardłem — wtedy A3/A4 dają już gotowy fundament (macierz czasów) |
| TypeScript, przepisanie na Next.js | Apka ma ~1600 linii frontendu i jednego autora. Migracja to czysty koszt bez zysku |

---

## 9. Ryzyka nowego etapu

| Ryzyko | Mitygacja |
|---|---|
| Publiczna Valhalla wprowadza limit / pada | Fallback haversine (A3) jest wymagany, nie opcjonalny. Przy stałych problemach: GraphHopper free tier albo własna Valhalla — ale nie na 1 GB RAM Mikrusa |
| Predykcja z §4 okaże się bezwartościowa (rabaty nadawane losowo/ręcznie) | B1 i B2 to same zapytania — koszt niski, wynik rozstrzyga, czy budować B3. **Nie zaczynać od B3** |
| Narzuty czasowe w A2 zgadnięte źle | Wartości konfigurowalne w UI, kalibracja po kilku własnych relokacjach |
| Kwoty rabatów zmienią się po stronie Traficara | A2 czyta `amount` z API zamiast stałych — zmiana wchodzi sama. Stałe zostają tylko w stawkach przejazdu (cennik) |
| Rozjazd między `PLAN-BACKEND.md` a rzeczywistością (jak notatka o `discounts=true`) | Fakty mierzone przed decyzją, wynik zapisany w §2 tego dokumentu |
