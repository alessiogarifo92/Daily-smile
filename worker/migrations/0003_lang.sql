-- Language of the notification text ("it" or "en").
ALTER TABLE subscriptions ADD COLUMN lang TEXT NOT NULL DEFAULT 'it';
