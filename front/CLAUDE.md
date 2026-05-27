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
| **Logging** | `src/services/LogService.ts` | Every observable state change. Writes via `PersistenceAdapter.insertLog`. Diff-based changesets via internal `diff()`. Actor defaults to `localStorage.user_name`. |

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
- `/admin/logs` → `Logs` (live from `logs` table; Excel export)

## Task generation

`src/constants/taskRegistry.js` is declarative data — parent task ids, titles, optional subtask `condition` lambdas, `getDetails` projection functions. Parent gating for service-owned parents (`INSURANCE`, `INCOME_TAX`, `VAT`) is **driven by the Registry**, not by lambdas here. Non-service parents (`ADMIN_SETUP`, `DIRECT_DEBIT`, `FINAL_APPROVAL`) keep their own `condition`.

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

`AddCustomer.jsx` runs every `formData` change through this in a `useEffect`. `CustomerCard.jsx` routes every edit through `actions.updateField` in `useCustomer`, which applies the same cascade. There is no longer a `CustomerService.applyBusinessLogic` — that's the old name; the new path is the Registry function.

## Parent↔subtask completion coupling

`Registry.cascadeOnParentToggle(task)` / `cascadeOnSubtaskSet(task, subId, completed)` are pure helpers. The `useCustomer` hook applies them on every toggle:
- Parent → completed cascades to every subtask.
- Single subtask flip recomputes parent (`allDone ? 'completed' : 'pending'`).

All mutations in the hook are **optimistic** — local state updates synchronously, the DB write fires in background. No reload-after-write. On error: `console.error` + `reload()`.

## Database — migrations + schema

Two pending migration files (apply in order):
- `db/migrations/0001_registry_alignment.sql` — adds `tasks.parent_task_id` + index + Hebrew-substring backfill, creates `logs` table.
- `db/migrations/0002_priority_and_office_tasks.sql` — adds `tasks.priority`, makes `tasks.client_id` nullable (office-wide tasks), adds `clients.is_active`.

### Live schema (reference only — not for execution)

```sql
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customerDetails jsonb,
  representationFor ARRAY,                -- dead field (audit), safe to drop
  businessDetails jsonb,
  insuranceDetails jsonb,
  incomeTaxDetails jsonb,
  vatDetails jsonb,
  paymentDetails jsonb,
  isInsuranceActive boolean DEFAULT false,
  isIncomeTaxActive boolean DEFAULT false,
  isVatActive boolean DEFAULT false,
  needsDeductionsFile boolean DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,  -- soft deactivation
  comments text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,                          -- NULL = office-wide task
  createdAt timestamp with time zone DEFAULT now(),
  title text NOT NULL,
  status text DEFAULT 'pending'::text,     -- 'pending' | 'completed'
  restrictedTo text,
  subTasks jsonb DEFAULT '[]'::jsonb,      -- [{ id, title, completed, details?, comment? }]
  parent_task_id text,                     -- stable Registry id (ADMIN_SETUP, INSURANCE, INCOME_TAX, VAT, DIRECT_DEBIT, FINAL_APPROVAL)
  priority text NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' | 'critical'
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,               -- 'customer' | 'task' | 'system'
  entity_id uuid,                          -- nullable; UUID-validated by adapter
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT logs_pkey PRIMARY KEY (id)
);
```

RLS reminder: a Supabase table created via the dashboard defaults to RLS-enabled with zero policies, which silently blocks all writes from the anon key. If logs aren't persisting, that's the first thing to check.

## `restrictedTo` — single-user lock

Parent tasks may carry `restrictedTo: 'מוישי'`. `TaskCard` greys out and disables subtask checkboxes when `currentUser !== task.restrictedTo`. The string `"מוישי"` is hardcoded both as the only authorized login and as the only restriction value — if you generalize one, generalize the other.

## Deeper architectural docs

`.claude/project-map.md` has the full file-by-file architectural map, the audit findings status, and the open items list (RLS, dual router packages, unused `subtaskIds` informational arrays, etc.).
