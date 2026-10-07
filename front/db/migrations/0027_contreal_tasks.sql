-- 0027: Contreal sync — task tables (stages 1–4).
--
-- Built on the real responses of Contreal's MCP server (stage 0 discover):
--   * task ids are integers; deadline_date is a plain date (YYYY-MM-DD, no time);
--   * status = {id, name, is_completed}; priority = {id, priority_name};
--   * assignees = [{id, name}]; every task has a direct `url` in Contreal.
--
-- Each Contreal task is ONE sub_task under a single office parent
-- (parent_tasks.registry_key = 'CONTREAL', customer_id = OFFICE_CUSTOMER_ID).
-- The link between a sub_task and its Contreal task lives in contreal_task_link,
-- NOT in a sub_tasks column: the browser's anon key can write sub_tasks, so a
-- column there would let anyone point a row at any Contreal task and close it
-- through push_status. contreal_task_link is readable by the browser (to show
-- deadline/status/assignees) but writable only by the contreal-sync Edge
-- Function (service role).

BEGIN;

-- ── One CONTREAL parent at most (two concurrent syncs cannot create two) ──
CREATE UNIQUE INDEX IF NOT EXISTS parent_tasks_contreal_unique
  ON parent_tasks (registry_key)
  WHERE registry_key = 'CONTREAL';

-- ── sub_task ↔ Contreal task ──
CREATE TABLE IF NOT EXISTS contreal_task_link (
  subtask_id          uuid        PRIMARY KEY REFERENCES sub_tasks(id) ON DELETE CASCADE,
  contreal_task_id    bigint      NOT NULL UNIQUE,
  -- Shmaya user names (authService ALLOWED_USERS) of the mapped assignees
  assigned_to         text[]      NOT NULL DEFAULT '{}',
  -- Contreal's own assignees [{id, name}], mapped or not (for grouping / display)
  contreal_assignees  jsonb       NOT NULL DEFAULT '[]',
  deadline_date       date,
  status_name         text,
  priority_name       text,
  project_name        text,
  client_name         text,
  url                 text,
  -- completion state both sides are known to agree on; a sub_task whose
  -- is_completed differs from this was changed in Shmaya and not yet pushed
  synced_completed    boolean     NOT NULL DEFAULT false,
  push_error          text,
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contreal_task_link_assigned_to_idx
  ON contreal_task_link USING gin (assigned_to);

ALTER TABLE contreal_task_link ENABLE ROW LEVEL SECURITY;
-- Browser may READ only. No insert/update/delete policies.
DROP POLICY IF EXISTS contreal_task_link_read ON contreal_task_link;
CREATE POLICY contreal_task_link_read ON contreal_task_link FOR SELECT USING (true);

-- ── Contreal user → Shmaya user (filled in by hand in the Table Editor) ──
CREATE TABLE IF NOT EXISTS contreal_user_map (
  contreal_user_id  bigint      PRIMARY KEY,
  contreal_name     text        NOT NULL,
  shmaya_user       text,                     -- e.g. 'יוחנן' / 'שמוליק' / 'מוישי'; NULL = not mapped yet
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contreal_user_map ENABLE ROW LEVEL SECURITY;
-- No policies: only the Edge Function (service role) and the dashboard's Table Editor.

COMMIT;
