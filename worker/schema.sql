CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint     TEXT PRIMARY KEY,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  time         TEXT NOT NULL,          -- "HH:MM" local time chosen by the user
  time_zone    TEXT NOT NULL,          -- IANA zone, e.g. Europe/Rome
  next_send_at INTEGER NOT NULL,       -- epoch ms (UTC) of the next delivery
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subscriptions_next_send_at ON subscriptions (next_send_at);
