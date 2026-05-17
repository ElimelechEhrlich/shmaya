// src/services/PersistenceAdapter.ts
//
// THE only module that knows about snake_case DB column names (`client_id`,
// `parent_task_id`, `created_at`, `entity_type`, `entity_id`, `is_active`).
// Every component, hook, or service that touches Supabase MUST go through
// this adapter — direct `supabase.from(...)` calls outside this file are bugs.
//
// Reads return camelCase Customer/Task objects. Writes accept camelCase and
// translate back to the DB schema.

import { supabase } from '../supabaseClient.js';
import { type Customer } from '../registries/CustomerRegistry';

// ──────────────────────────────────────────────────────────────────
// Field maps
// ──────────────────────────────────────────────────────────────────

const CUSTOMER_TO_DB: Record<string, string> = {
  createdAt: 'created_at',
  isActive: 'is_active',
};
const CUSTOMER_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(CUSTOMER_TO_DB).map(([k, v]) => [v, k])
);

const TASK_TO_DB: Record<string, string> = {
  clientId: 'client_id',
  parentTaskId: 'parent_task_id',
  // `priority` is the same in both worlds — listed for documentation only.
  priority: 'priority',
  // tasks.createdAt is camelCase in the live schema (unlike clients.created_at
  // and logs.created_at). No rename for createdAt — column name matches.
};
const TASK_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_TO_DB).map(([k, v]) => [v, k])
);

const LOG_TO_DB: Record<string, string> = {
  entityType: 'entity_type',
  entityId: 'entity_id',
  createdAt: 'created_at',
};
const LOG_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(LOG_TO_DB).map(([k, v]) => [v, k])
);

// ──────────────────────────────────────────────────────────────────
// Persisted shapes
// ──────────────────────────────────────────────────────────────────

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PersistedSubTask {
  id: string;
  title: string;
  completed: boolean;
  details?: Record<string, unknown>;
  comment?: string;
}

export interface PersistedTask {
  id: string;
  clientId: string | null;          // NULL = office-wide task
  parentTaskId: string | null;
  title: string;
  status: 'pending' | 'completed';
  restrictedTo: string | null;
  subTasks: PersistedSubTask[];
  priority: TaskPriority;
  createdAt?: string;
}

export interface CustomerWithTasks extends Customer {
  tasks: PersistedTask[];
}

export interface PersistedTaskWithCustomer extends PersistedTask {
  customerId: string | null;
  customerName: string;
}

export interface PersistedSubtaskRow {
  taskId: string;
  subtaskId: string | null;          // null when this row represents a parent without subtasks
  subtaskTitle: string;
  completed: boolean;
  comment: string;
  details: Record<string, unknown>;
  parentTaskId: string | null;
  parentTitle: string;
  priority: TaskPriority;
  taskStatus: 'pending' | 'completed';
  clientId: string | null;
  customerName: string;
}

export interface PersistedLog {
  id: string;
  createdAt: string;
  actor: string;
  action: string;
  entityType: 'customer' | 'task' | 'system' | string;
  entityId: string | null;
  payload: Record<string, unknown>;
}

export interface DbResult<T> {
  data: T | null;
  error: { message: string } | null;
}

// ──────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v);

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, seg) => (acc == null ? undefined : (acc as Record<string, unknown>)[seg]),
    obj
  );
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    const existing = cursor[seg];
    const next = (existing && typeof existing === 'object'
      ? { ...(existing as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    cursor[seg] = next;
    cursor = next;
  }
  cursor[segs[segs.length - 1]] = value;
}

function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const segs = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cursor[segs[i]];
    if (!next || typeof next !== 'object') return;
    cursor = next as Record<string, unknown>;
  }
  delete cursor[segs[segs.length - 1]];
}

function renameKeys<T>(input: T, map: Record<string, string>): T {
  if (input == null || typeof input !== 'object') return input;
  const out = structuredClone(input) as Record<string, unknown>;
  for (const [from, to] of Object.entries(map)) {
    if (from === to) continue;
    const value = getByPath(out, from);
    if (value !== undefined) {
      setByPath(out, to, value);
      deleteByPath(out, from);
    }
  }
  return out as T;
}

function stripImmutableCustomer<T extends Partial<Customer>>(c: T): T {
  const { id: _id, createdAt: _createdAt, tasks: _tasks, ...rest } = c as T & {
    id?: unknown; createdAt?: unknown; tasks?: unknown;
  };
  return rest as T;
}

// ──────────────────────────────────────────────────────────────────
// Public adapter
// ──────────────────────────────────────────────────────────────────

export const PersistenceAdapter = {
  // — pure shape mappers (exported for tests / edge cases) —
  toDbCustomer(c: Partial<Customer>): Record<string, unknown> {
    return renameKeys(c, CUSTOMER_TO_DB) as Record<string, unknown>;
  },
  fromDbCustomer(row: Record<string, unknown>): Customer {
    return renameKeys(row, CUSTOMER_FROM_DB) as unknown as Customer;
  },
  toDbTask(t: Partial<PersistedTask>): Record<string, unknown> {
    return renameKeys(t, TASK_TO_DB) as Record<string, unknown>;
  },
  fromDbTask(row: Record<string, unknown>): PersistedTask {
    return renameKeys(row, TASK_FROM_DB) as unknown as PersistedTask;
  },
  fromDbLog(row: Record<string, unknown>): Record<string, unknown> {
    return renameKeys(row, LOG_FROM_DB);
  },

  // ── Customers ──
  async fetchAllCustomers(): Promise<DbResult<Customer[]>> {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    return {
      data: data ? data.map((r) => PersistenceAdapter.fromDbCustomer(r)) : null,
      error,
    };
  },

  async fetchAllCustomersWithTasks(): Promise<DbResult<CustomerWithTasks[]>> {
    const { data, error } = await supabase
      .from('clients')
      .select('*, tasks(*)')
      .order('created_at', { ascending: false });
    if (!data) return { data: null, error };
    return {
      data: data.map((row) => {
        const { tasks: rawTasks, ...rawCust } = row as Record<string, unknown> & {
          tasks?: Record<string, unknown>[];
        };
        return {
          ...PersistenceAdapter.fromDbCustomer(rawCust),
          tasks: (rawTasks ?? []).map((t) => PersistenceAdapter.fromDbTask(t)),
        };
      }),
      error,
    };
  },

  async fetchCustomerWithTasks(id: string): Promise<DbResult<CustomerWithTasks>> {
    const { data, error } = await supabase
      .from('clients')
      .select('*, tasks(*)')
      .eq('id', id)
      .single();
    if (!data) return { data: null, error };
    const { tasks: rawTasks, ...rawCustomer } = data as Record<string, unknown> & {
      tasks?: Record<string, unknown>[];
    };
    return {
      data: {
        ...PersistenceAdapter.fromDbCustomer(rawCustomer),
        tasks: (rawTasks ?? [])
          .map((t) => PersistenceAdapter.fromDbTask(t))
          .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
      },
      error,
    };
  },

  async insertCustomer(c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase.from('clients').insert([row]).select().single();
    return { data: data ? PersistenceAdapter.fromDbCustomer(data) : null, error };
  },

  async updateCustomer(id: string, c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase
      .from('clients').update(row).eq('id', id).select().single();
    return { data: data ? PersistenceAdapter.fromDbCustomer(data) : null, error };
  },

  /** Hard-delete a customer and all their tasks (FK first). */
  async deleteCustomer(id: string): Promise<DbResult<null>> {
    const { error: taskErr } = await supabase.from('tasks').delete().eq('client_id', id);
    if (taskErr) return { data: null, error: taskErr };
    const { error } = await supabase.from('clients').delete().eq('id', id);
    return { data: null, error };
  },

  // ── Tasks ──
  async fetchTasksForCustomer(clientId: string): Promise<DbResult<PersistedTask[]>> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('client_id', clientId)
      .order('createdAt', { ascending: true });
    return {
      data: data ? data.map((r) => PersistenceAdapter.fromDbTask(r)) : null,
      error,
    };
  },

  async fetchAllTasksWithCustomer(): Promise<DbResult<PersistedTaskWithCustomer[]>> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(id, customerDetails)')
      .order('createdAt', { ascending: false });
    if (!data) return { data: null, error };
    return {
      data: data.map((row) => {
        const { clients: client, ...rawTask } = row as Record<string, unknown> & {
          clients?: { id: string; customerDetails?: { fullName?: string } } | null;
        };
        const task = PersistenceAdapter.fromDbTask(rawTask);
        return {
          ...task,
          customerId: client?.id ?? task.clientId,
          customerName: client?.customerDetails?.fullName ?? '',
        };
      }),
      error,
    };
  },

  /**
   * Flattens tasks × subTasks into a single list. A task with zero subtasks
   * still gets one row (parent-itself representation).
   */
  async fetchAllSubtasksView(): Promise<DbResult<PersistedSubtaskRow[]>> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(id, customerDetails)')
      .order('createdAt', { ascending: false });
    if (!data) return { data: null, error };

    const rows: PersistedSubtaskRow[] = [];
    for (const raw of data) {
      const { clients: client, ...rawTask } = raw as Record<string, unknown> & {
        clients?: { id: string; customerDetails?: { fullName?: string } } | null;
      };
      const task = PersistenceAdapter.fromDbTask(rawTask);
      const subs = task.subTasks ?? [];
      const customerName = client?.customerDetails?.fullName ?? '';
      const customerIdResolved = client?.id ?? task.clientId ?? null;

      if (subs.length === 0) {
        rows.push({
          taskId: task.id,
          subtaskId: null,
          subtaskTitle: task.title,
          completed: task.status === 'completed',
          comment: '',
          details: {},
          parentTaskId: task.parentTaskId,
          parentTitle: task.title,
          priority: task.priority ?? 'medium',
          taskStatus: task.status,
          clientId: customerIdResolved,
          customerName,
        });
        continue;
      }
      for (const sub of subs) {
        rows.push({
          taskId: task.id,
          subtaskId: sub.id,
          subtaskTitle: sub.title,
          completed: !!sub.completed,
          comment: sub.comment ?? '',
          details: sub.details ?? {},
          parentTaskId: task.parentTaskId,
          parentTitle: task.title,
          priority: task.priority ?? 'medium',
          taskStatus: task.status,
          clientId: customerIdResolved,
          customerName,
        });
      }
    }
    return { data: rows, error };
  },

  async insertTasks(tasks: Partial<PersistedTask>[]): Promise<DbResult<null>> {
    if (tasks.length === 0) return { data: null, error: null };
    const rows = tasks.map((t) => PersistenceAdapter.toDbTask(t));
    const { error } = await supabase.from('tasks').insert(rows);
    return { data: null, error };
  },

  /** Insert a single task — supports office-wide tasks via clientId === null. */
  async insertSingleTask(task: Partial<PersistedTask>): Promise<DbResult<PersistedTask>> {
    const row = PersistenceAdapter.toDbTask(task);
    const { data, error } = await supabase.from('tasks').insert([row]).select().single();
    return {
      data: data ? PersistenceAdapter.fromDbTask(data) : null,
      error,
    };
  },

  async deletePendingTasksForCustomer(clientId: string): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('client_id', clientId)
      .eq('status', 'pending');
    return { data: null, error };
  },

  async deleteTasksByIds(ids: string[]): Promise<DbResult<null>> {
    if (ids.length === 0) return { data: null, error: null };
    const { error } = await supabase.from('tasks').delete().in('id', ids);
    return { data: null, error };
  },

  async deleteTask(id: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    return { data: null, error };
  },

  async updateTaskStatus(taskId: string, status: 'pending' | 'completed'): Promise<DbResult<null>> {
    const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
    return { data: null, error };
  },

  async updateTaskPriority(taskId: string, priority: TaskPriority): Promise<DbResult<null>> {
    const { error } = await supabase.from('tasks').update({ priority }).eq('id', taskId);
    return { data: null, error };
  },

  async updateTaskSubtasks(
    taskId: string,
    subTasks: PersistedSubTask[]
  ): Promise<DbResult<null>> {
    const { error } = await supabase.from('tasks').update({ subTasks }).eq('id', taskId);
    return { data: null, error };
  },

  /** Toggle/set the completed flag of one subtask inside a task's JSONB array. */
  async updateSubtaskStatus(
    taskId: string,
    subtaskId: string,
    completed: boolean
  ): Promise<DbResult<null>> {
    // Fetch current subTasks → mutate → persist. JSONB array updates can't be
    // partial in plain Supabase JS; we read-modify-write.
    const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('subTasks')
      .eq('id', taskId)
      .single();
    if (fetchErr) return { data: null, error: fetchErr };
    const next = ((existing?.subTasks as PersistedSubTask[]) ?? []).map((s) =>
      s.id === subtaskId ? { ...s, completed } : s
    );
    const { error } = await supabase.from('tasks').update({ subTasks: next }).eq('id', taskId);
    return { data: null, error };
  },

  /** Update a single subtask's title (used by the Tasks-page inline editor). */
  async updateSubtaskTitle(
    taskId: string,
    subtaskId: string,
    title: string
  ): Promise<DbResult<null>> {
    const { data: existing, error: fetchErr } = await supabase
      .from('tasks')
      .select('subTasks')
      .eq('id', taskId)
      .single();
    if (fetchErr) return { data: null, error: fetchErr };
    const next = ((existing?.subTasks as PersistedSubTask[]) ?? []).map((s) =>
      s.id === subtaskId ? { ...s, title } : s
    );
    const { error } = await supabase.from('tasks').update({ subTasks: next }).eq('id', taskId);
    return { data: null, error };
  },

  /** Update a task's top-level title (used by Tasks-page inline editor for parent-only rows). */
  async updateTaskTitle(taskId: string, title: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('tasks').update({ title }).eq('id', taskId);
    return { data: null, error };
  },

  async updateTask(taskId: string, patch: Partial<PersistedTask>): Promise<DbResult<null>> {
    const row = PersistenceAdapter.toDbTask(patch);
    const { error } = await supabase.from('tasks').update(row).eq('id', taskId);
    return { data: null, error };
  },

  // ── Logs ──
  /**
   * Defensive writer. Normalises entity_id (must be UUID or null) and ensures
   * required text fields aren't undefined — the previous bug where logs
   * vanished traced to the `entity_id` column being typed `uuid` and
   * rejecting non-UUID strings ("system", etc.) emitted by escape-hatch
   * `recordAction` calls.
   */
  async insertLog(row: Record<string, unknown>): Promise<DbResult<null>> {
    const safe: Record<string, unknown> = {
      actor: typeof row.actor === 'string' && row.actor ? row.actor : 'unknown',
      action: typeof row.action === 'string' && row.action ? row.action : 'unknown',
      entityType: typeof row.entityType === 'string' && row.entityType ? row.entityType : 'system',
      entityId: isUuid(row.entityId) ? row.entityId : null,
      payload: (row.payload && typeof row.payload === 'object') ? row.payload : {},
    };
    const dbRow = renameKeys(safe, LOG_TO_DB);
    const { error } = await supabase.from('logs').insert([dbRow]);
    if (error) {
      // Surface insert errors loudly — silent log failures were the original
      // "logs not persisting" symptom.
      console.error('[PersistenceAdapter.insertLog] insert failed:', error.message, dbRow);
    }
    return { data: null, error };
  },

  async fetchAllLogs(limit: number = 500): Promise<DbResult<PersistedLog[]>> {
    const { data, error } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) console.error('[PersistenceAdapter.fetchAllLogs] error:', error.message);
    if (!data) return { data: null, error };
    return {
      data: data.map((r) => PersistenceAdapter.fromDbLog(r) as unknown as PersistedLog),
      error,
    };
  },
};
