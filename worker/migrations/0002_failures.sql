-- Consecutive delivery failures: a subscription that keeps failing is removed.
ALTER TABLE subscriptions ADD COLUMN failures INTEGER NOT NULL DEFAULT 0;
