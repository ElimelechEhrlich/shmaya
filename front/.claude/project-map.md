# Project Map — Current Architecture

This document supersedes the original audit. It describes the system as it
exists today after the Registry/Adapter/Hook refactor. Historical audit
findings are referenced where the current design exists specifically to
prevent the bug they identified.

> Scope: everything under `/src`, plus `db/migrations/0001_registry_alignment.sql`.

---

## 1. The four architectural boundaries

The codebase has been deliberately re-layered around four single-responsibility modules. Each is the *only* place in `/src` that owns its concern.

| Boundary | File | Owns |
|---|---|---|
| **Supabase access** | `src/services/PersistenceAdapter.ts` | Every `supabase.from(...)` call. The only file that knows about legacy DB column names (`client_id`, `created_at`). Translates between camelCase Registry shapes and DB rows. |
| **Business rules** | `src/registries/CustomerRegistry.ts` | Customer domain types, business-type matrix, service definitions, field visibility/required rules, cross-field cascade, **parentTaskId-anchored progress + finalization**, boolean coercion helpers. |
| **Persistence orchestration** | `src/services/CustomerService.js` + `src/hooks/useCustomer.ts` | Save + task-sync flows; edit-mode state; wraps Adapter calls with LogService writes. |
| **Logging** | `src/services/LogService.ts` | Every observable state change. Emits to the `logs` table via Adapter. Diff-based changesets. |

Validation invariants (verified by grep):

- `supabase.from(...)` appears only in `PersistenceAdapter.ts` and the client factory `supabaseClient.js`.
- `client_id` / `created_at` appear only in `PersistenceAdapter.ts`.
- `JSON.parse` for boolean form values appears nowhere — all such fields route through `coerceBool` / `boolToOption`.
- No business-type string literal (`'זעיר'`, `'מורשה'`, …) is compared in any component. Components ask the Registry (`isEmployerType`, `isRepresentationAllowed`, `BUSINESS_TYPE_OPTIONS`).

---

## 2. CustomerRegistry — the rule engine

`src/registries/CustomerRegistry.ts` is the *sole driver* of business logic. Eleven exported sections; everything else in `/src` consumes them.

### 2.1 Domain types (§2 of file)

`Customer` mirrors the live DB shape directly — no cosmetic renames. Field names like `isInsuranceActive`, `businessID`, `newItCase` are preserved exactly so the Adapter rename map stays minimal (only `createdAt ↔ created_at`).

`BusinessTypeKey` is the literal union of Hebrew values:
```ts
'זעיר' | 'פטור' | 'מורשה' | 'חברה בע"מ' | 'אחר'
```
The DB stores Hebrew, form selects emit Hebrew — no value-mapping layer.

Two narrow unions back the Service registry:
- `ServiceActiveFlag = 'isIncomeTaxActive' | 'isInsuranceActive' | 'isVatActive'`
- `ServiceDetailsKey = 'incomeTaxDetails' | 'insuranceDetails' | 'vatDetails'`

These let the cascade assign `next[flag] = false` without `as Record<>` casts.

### 2.2 Business type matrix (`BUSINESS_TYPES`, §3)

| `key` | `representationAllowed` | `showsEmployerFields` | `forcesServicesOff` | `forcedParentTasks` | `forcedSubtasks` |
|---|---|---|---|---|---|
| `'זעיר'` | false | false | `['representation']` | `['INCOME_TAX']` | `[{ parentId: 'INCOME_TAX', subtaskId: 'taxCoordination' }]` |
| `'פטור'` | false | false | `['representation']` | — | — |
| `'מורשה'` | true | true | — | — | — |
| `'חברה בע"מ'` | true | true | — | — | — |
| `'אחר'` | true | false | — | — | — |

`BUSINESS_TYPE_OPTIONS` exports the same list in display order — every dropdown imports this. The audit's UX gap (`CustomerList` filter missing `זעיר` and `אחר`) is closed because every consumer now iterates `BUSINESS_TYPE_OPTIONS`.

### 2.3 Service registry (`SERVICES`, §4)

Three services, each with a clean conceptual key mapped to a legacy DB flag:

| `ServiceKey` | `activeFlag` (Customer field) | `detailsKey` | `parentTaskId` | `subtaskIds` | `clearsOnDeactivate` |
|---|---|---|---|---|---|
| `incomeTax` | `isIncomeTaxActive` | `incomeTaxDetails` | `INCOME_TAX` | `['it_rep', 'it_open', 'taxCoordination']` | `['incomeTaxDetails.incomeTaxPrepayment', 'incomeTaxDetails.annualTurnover']` |
| `nationalInsurance` | `isInsuranceActive` | `insuranceDetails` | `INSURANCE` | `['rep', 'open', 'deductions']` | — |
| `representation` | `isVatActive` | `vatDetails` | `VAT` | `['vat_rep', 'vat_open']` | — |

Note: `subtaskIds` for `incomeTax` includes `taxCoordination` even though that subtask is forced by `BUSINESS_TYPES['זעיר']` rather than by the service flag — so iterating gives the full catalog.

### 2.4 Cross-field cascade (`applyBusinessRules`, §7)

Idempotent normalizer. Called on every form mutation:
1. For each `BUSINESS_TYPES[bt].forcesServicesOff`, set the corresponding `Customer[activeFlag]` to false. (זעיר/פטור → `isVatActive = false`.)
2. Symmetric employer cascade: `needsDeductionsFile = (employsWorkers === 'yes')` when employer type is selected, else `false`. *(Fixes the audit's ratchet bug.)*
3. **Generalized service-deactivation loop**: for each `ServiceDefinition` whose `activeFlag` is false, every dot-path in its `clearsOnDeactivate` array is reset. No more hardcoded `incomeTax` branch — adding a path to any service's array now works automatically.
4. Direct-debit guard: `monthlyFee <= 0` forces `directDebit = false`.

Every nested object is deep-cloned at the top of the function (including `customerDetails`), so the cascade never mutates its input.

### 2.5 Task-emission predicates (§6b)

These eliminate the duplicate condition lambdas that previously lived in `taskRegistry.js`. The generator calls them on each customer change.

- `shouldEmitServiceParent(parentId, c)` → `true | false | null`
  - `true` / `false` for service-owned parents (INSURANCE / INCOME_TAX / VAT) based on `SERVICES[*].activeFlag` *or* `BUSINESS_TYPES[bt].forcedParentTasks`.
  - `null` for non-service parents (ADMIN_SETUP / DIRECT_DEBIT / FINAL_APPROVAL), telling the caller to fall back to the entry's own `condition` lambda.
- `isSubtaskBusinessTypeGated(parentId, subId)` → true if the subtask appears in *any* business type's `forcedSubtasks` list. Such subtasks are emitted *only* when forced; never by default.
- `isSubtaskForcedByBusinessType(parentId, subId, c)` → true if the customer's current business type forces this specific subtask.

### 2.6 Progress + finalization — **parentTaskId-anchored** (§9, §10)

**`calculateWeightedProgress(tasks): { totalUnits, doneUnits, percent }`** — subtask-weighted. Every subtask is one unit. A parent without subtasks counts as one unit. A parent marked `status === 'completed'` short-circuits to all-subtasks-done.

**`isCustomerFinalized(tasks): boolean`** — returns true iff some task has `parentTaskId === 'FINAL_APPROVAL'` AND `status === 'completed'`. The `FINAL_APPROVAL_PARENT_ID` constant is the canonical id.

> **The `parentTaskId` column is the primary anchor** for both progress and finalization. The legacy Hebrew-substring fallback remains in `isCustomerFinalized` *only* for rows persisted before `db/migrations/0001` ran. Once the migration is applied (and `TaskGeneratorService` is already emitting `parentTaskId` on every new row), the fallback can be deleted.

### 2.7 Boolean coercion (§8)

- `coerceBool(v)` — accepts `boolean`, `'true'`/`'false'`, or any other value; returns `boolean`.
- `boolToOption(v)` — returns `'true'` or `'false'` for `<select value=...>`.
- `BOOLEAN_FIELDS` — exported list of dot-paths that MUST flow through these helpers.

Every `<select>` in `AddCustomer` for `newInsuranceCase` / `newItCase` / `newVatCase` is wired through them. `CustomerCard` renders bool fields as checkboxes/buttons, so the bug surface is collapsed entirely.

---

## 3. PersistenceAdapter — the DB boundary

`src/services/PersistenceAdapter.ts`. The only file that imports `supabaseClient`.

### Field-rename maps (the ONLY place that names legacy columns)

```ts
const CUSTOMER_TO_DB = { createdAt: 'created_at' };
const TASK_TO_DB     = { clientId: 'client_id', createdAt: 'created_at' };
```

Inverses are built once at module init. Used by `renameKeys` (uses `structuredClone` + dot-path walks) on every read/write.

### Public surface

| Method | Purpose |
|---|---|
| `fetchAllCustomers()` | List, no tasks |
| `fetchAllCustomersWithTasks()` | List with joined tasks (used by `CustomerList` for the export + finalization probe) |
| `fetchCustomerWithTasks(id)` | Single customer with joined tasks (the hook's primary read) |
| `insertCustomer(c)` / `updateCustomer(id, c)` | Strip `id` / `createdAt` / `tasks` before write |
| `insertTasks(rows)` | Bulk insert with `clientId → client_id` rename |
| `deletePendingTasksForCustomer(clientId)` | The `.eq('status', 'pending')` filter is here, preserving completed tasks as audit trail |
| `updateTaskStatus(id, status)` | Single-field update |
| `updateTaskSubtasks(id, subTasks)` | Replaces the subtasks JSONB array |
| `updateTask(id, patch)` | Generic task update |
| `insertLog(row)` | Logs table write (called only by `LogService`) |

`toDbCustomer` / `fromDbCustomer` / `toDbTask` / `fromDbTask` are exported as pure mappers for tests or edge cases.

---

## 4. LogService — observable state changes

`src/services/LogService.ts`. Pure orchestration; no Supabase awareness (writes via `PersistenceAdapter.insertLog`).

### Schema (created by `db/migrations/0001` §2)

```sql
CREATE TABLE logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL    DEFAULT now(),
  actor       text        NOT NULL,
  action      text        NOT NULL,
  "entityType" text       NOT NULL,
  "entityId"  uuid,
  payload     jsonb       NOT NULL    DEFAULT '{}'::jsonb
);
```

The legacy `logService.js` (which POSTed to the literal string `YOUR_DB_ENDPOINT/logs`) has been deleted.

### Public surface

| Method | Emits |
|---|---|
| `recordCustomerCreate(customer, actor?)` | `action: 'customer.create'`, `payload: { after: <full customer> }` |
| `recordCustomerChange(id, before, after, actor?)` | `action: 'customer.update'`, `payload: { changeSet: { dotPath: { old, new } } }` — diff computed by `diff()` helper, no-ops when changeset is empty |
| `recordTaskStatusChange(id, oldStatus, newStatus, actor?)` | `action: 'task.status'`, `payload: { changeSet: { status: {old, new} } }` |
| `recordTaskChange(id, before, after, actor?)` | `action: 'task.update'`, with diff |
| `recordAction(action, entityType, entityId, payload?, actor?)` | Escape hatch for events that aren't field edits |

`actor` defaults to `localStorage.user_name` (anonymous client-side auth — see §7.1 for the unresolved RLS question).

Failures are swallowed (`console.error`) — logging must never block the user.

---

## 5. useCustomer hook — the UI data layer

`src/hooks/useCustomer.ts`. The CustomerCard screen's entire data layer is this hook. Components don't `useState`/`useEffect` for customer or task data; they consume the hook's output.

### Returns

```ts
{
  customer:       CustomerWithTasks | null;   // last fetched (read-only snapshot)
  editData:       CustomerWithTasks | null;   // mutable working copy
  loading:        boolean;
  isEditing:      boolean;
  progress:       number;                     // 0–100, parentTaskId-anchored weighted
  isFinalized:    boolean;                    // parentTaskId === FINAL_APPROVAL
  actions: {
    updateField(category, field, value);      // runs every change through applyBusinessRules
    setEditMode(editing);                     // exit reverts unsaved edits to `customer`
    save();                                   // CustomerService.saveCustomer → reload
    toggleTaskStatus(taskId, currentStatus);  // Adapter + LogService.recordTaskStatusChange
    updateTask(taskId, patch);                // Adapter + LogService.recordTaskChange (diffed)
    reload();
  }
}
```

Internal state is just `customer`, `editData`, `loading`, `isEditing`. Every derived value (`progress`, `isFinalized`, `visibleFields`) is `useMemo`'d off `editData`.

---

## 6. Task generation — Registry-driven

`src/constants/taskRegistry.js` is now declarative data. **No duplicate condition lambdas for service-owned parents.** Parent gating is decided by the Registry; subtask gating is too, except where subtask-specific fields require their own lambda.

| Parent | Gated by |
|---|---|
| `ADMIN_SETUP` | `condition: () => true` (non-service) |
| `INSURANCE` | Registry: `SERVICES.nationalInsurance.activeFlag` ∨ `BUSINESS_TYPES.forcedParentTasks` |
| `INCOME_TAX` | Registry: `SERVICES.incomeTax.activeFlag` ∨ `BUSINESS_TYPES['זעיר'].forcedParentTasks = ['INCOME_TAX']` |
| `VAT` | Registry: `SERVICES.representation.activeFlag` |
| `DIRECT_DEBIT` | `directDebitCondition` lambda (non-service, complex) |
| `FINAL_APPROVAL` | `condition: () => true`, `restrictedTo: 'מוישי'` |

The generator (`TaskGeneratorService.generateForCustomer`) does:

```js
.filter(parent => {
  const reg = shouldEmitServiceParent(parent.id, customer);
  return reg !== null ? reg : (!parent.condition || parent.condition(customer));
})
.map(parent => ({
  id: crypto.randomUUID(),
  parentTaskId: parent.id,           // ← stamped on every row
  title: parent.title,
  restrictedTo: parent.restrictedTo || null,
  subTasks: parent.subTasks
    .filter(sub => {
      if (sub.condition) return sub.condition(customer);
      if (isSubtaskBusinessTypeGated(parent.id, sub.id)) {
        return isSubtaskForcedByBusinessType(parent.id, sub.id, customer);
      }
      return true;
    })
    .map(...)
}))
```

`TaskGeneratorService.calculateProgress` and `.isCustomerFinalized` are thin facades that delegate to the Registry's parentTaskId-anchored implementations.

---

## 7. Database — live schema

All migrations 0001–0007 have been applied. The schema is stable.

### 7.1 Live tables

| Table | Key columns |
|---|---|
| `customers` | `id` (uuid PK), `full_name`, `is_active`, `comments`, `created_at`; flat detail columns for business, income-tax, VAT, insurance, and payment (see CLAUDE.md for full list). Sentinel row `id = '00000000-0000-0000-0000-000000000000'` represents office-wide tasks. |
| `parent_tasks` | `id`, `customer_id` (FK → customers, nullable for office tasks), `title`, `status` (`pending`/`completed`), `registry_key` (stable Registry id: `ADMIN_SETUP` / `INSURANCE` / `INCOME_TAX` / `VAT` / `DIRECT_DEBIT` / `FINAL_APPROVAL`), `priority`, `restricted_to`, `created_at` |
| `sub_tasks` | `id`, `parent_task_id` (FK → parent_tasks), `title`, `completed`, `priority`, `comment`, `updated_at`, `updated_by` |
| `logs` | `id`, `created_at`, `actor`, `action`, `entity_type`, `entity_id`, `payload` (jsonb) |

**Dropped (migration 0007, 2026-06-23):** `business_details`, `income_tax_cases`, `vat_cases`, `insurance_cases`, `payment_details`. Data was backfilled to `customers` in migration 0005 before the drop.

### 7.2 Migration history

| File | What it does |
|---|---|
| `0001_registry_alignment.sql` | Adds `registry_key` to `parent_tasks` + index + Hebrew backfill; creates `logs` table |
| `0002_priority_and_office_tasks.sql` | Adds `priority` to `parent_tasks`; makes `customer_id` nullable |
| `0003_add_parent_task_registry_key.sql` | Re-ensures `registry_key` column + backfill by title |
| `0004_flatten_customer_details.sql` | Adds all detail columns directly to `customers` |
| `0005_backfill_customer_columns.sql` | Copies data from legacy detail tables → `customers` columns |
| `0006_fix_fee_column_types.sql` | Changes `setup_fee` / `monthly_fee` text → numeric |
| `0007_drop_legacy_detail_tables.sql` | Drops the five legacy 1:1 detail tables |

Auth: still anon-key client-side. **No Supabase auth, no known RLS.** The `actor` field in logs comes from `localStorage.user_name`.

---

## 8. Component dependency graph

```
main.jsx
  └─ App.jsx (Routes — clean: only routed components imported)
        ├─ "/"                    → Login           ──→ authService
        └─ "/admin/*"             → ProtectedRoute  ──→ authService
              └─ Layout (Sidebar + Header + <Outlet/>)
                    ├─ /dashboard         → Dashboard      (static stub)
                    ├─ /customers         → Customers      → CustomerList
                    │                                          ├─ PersistenceAdapter.fetchAllCustomersWithTasks
                    │                                          ├─ TaskGeneratorService.isCustomerFinalized (Registry-anchored)
                    │                                          └─ BUSINESS_TYPE_OPTIONS (Registry)
                    ├─ /customers/new     → AddCustomer
                    │                          ├─ applyBusinessRules / isEmployerType / isRepresentationAllowed (Registry)
                    │                          ├─ coerceBool / boolToOption (Registry)
                    │                          ├─ BUSINESS_TYPE_OPTIONS (Registry)
                    │                          ├─ TaskGeneratorService.generateForCustomer (preview)
                    │                          └─ CustomerService.saveCustomer
                    ├─ /customers/:id     → CustomerCard
                    │                          ├─ useCustomer (hook — owns ALL data + actions)
                    │                          └─ isEmployerType / isRepresentationAllowed / BUSINESS_TYPE_OPTIONS (Registry)
                    ├─ /tasks             → Tasks           (placeholder)
                    ├─ /tasks/:id         → TaskDetails     (placeholder)
                    └─ /logs              → Logs            (static mock — TODO: wire to logs table)

Services (linear dependencies, no cycles):
  CustomerService.js  ──→ PersistenceAdapter.ts  ──→ supabaseClient.js
                      └─→ LogService.ts          ──→ PersistenceAdapter.ts
                      └─→ TaskService.js         ──→ CustomerRegistry.ts
                                                 └─→ taskRegistry.js
  useCustomer.ts      ──→ CustomerService.js
                      └─→ PersistenceAdapter.ts
                      └─→ LogService.ts
                      └─→ CustomerRegistry.ts
```

### Dead code removed during refactor

- `src/comps/TaskManager.jsx` — orphaned (deleted)
- `src/services/logService.js` — broken legacy (deleted, replaced by `LogService.ts`)
- `src/pages/CustomerDetails.jsx` — never routed (deleted)
- `representationFor` field — removed from `AddCustomer` initial state

---

## 9. How the original audit findings stand

| Audit finding | Status |
|---|---|
| #1 `logService` is a no-op | ✅ Fixed. `LogService.ts` writes to the `logs` table via Adapter. Requires `db/migrations/0001` §2 to actually persist. |
| #2 `tasks.details` vs `subTasks[*].details` confusion | ✅ Resolved by deletion. `TaskManager.jsx` (only writer of `tasks.details`) is gone. The top-level `details` column is now a drop candidate. |
| #3 Phantom `isFinalApproved` in export | ✅ Fixed. `CustomerList.exportToExcel` now calls `TaskGeneratorService.isCustomerFinalized(client.tasks)`. |
| #4 `needsDeductionsFile` ratchet | ✅ Fixed. Symmetric employer cascade in `applyBusinessRules`. Both screens call it. |
| #5 `isCustomerFinalized` Hebrew-substring brittleness | ✅ Fixed by `parentTaskId`. Substring kept only as legacy fallback. |
| #6 `calculateProgress` ignores subtasks | ✅ Fixed by `calculateWeightedProgress`. Subtask-weighted. |
| #7 VAT silently disables when business type changes | ⚠️ Behavior preserved (deliberate per `BUSINESS_TYPES.forcesServicesOff`). Cascade is now visible/centralized; UX warning still missing. |
| #8 `syncTasks` deletes only pending | ⚠️ Unchanged. Completed tasks survive as audit trail. Open design question: what to do with completed tasks of a deactivated service. |
| #9 `AddCustomer` bypasses `applyBusinessLogic` | ✅ Fixed. AddCustomer runs every `formData` change through `applyBusinessRules` in a useEffect. |
| #10 Phantom columns (`representationFor`, `tasks.category`, `tasks.details`) | ⚠️ Code-side cleaned; columns scheduled for drop in `db/migrations/0001` §3 (commented out pending confirmation). |
| #11 Anon Supabase key + no RLS | ⚠️ Unresolved. Architecture now logs `actor` from localStorage; this is the natural seam for replacing client-side auth with real Supabase Auth + RLS. |
| #12 Mixed `react-router` / `react-router-dom` imports | ⚠️ Unchanged. `CustomerCard.jsx` still imports from `react-router-dom`. Harmless today; lurking. |

---

## 10. Known limitations / open items

These are intentionally deferred — flagged here so future work can pick them up.

1. **All migrations (0001–0007) have been applied.** `logs` table exists; `registry_key` column exists; legacy detail tables have been dropped.
2. **Logs UI is still mock data.** `src/pages/Logs.jsx` renders a hardcoded array. The wiring through `PersistenceAdapter` + a logs-fetch method is unwritten.
3. **No Supabase auth + no known RLS.** Anon key is in the browser bundle; access control is `localStorage.is_authenticated === 'true'` against the literal username `'מוישי'`. The `LogService.actor` field is whatever the client claims.
4. **Phase-2 underscore rename not done.** `client_id` and `created_at` survive in the DB. The Adapter bridges; the rename map is the only thing that needs to change once those columns are renamed.
5. **`isInsuranceActive.insuranceId` / `.insuranceStatus`** are read by the task generator but no form input collects them. The fields are documented in the Registry as "currently dangling in DB — must add form input."
6. **Service deactivation policy.** When `isVatActive` flips false, pending VAT tasks are deleted by `syncTasks` but completed ones remain. No surfacing in UI.
7. **`subtaskIds` on `SERVICES` is informational.** The generator iterates `AUTO_TASKS_CONFIG[*].subTasks`, not this array. Adding a subtask requires touching both files.
8. **`Logs` page still shows hardcoded mock data**, separate from the broader logging fix.

---

*Generated after the four-pass refactor (Registry → Adapter → LogService → useCustomer hook). The file describes intended current state; verify against `git log` if discrepancies appear.*
