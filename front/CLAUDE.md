# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Project Rules

- **Naming Convention**: Always use camelCase for variables/functions. Database fields must NOT have underscores (e.g., use `customerId`, not `customer_id`).
- **Architecture**: Strictly follow SOLID principles. Separate business logic (Services/Hooks) from UI (Components).
- **State & Data**: Use the `CustomerRegistry` as the single source of truth for business rules.
- **Database**: Access Supabase only through dedicated service layers. Always log significant actions.

## Commands

- `npm run dev` — Vite dev server with HMR
- `npm run build` — production build to `dist/`
- `npm run preview` — preview built bundle
- `npm run lint` — ESLint over the repo

No test runner is configured.

## Stack

React 19 + Vite 8 + Tailwind 4 (via `@tailwindcss/vite`, imported in `src/index.css`). Routing is `react-router` v7. Backend is Supabase (`@supabase/supabase-js`) via a single client in `src/supabaseClient.js`, configured from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`. UI is Hebrew/RTL (`dir="rtl"` on container elements).

## Architecture

The app is an internal CRM/task tracker for a Hebrew-speaking accounting practice. Two Supabase tables drive everything: **`clients`** (nested JSON fields like `customerDetails`, `businessDetails`, `insuranceDetails`, `incomeTaxDetails`, `vatDetails`, `paymentDetails`, plus root-level booleans `isInsuranceActive` / `isIncomeTaxActive` / `isVatActive` / `needsDeductionsFile`) and **`tasks`** (`client_id`, `title`, `status` `'pending' | 'completed'`, `restrictedTo`, JSON `subTasks[]`).

### Auth (single-user, client-side)

`src/services/authService.js` only accepts the username `"מוישי"` and stores `is_authenticated` / `user_name` in `localStorage`. `ProtectedRoute` checks `localStorage` and redirects unauthenticated users to `/`. There is no server-side auth — Supabase is accessed with the anon key directly from the browser.

### Routing

All authenticated routes are nested under `/admin/*` inside `<Layout>` (Sidebar + Header + `<Outlet>`). The login page is `/`. See `src/App.jsx` for the route table — `customers/:id` renders `CustomerCard`, not `CustomerDetails`.

### Task generation pipeline (the heart of the app)

`src/constants/taskRegistry.js` declares `AUTO_TASKS_CONFIG`: a list of parent tasks, each with a `condition(customer)` predicate and a `subTasks[]` array. Each subtask may have its own `condition` and a `getDetails(customer)` function that produces a Hebrew key→value object embedded into the task record.

`TaskGeneratorService.generateForCustomer(customer)` in `src/services/TaskService.js` filters the registry against the customer object and emits parent-task objects with filtered subtasks. This is called in two places:

1. **Preview** — `AddCustomer.jsx` regenerates tasks on every `formData` change so the user sees what tasks would be created.
2. **Persist** — `CustomerService.syncTasks(client, isEdit)` inserts them into the `tasks` table after a save.

When changing the registry, remember: the same data shape is used for both preview (with form `formData`) and persistence (with the saved row from `clients`). Both code paths consume nested fields like `customer.insuranceDetails.insuranceId`, so the form state shape and the DB row shape must stay aligned.

### Edit vs. create sync rule

`CustomerService.syncTasks` only deletes **pending** tasks before regenerating (`.eq('status', 'pending')`). Completed tasks are kept as historical record. Any new "delete and regenerate" logic must preserve this — never wipe completed tasks.

### Business-rule cascade

`CustomerService.applyBusinessLogic(prev, category, field, value)` is the single place that enforces cross-field invariants when editing a customer (e.g. `businessType` being `'זעיר'` or `'פטור'` forces `isVatActive = false`; `employsWorkers === 'yes'` sets `needsDeductionsFile = true`; turning off `isIncomeTaxActive` clears `incomeTaxDetails`; `monthlyFee <= 0` disables `directDebit`). `CustomerCard.jsx` routes all edit changes through it. `AddCustomer.jsx` currently inlines similar logic in its own `handleChange` and effects — be aware of the duplication if you touch either.

### `restrictedTo`

Parent tasks may carry `restrictedTo: 'מוישי'`. `TaskCard` greys out and disables subtask checkboxes when `currentUser !== task.restrictedTo`. The string `"מוישי"` is currently hard-coded both as the only authorized login and as the only restriction value — if you generalize one, generalize the other.

### Known rough edges

- `src/services/logService.js` POSTs to the literal string `'YOUR_DB_ENDPOINT/logs'` — logging is effectively a no-op (it console-logs and the fetch fails silently).
- Both `react-router` and `react-router-dom` are installed; files mix imports from each. Prefer matching the file you're editing rather than churning imports.
- `CustomerDetails.jsx` is imported in `App.jsx` but not routed; `CustomerCard` is the live customer-detail view.


db - sql - schema: 
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customerDetails jsonb,
  representationFor ARRAY,
  businessDetails jsonb,
  insuranceDetails jsonb,
  incomeTaxDetails jsonb,
  vatDetails jsonb,
  paymentDetails jsonb,
  isInsuranceActive boolean DEFAULT false,
  isIncomeTaxActive boolean DEFAULT false,
  isVatActive boolean DEFAULT false,
  needsDeductionsFile boolean DEFAULT false,
  comments text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  createdAt timestamp with time zone DEFAULT now(),
  title text NOT NULL,
  status text DEFAULT 'pending'::text,
  restrictedTo text,
  subTasks jsonb DEFAULT '[]'::jsonb,
  parent_task_id text,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
