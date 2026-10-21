-- Daily reminders. A row belongs to one browser's push subscription, not to an
-- account, so guests can opt in too. The endpoint is an unguessable capability URL.
CREATE TABLE push_subscriptions (
  endpoint text PRIMARY KEY CHECK (char_length(endpoint) BETWEEN 1 AND 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 256),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 64),
  time_zone text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  reminder_hour smallint NOT NULL CHECK (reminder_hour BETWEEN 0 AND 23),
  -- Local calendar days in time_zone, as the player's device reported them.
  last_played_on date,
  streak_count integer NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  last_sent_on date,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
