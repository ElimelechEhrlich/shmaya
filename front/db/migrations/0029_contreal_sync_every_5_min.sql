-- 0029: Contreal sync — run every 5 minutes instead of every 10.
--
-- 0028 created the pg_cron job 'contreal-sync' with '*/10 * * * *'. This changes
-- only its schedule; the HTTP call it makes is unchanged. Safe to re-run.
-- Overlapping runs are still harmless: a run that finds a sync in progress
-- returns "sync_running" without doing anything (DB lock in contreal_auth).
--
-- Check:  SELECT jobname, schedule FROM cron.job WHERE jobname = 'contreal-sync';

SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'contreal-sync'),
  schedule := '*/5 * * * *'
);
