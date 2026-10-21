-- Streak freezes keep a streak alive across missed days, so the reminder needs them too.
-- rejected_since is the first local day the push service refused this subscription
-- (other than "gone") with no delivery since; after a week of that the row is dropped.
ALTER TABLE push_subscriptions
  ADD COLUMN freeze_count smallint NOT NULL DEFAULT 0 CHECK (freeze_count >= 0),
  ADD COLUMN rejected_since date;
