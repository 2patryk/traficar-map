-- referencyjne, odświeżane raz na dobę
CREATE TABLE IF NOT EXISTS zones (
  id   INTEGER PRIMARY KEY,
  name TEXT,
  lat  REAL,
  lng  REAL
);

CREATE TABLE IF NOT EXISTS car_models (
  id   INTEGER PRIMARY KEY,
  name TEXT,
  type INTEGER
);

-- rejestr aut
CREATE TABLE IF NOT EXISTS cars (
  id            INTEGER PRIMARY KEY,   -- id z API
  reg_plate     TEXT,
  side_number   INTEGER,
  model_id      INTEGER REFERENCES car_models(id),
  zone_id       INTEGER REFERENCES zones(id),
  first_seen_at TEXT,                  -- ISO 8601 UTC
  last_seen_at  TEXT                   -- ostatni cykl, w którym auto było w odpowiedzi
);
CREATE INDEX IF NOT EXISTS cars_plate ON cars(reg_plate);

-- SERCE SYSTEMU: postoje. Jeden wiersz = jeden ciągły postój w jednym miejscu.
CREATE TABLE IF NOT EXISTS parkings (
  id         INTEGER PRIMARY KEY,
  car_id     INTEGER REFERENCES cars(id),
  lat        REAL,
  lng        REAL,
  location   TEXT,                     -- adres z API
  started_at TEXT,                     -- pierwszy cykl z tą pozycją
  ended_at   TEXT,                     -- NULL = auto nadal tu stoi
  end_reason TEXT,                     -- 'moved' | 'rented' | 'gone'
  uncertain  INTEGER DEFAULT 0,        -- 1 = zamknięty po luce w zbieraniu
  fuel_start REAL,
  fuel_end   REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS parkings_open ON parkings(car_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS parkings_car_time ON parkings(car_id, started_at DESC);

-- przejazdy: luka między dwoma postojami
CREATE TABLE IF NOT EXISTS trips (
  id           INTEGER PRIMARY KEY,
  car_id       INTEGER,
  from_parking INTEGER REFERENCES parkings(id),
  to_parking   INTEGER REFERENCES parkings(id),
  departed_at  TEXT,
  arrived_at   TEXT,
  straight_km  REAL,                   -- haversine; trasy drogowej nie znamy
  fuel_delta   REAL,
  uncertain    INTEGER DEFAULT 0
);

-- historia rabatów: kiedy auto dostało/straciło Relokację
CREATE TABLE IF NOT EXISTS discount_spans (
  id         INTEGER PRIMARY KEY,
  car_id     INTEGER,
  parking_id INTEGER REFERENCES parkings(id),
  type       TEXT,                     -- 'Relokacja' | 'Tankowanie' | 'Sprzątanie'
  amount     INTEGER,
  started_at TEXT,
  ended_at   TEXT
);

-- audyt: bez tego nie wiadomo, czy luka to przejazd czy padnięty collector
CREATE TABLE IF NOT EXISTS poll_runs (
  id              INTEGER PRIMARY KEY,
  started_at      TEXT,
  finished_at     TEXT,
  zone_id         INTEGER,
  cars_seen       INTEGER,
  api_last_update TEXT,                -- pole lastUpdate z odpowiedzi API
  error           TEXT
);
CREATE INDEX IF NOT EXISTS poll_runs_zone_time ON poll_runs(zone_id, started_at DESC);
