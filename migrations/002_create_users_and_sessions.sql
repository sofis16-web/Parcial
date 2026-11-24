CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE CHECK (username = lower(btrim(username)) AND length(username) > 0),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sesiones en servidor: se guarda solo el SHA-256 del token, nunca el token.
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
