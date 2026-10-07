# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Project Rules

- **Naming Convention**: Always use camelCase for variables/functions. Database fields must NOT have underscores (e.g., use `customerId`, not `customer_id`).
- **Architecture**: Strictly follow SOLID principles. Separate business logic (Services/Hooks) from UI (Components).
- **State & Data**: Use the `CustomerRegistry` as the single source of truth for business rules.
- **Database**: Access Supabase only through dedicated service layers. Always log significant actions.

> The DB rules above are aspirational. The live schema mixes snake_case (`client_id`, `parent_task_id`, `entity_type`, `entity_id`, `is_active`, `created_at`) and camelCase (`subTasks`, `restrictedTo`, the JSONB blobs). All UI/service code uses camelCase exclusively; `src/services/PersistenceAdapter.ts` is the single seam that translates to/from the snake_case columns. Don't add new snake_case knowledge anywhere else.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — production build to `dist/`
- `npm run preview` — preview built bundle
- `npm run lint` — ESLint over the repo

No test runner is configured. After cloning, run `npm install` (xlsx is required by the Logs export).

## Stack

React 19 + Vite 8 + Tailwind 4 (via `@tailwindcss/vite`, imported in `src/index.css`). Routing is `react-router` v7. Backend is Supabase (`@supabase/supabase-js`) via a single client in `src/supabaseClient.js`, configured from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`. UI is Hebrew/RTL (`<html dir="rtl">` in `index.html`). Typography is Heebo (Hebrew) + Inter (Latin chrome). TypeScript is configured via `tsconfig.json` for the `.ts` files only — `.jsx` files coexist without strict checking.

## Architecture — the four boundaries

Every concern has exactly one owner. Putting code in the wrong place is a real bug.

| Boundary | File | Owns |
|---|---|---|
| **DB access** | `src/services/PersistenceAdapter.ts` | Every `supabase.from(...)` call. Translates camelCase ↔ snake_case via `CUSTOMER_TO_DB` / `TASK_TO_DB` / `LOG_TO_DB` rename maps. Defensive `insertLog` (UUID-validates `entityId`). The only file that knows about `client_id`, `parent_task_id`, `entity_type`, `entity_id`, `is_active`, `created_at`. |
| **Business rules** | `src/registries/CustomerRegistry.ts` | Customer domain types, business-type matrix (`BUSINESS_TYPES`), service definitions (`SERVICES`), field visibility/required (`FIELD_RULES`, `isAttributeVisible`/`isAttributeRequired`), cross-field cascade (`applyBusinessRules`), idempotent merge planner (`planIdempotentSync`), parent↔subtask cascade utilities (`cascadeOnParentToggle`, `cascadeOnSubtaskSet`), parentTaskId-anchored progress (`calculateWeightedProgress`) and finalization (`isCustomerFinalized`), priority + category color maps, boolean coercion (`coerceBool`/`boolToOption`). |
| **State + orchestration** | `src/hooks/useCustomer.ts` + `src/services/CustomerService.js` | Hook owns CustomerCard's entire data layer (fetch, edit-mode, optimistic mutations, cascade application). Service handles save flow + idempotent `syncTasks` + deactivate/delete. |
| **Logging** | `src/services/LogService.ts` | ⚠️ LogService is intentionally disabled — all methods are no-ops (code is commented out). Do not assume logs are being written. Re-enable only after verifying the logs table exists in Supabase. | Every observable state change. Writes via `PersistenceAdapter.insertLog`. Diff-based changesets via internal `diff()`. Actor defaults to `localStorage.user_name`. |

**Validation invariants** (verifiable by grep):
- `supabase.from(...)` exists only inside `PersistenceAdapter.ts`.
- Snake_case DB column names (`client_id`, `parent_task_id`, `entity_type`, `entity_id`, `is_active`) appear only inside `PersistenceAdapter.ts` (plus one defensive fallback read in the Registry).
- No business-type string literal (`'זעיר'`, `'מורשה'`, …) is compared inside any component — components call Registry helpers (`isEmployerType`, `isRepresentationAllowed`, `BUSINESS_TYPE_OPTIONS`).
- Form boolean selects route through `coerceBool` + `boolToOption`. Raw `JSON.parse(e.target.value)` is forbidden for form-bound booleans.

## Auth (single-user, client-side)

`src/services/authService.js` only accepts the username `"מוישי"` and stores `is_authenticated` / `user_name` in `localStorage`. `ProtectedRoute` checks `localStorage` and redirects to `/`. There is no Supabase auth — the anon key is shipped to the browser. RLS is the only thing standing between the app and a data wipe; verify policies before going live.

## Routing

All authenticated routes are nested under `/admin/*` inside `<Layout>` (Sidebar + Header + `<Outlet>`). Login is `/`. See `src/App.jsx`:
- `/admin/dashboard` → `Dashboard` (static stub)
- `/admin/customers` → `Customers` → `CustomerList` (clickable rows navigate to detail)
- `/admin/customers/new` → `AddCustomer`
- `/admin/customers/:id` → `CustomerCard` (powered by `useCustomer`)
- `/admin/tasks` → `Tasks` (subtask-centric, cross-customer)
- `/admin/tasks/:id` → `TaskDetails` (placeholder)
- `/admin/logs` → `Logs` (live from `logs` table; Excel export). Two tabs: "יומן פעולות" (everything except Contreal syncs) and "סנכרוני קונטריל" (`action = CONTREAL_SYNC_LOG_ACTION`, manual and cron), filtered in the query so syncs never fill the 500-row limit.

## Task generation

`src/constants/taskRegistry.js` is declarative data — parent task ids, titles, optional subtask `condition` lambdas, `getDetails` projection functions. Parent gating for service-owned parents (`INSURANCE`, `TAX_VAT`) is **driven by the Registry**, not by lambdas here. `TAX_VAT` merges the legacy `INCOME_TAX`+`VAT` parents (two `SERVICES` entries share one `parentTaskId`); `shouldEmitServiceParent` aggregates all services sharing a parent id via `.filter()`+`.some()`, not a single-match `.find()`. Non-service parents (`ADMIN_SETUP`, `DIRECT_DEBIT`, `OFFICE_HANDLING`) keep their own `condition`.

`TaskGeneratorService.generateForCustomer(customer)` in `src/services/TaskService.js` consults the Registry's `shouldEmitServiceParent` and `isSubtaskBusinessTypeGated`/`isSubtaskForcedByBusinessType` and emits tasks with stable `parentTaskId`s (NOT Hebrew title strings). Each emitted row carries `priority: 'medium'` by default and `comment: ''` on every subtask. Called by:

1. **Preview** — `AddCustomer.jsx` regenerates on every `formData` change.
2. **Persist** — `CustomerService.syncTasks(client, isEdit)` runs the **idempotent merge** via `Registry.planIdempotentSync` on edit: matches generated tasks against existing ones by `parentTaskId`, preserves completion status + subtask completion + comments. Only pending parents whose `parentTaskId` is no longer in the generated set are deleted.

When changing the registry, remember the same data shape is consumed by both preview (form `formData`) and persistence (saved row). Both paths read nested fields like `customer.insuranceDetails.insuranceId`; the form state shape and DB row shape must stay aligned.

## Business-rule cascade

`Registry.applyBusinessRules(customer)` enforces all cross-field invariants in one idempotent function:
- `businessType` in `{זעיר, פטור}` forces `isVatActive = false` (via `BUSINESS_TYPES[bt].forcesServicesOff`).
- Symmetric employer cascade: `needsDeductionsFile` follows `employsWorkers === 'yes'` in both directions (no ratchet).
- Income-tax deactivation clears its derived fields (generalized for every service via `SERVICES[*].clearsOnDeactivate`).
- `monthlyFee <= 0` forces `directDebit = false`.

'AddCustomer' runs this once at save time (inside handleSubmit), not on every formData change. The 'useEffect' in AddCustomer only generates the task preview. `CustomerCard.jsx` routes every edit through `actions.updateField` in `useCustomer`, which applies the same cascade. There is no longer a `CustomerService.applyBusinessLogic` — that's the old name; the new path is the Registry function.

## Parent↔subtask completion coupling

`Registry.cascadeOnParentToggle(task)` / `cascadeOnSubtaskSet(task, subId, completed)` are pure helpers. The `useCustomer` hook applies them on every toggle:
- Parent → completed cascades to every subtask.
- Single subtask flip recomputes parent (`allDone ? 'completed' : 'pending'`).

All mutations in the hook are **optimistic** — local state updates synchronously, the DB write fires in background. No reload-after-write. On error: `console.error` + `reload()`.

## Database — migrations + schema

Migrations applied (in order):
- `db/migrations/0001_registry_alignment.sql` — adds `registry_key` to `parent_tasks` + index + backfill, creates `logs` table.
- `db/migrations/0002_priority_and_office_tasks.sql` — adds `priority` to `parent_tasks`, makes `customer_id` nullable (office-wide tasks).
- `db/migrations/0003_add_parent_task_registry_key.sql` — ensures `registry_key` column + backfill by title.
- `db/migrations/0004_flatten_customer_details.sql` — adds all detail columns directly to `customers`.
- `db/migrations/0005_backfill_customer_columns.sql` — copies data from legacy detail tables → `customers` columns.
- `db/migrations/0006_fix_fee_column_types.sql` — changes `setup_fee` / `monthly_fee` from `text` to `numeric`.
- `db/migrations/0007_drop_legacy_detail_tables.sql` — drops the five legacy 1:1 detail tables (applied 2026-06-23).
- `0009`–`0025` — see the files in `db/migrations/`.
- `db/migrations/0026_contreal_auth.sql` / `0027_contreal_tasks.sql` / `0028_contreal_sync_cron.sql` / `0029_contreal_sync_every_5_min.sql` — Contreal sync (see below).

### Live schema (reference only — not for execution)

```sql
CREATE TABLE public.customers (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name              text        NOT NULL,
  is_active              boolean     NOT NULL DEFAULT true,
  comments               text,
  created_at             timestamptz DEFAULT now(),
  -- business details
  business_name          text,
  business_id            text,
  business_type          text,
  opening_date           date,
  occupation             text,
  business_description   text,
  employs_workers        text,
  needs_deductions_file  boolean     DEFAULT false,
  deductions_id          text,
  -- income-tax
  income_tax_rep_type    text,
  income_tax_prepayment  text,
  annual_turnover        text,
  income_tax_is_new_case boolean     DEFAULT false,
  is_income_tax_active   boolean     DEFAULT false,
  -- VAT
  vat_is_new_case        boolean     DEFAULT false,
  is_vat_active          boolean     DEFAULT false,
  -- insurance
  insurance_prepayment   text,
  work_hours             text,
  insurance_is_new_case  boolean     DEFAULT false,
  insurance_id           text,
  insurance_status       text,
  is_insurance_active    boolean     DEFAULT false,
  -- payment
  setup_fee              numeric     DEFAULT 0,
  monthly_fee            numeric     DEFAULT 0,
  direct_debit           boolean     DEFAULT false
);

-- sentinel row: id = '00000000-0000-0000-0000-000000000000' → office-wide tasks

CREATE TABLE public.parent_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid        REFERENCES customers(id),  -- NULL = office-wide task
  title        text        NOT NULL,
  status       text        DEFAULT 'pending',          -- 'pending' | 'completed'
  restricted_to text,
  registry_key text,                                   -- stable key: ADMIN_SETUP | INSURANCE | TAX_VAT | DIRECT_DEBIT | OFFICE_HANDLING
  priority     text        NOT NULL DEFAULT 'medium',  -- 'low' | 'medium' | 'high' | 'critical'
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE public.sub_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_task_id  uuid        NOT NULL REFERENCES parent_tasks(id),
  title           text        NOT NULL,
  is_completed    boolean     NOT NULL DEFAULT false,
  priority        text        NOT NULL DEFAULT 'medium',
  comment         text        DEFAULT '',
  updated_at      timestamptz,
  updated_by      text
);

CREATE TABLE public.logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor        text        NOT NULL,
  action       text        NOT NULL,
  entity_type  text        NOT NULL,   -- 'customer' | 'task' | 'system'
  entity_id    uuid,
  payload      jsonb       NOT NULL DEFAULT '{}'
);
```

**Dropped tables (0007, 2026-06-23):** `business_details`, `income_tax_cases`, `vat_cases`, `insurance_cases`, `payment_details` — all data was backfilled to `customers` in migration 0005 before the drop.

RLS reminder: a Supabase table created via the dashboard defaults to RLS-enabled with zero policies, which silently blocks all writes from the anon key. If logs aren't persisting, that's the first thing to check.

## `restrictedTo` — single-user lock

Parent tasks may carry `restrictedTo: 'מוישי'`. `TaskCard` greys out and disables subtask checkboxes when `currentUser !== task.restrictedTo`. The string `"מוישי"` is hardcoded both as the only authorized login and as the only restriction value — if you generalize one, generalize the other.

## Contreal sync

Tasks managed in Contreal (WhatsApp agent "אלה") are mirrored into Shmaya; completion is two-way, everything else comes from Contreal only.

- **Edge Function** `supabase/functions/contreal-sync/index.ts` talks to Contreal's MCP server (`https://api.contreal.io/mcp`, OAuth 2.0 + PKCE, refresh token rotates on every refresh). Deployed with `--no-verify-jwt` (the OAuth callback is a plain GET). Site actions are `POST { action }`: `status`, `sync`, `push_status {subtaskId}`, `task_details {subtaskId}` (each file on the task, its comments and replies gets a fresh `link` from `get_file_link`, max 30; files are never stored in Shmaya; only `https:` links are rendered), `completed_tasks {user}` (read live from Contreal for the "משימות שהושלמו" window — completed tasks are not imported; `user = null` for managers, else only that user's mapped Contreal ids). Admin GET routes `/start`, `/discover`, `/disconnect` require the `CONTREAL_ADMIN_KEY` secret.
- **Tables**: `contreal_auth` (tokens; RLS, no policies), `contreal_task_link` (sub_task ↔ Contreal task; browser may only SELECT), `contreal_user_map` (Contreal user → Shmaya user; auto-filled on sync when the Contreal name equals a Shmaya user or its first word does and exactly one candidate matches — `SHMAYA_USERS` in the function must mirror `ALLOWED_USERS`; never overwrites an existing mapping; fix by hand in the Table Editor). The link deliberately is NOT a `sub_tasks` column: the anon key can write `sub_tasks`, so a column there would let anyone point a row at any Contreal task and close it.
- Each Contreal task is one `sub_task` under the office parent `registry_key = 'CONTREAL'`. `fetchOfficeTasks` excludes that parent (with `.or('registry_key.is.null,registry_key.neq.CONTREAL')` — a plain `neq` would also drop the NULL-key office parents). The dashboard shows them in `ContrealTasksSection` (managers from `CONTREAL_MANAGERS`: all, grouped by worker; others: only tasks whose `assigned_to` includes them). In Shmaya they can only be checked off — no edit/delete.
- **Conflicts**: `sub_tasks.is_completed != contreal_task_link.synced_completed` means a Shmaya change that has not reached Contreal yet; sync pushes it instead of overwriting it. More than 5 deletions in one sync → nothing is deleted.
- **Automatic sync**: Contreal has no webhooks, so Contreal → Shmaya is polled: `0028` schedules `sync` with pg_cron + pg_net, every 5 minutes since `0029` (`source: "cron"`; the function logs to `logs` only when something changed). Shmaya → Contreal is immediate (`push_status` on check-off). The dashboard section re-reads every minute while visible. Tasks done on both sides are not re-checked with `get_task` each run (a reopen shows up in the open list anyway); the cost is that a completed task later deleted in Contreal stays as a completed row in Shmaya.
- **Who marked**: Contreal records every change under the connected user (one connection — the manager's) and offers no way to act as another member. When the Shmaya user who checked a task off (`sub_tasks.updated_by`) is not the connected user (`get_me` → `contreal_user_map.shmaya_user`), the function adds a Contreal comment "✓ סומן כבוצע בשמעיה ע״י <name>" (or "↺ … בוטל …"). Best-effort; never undoes the status push.
- **Sync speed**: MCP SDK is imported statically (bundled at deploy); status ids are cached in `contreal_auth`; linked tasks are checked with `get_task` up to 5 in parallel; a link row is rewritten only when a field changed; new tasks are inserted in bulk. The sync result includes `timingsMs` per phase.
- **Excluded projects**: `EXCLUDED_PROJECT_NAMES` in the function (currently `פרויקט לדוגמה`, Contreal's auto-created demo project) — their tasks are never imported, and already-imported ones are removed from Shmaya (Contreal is untouched; not counted toward the deletion safety limit).
- **Dates**: `deadline_date` is a plain `YYYY-MM-DD`; always format it with `src/utils/formatContrealDeadline.ts` (never `new Date('YYYY-MM-DD')`).

## Deeper architectural docs

`.claude/project-map.md` has the full file-by-file architectural map, the audit findings status, and the open items list (RLS, dual router packages, unused `subtaskIds` informational arrays, etc.).
