-- historia zbiorcza: ile aut dostępnych / z rabatem Relokacja w danej strefie o danym czasie
CREATE TABLE IF NOT EXISTS zone_snapshots (
  id                     INTEGER PRIMARY KEY,
  zone_id                INTEGER,
  taken_at               TEXT,
  cars_available         INTEGER,
  cars_relocation        INTEGER,
  relocation_amount_sum  INTEGER
);
CREATE INDEX IF NOT EXISTS zone_snapshots_zone_time ON zone_snapshots(zone_id, taken_at DESC);
