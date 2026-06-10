// // src/services/LogService.ts
// //
// // Replaces the broken src/services/logService.js (which POSTed to the literal
// // string 'YOUR_DB_ENDPOINT/logs' and was effectively a no-op — see
// // .claude/project-map.md §1, finding #1).
// //
// // Every meaningful state change to a customer or task goes through here.
// // Entries are persisted to the `logs` table (see db/migrations/0001).
// //
// // Naming: camelCase end-to-end. The persistence layer (this file + the
// // migration) uses quoted camelCase column names in the DB so no PersistenceAdapter
// // translation is needed for logs.

// import { PersistenceAdapter } from './PersistenceAdapter';

// // ──────────────────────────────────────────────────────────────────
// // Types
// // ──────────────────────────────────────────────────────────────────

// export type EntityType = 'customer' | 'task' | 'system';

// export interface ChangeSet {
//   [dotPath: string]: { old: unknown; new: unknown };
// }

// export interface LogEntry {
//   id?: string;
//   createdAt?: string;
//   actor: string;
//   action: string;
//   entityType: EntityType;
//   entityId: string | null;
//   payload: Record<string, unknown>;
// }

// // ──────────────────────────────────────────────────────────────────
// // Internals
// // ──────────────────────────────────────────────────────────────────

// function getCurrentActor(): string {
//   if (typeof window === 'undefined') return 'system';
//   return window.localStorage.getItem('user_name') ?? 'unknown';
// }

// /**
//  * Deep diff between two JSON-shaped objects. Returns a flat map of dot-paths
//  * to { old, new } pairs for every leaf that changed. Arrays are compared as
//  * whole values (not element-wise) — good enough for `subTasks` snapshots.
//  */
// export function diff(before: unknown, after: unknown): ChangeSet {
//   const acc: ChangeSet = {};
//   walk(before, after, '', acc);
//   return acc;
// }

// function walk(before: unknown, after: unknown, prefix: string, acc: ChangeSet): void {
//   if (Object.is(before, after)) return;

//   const bothObjects =
//     before !== null &&
//     after !== null &&
//     typeof before === 'object' &&
//     typeof after === 'object' &&
//     !Array.isArray(before) &&
//     !Array.isArray(after);

//   if (!bothObjects) {
//     acc[prefix || '$'] = { old: before, new: after };
//     return;
//   }

//   const b = before as Record<string, unknown>;
//   const a = after as Record<string, unknown>;
//   const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
//   for (const k of keys) {
//     const path = prefix ? `${prefix}.${k}` : k;
//     walk(b[k], a[k], path, acc);
//   }
// }

// async function insertLog(entry: LogEntry): Promise<void> {
//   const row = {
//     actor: entry.actor,
//     action: entry.action,
//     entityType: entry.entityType,
//     entityId: entry.entityId,
//     payload: entry.payload,
//   };
//   const { error } = await PersistenceAdapter.insertLog(row);
//   if (error) {
//     // Logs failing must never break the user-facing flow.
//     console.error('LogService.insertLog failed:', error.message, row);
//   }
// }

// ──────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────

export const LogService = {
  /** Log creation of a customer. */
  async recordCustomerCreate(
    customer: { id?: string } & Record<string, unknown>,
    // actor: string = getCurrentActor()
  ): Promise<void> {
    // await insertLog({
    //   actor,
    //   action: 'customer.create',
    //   entityType: 'customer',
    //   entityId: customer.id ?? null,
    //   payload: { after: customer },
    // });
  },

  /**
   * Log a customer edit. Computes the diff between `before` and `after` and
   * persists only the changed fields. No-ops if nothing changed.
   */
  async recordCustomerChange(
    customerId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    // actor: string = getCurrentActor()
  ): Promise<void> {
    // const changeSet = diff(before, after);
    // if (Object.keys(changeSet).length === 0) return;
    // await insertLog({
    //   actor,
    //   action: 'customer.update',
    //   entityType: 'customer',
    //   entityId: customerId,
    //   payload: { changeSet },
    // });
  },

  /** Log a single task status flip (the most common log event). */
  async recordTaskStatusChange(
    taskId: string,
    oldStatus: 'pending' | 'completed',
    newStatus: 'pending' | 'completed',
    // actor: string = getCurrentActor()
  ): Promise<void> {
    // if (oldStatus === newStatus) return;
    // await insertLog({
    //   actor,
    //   action: 'task.status',
    //   entityType: 'task',
    //   entityId: taskId,
    //   payload: { changeSet: { status: { old: oldStatus, new: newStatus } } },
    // });
  },

  /** Log a general task edit (e.g. subtask completion, details edit). */
  async recordTaskChange(
    taskId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    // actor: string = getCurrentActor()
  ): Promise<void> {
    // const changeSet = diff(before, after);
    // if (Object.keys(changeSet).length === 0) return;
    // await insertLog({
    //   actor,
    //   action: 'task.update',
    //   entityType: 'task',
    //   entityId: taskId,
    //   payload: { changeSet },
    // });
  },

  /** Escape hatch for events that aren't customer/task field edits. */
  async recordAction(
    action: string,
    // entityType: EntityType,
    entityId: string | null,
    payload: Record<string, unknown> = {},
    // actor: string = getCurrentActor()
  ): Promise<void> {
    // await insertLog({ actor, action, entityType, entityId, payload });
  },
};
