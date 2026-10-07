-- 0028: Contreal sync — automatic run every 10 minutes.
--
-- Contreal has no webhooks (only its MCP server), so changes made in Contreal can
-- only reach Shmaya by polling. Shmaya → Contreal is already immediate (push_status
-- on every check-off). This schedules the contreal-sync Edge Function's `sync`
-- action every 10 minutes from inside Supabase (pg_cron + pg_net), so it runs even
-- when nobody has the site open.
--
-- Safe to re-run: the job is (re)created under a fixed name.
-- The function is deployed with --no-verify-jwt, so no key is sent here.
-- A sync that is already running (manual or previous run) makes this one return
-- "sync_running" without doing anything (DB lock in contreal_auth).
--
-- To stop:     SELECT cron.unschedule('contreal-sync');
-- Run history: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- HTTP result: SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contreal-sync') THEN
    PERFORM cron.unschedule('contreal-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'contreal-sync',
  '*/10 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://ixcbkmckwfvzhsspyqxr.supabase.co/functions/v1/contreal-sync',
      body := '{"action": "sync", "source": "cron"}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
