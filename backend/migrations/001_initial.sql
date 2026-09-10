CREATE TABLE users (
  id uuid PRIMARY KEY,
  google_subject text NOT NULL UNIQUE CHECK (char_length(google_subject) BETWEEN 1 AND 255),
  email text NOT NULL CHECK (char_length(email) BETWEEN 1 AND 320),
  name text NOT NULL CHECK (char_length(name) <= 255),
  picture text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL CHECK (char_length(csrf_token) BETWEEN 32 AND 256),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE user_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  save_data jsonb NOT NULL CHECK (jsonb_typeof(save_data) = 'object'),
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
