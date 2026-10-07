-- 0026: Contreal sync — stage 0 (connection only).
--
-- Holds the single OAuth connection to Contreal's MCP server, used by the
-- contreal-sync Edge Function. Task tables (contreal_task_link,
-- contreal_user_map) come in a later migration, once stage 0 has confirmed
-- the real shape of Contreal's responses.
--
-- Security: RLS is enabled with NO policies on purpose. The anon key shipped
-- to the browser cannot read or write this table at all (tokens stay
-- server-side); only the Edge Function, using the service-role key, can.

BEGIN;

CREATE TABLE IF NOT EXISTS contreal_auth (
  id               smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- exactly one row
  status           text        NOT NULL DEFAULT 'none'
                               CHECK (status IN ('none', 'pending', 'connected', 'expired')),
  client_id        text,
  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  pkce_verifier    text,
  oauth_state      text,
  status_id_done   bigint,
  status_id_todo   bigint,
  last_synced_at   timestamptz,
  sync_lock_until  timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO contreal_auth (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE contreal_auth ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated get nothing. service_role bypasses RLS.

COMMIT;
