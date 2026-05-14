// src/services/PersistenceAdapter.ts
//
// THE only module that knows about snake_case DB column names (`client_id`,
// `parent_task_id`, `created_at`, `entity_type`, `entity_id`).
//
// Every component, hook, or service that touches Supabase MUST go through
// this adapter — direct `supabase.from(...)` calls outside this file are
// considered bugs (see .claude/project-map.md §5: three components and one
// service still bypass the boundary and need migration).
//
// Reads return clean camelCase Customer/Task objects per CustomerRegistry.
// Writes accept the same shape and translate back to the DB schema.

import { supabase } from '../supabaseClient.js';
import { type Customer } from '../registries/CustomerRegistry';

// ──────────────────────────────────────────────────────────────────
// Field maps — the ONLY place in /src that names legacy DB columns
// ──────────────────────────────────────────────────────────────────

const CUSTOMER_TO_DB: Record<string, string> = {
  createdAt: 'created_at',
};
const CUSTOMER_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(CUSTOMER_TO_DB).map(([k, v]) => [v, k])
);

const TASK_TO_DB: Record<string, string> = {
  clientId: 'client_id',
  parentTaskId: 'parent_task_id',
  createdAt: 'created_at',
};
const TASK_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(TASK_TO_DB).map(([k, v]) => [v, k])
);

// Logs table is fully snake_case (matches the rest of the live schema).
// LogService writes camelCase keys; the rename happens in insertLog below.
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

export interface PersistedSubTask {
  id: string;
  title: string;
  completed: boolean;
  details?: Record<string, unknown>;
}

export interface PersistedTask {
  id: string;
  clientId: string;
  parentTaskId: string | null;
  title: string;
  status: 'pending' | 'completed';
  restrictedTo: string | null;
  subTasks: PersistedSubTask[];
  createdAt?: string;
}

export interface CustomerWithTasks extends Customer {
  tasks: PersistedTask[];
}

export interface DbResult<T> {
  data: T | null;
  error: { message: string } | null;
}

// ──────────────────────────────────────────────────────────────────
// Path utilities
// ──────────────────────────────────────────────────────────────────

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
    const value = getByPath(out, from);
    if (value !== undefined) {
      setByPath(out, to, value);
      deleteByPath(out, from);
    }
  }
  return out as T;
}

function stripImmutableCustomer<T extends Partial<Customer>>(c: T): T {
  // Drop fields the DB owns (id, createdAt) and the `tasks` array that
  // round-trips through edit screens after a joined fetch — writing it
  // to the clients row would corrupt the column.
  const {
    id: _id,
    createdAt: _createdAt,
    tasks: _tasks,
    ...rest
  } = c as T & {
    id?: unknown;
    createdAt?: unknown;
    tasks?: unknown;
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

  // ── Clients ──
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
        tasks: (rawTasks ?? []).map((t) => PersistenceAdapter.fromDbTask(t)),
      },
      error,
    };
  },

  async insertCustomer(c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase
      .from('clients')
      .insert([row])
      .select()
      .single();
    return {
      data: data ? PersistenceAdapter.fromDbCustomer(data) : null,
      error,
    };
  },

  async updateCustomer(id: string, c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase
      .from('clients')
      .update(row)
      .eq('id', id)
      .select()
      .single();
    return {
      data: data ? PersistenceAdapter.fromDbCustomer(data) : null,
      error,
    };
  },

  // ── Tasks ──
  async insertTasks(tasks: Partial<PersistedTask>[]): Promise<DbResult<null>> {
    if (tasks.length === 0) return { data: null, error: null };
    const rows = tasks.map((t) => PersistenceAdapter.toDbTask(t));
    const { error } = await supabase.from('tasks').insert(rows);
    return { data: null, error };
  },

  async deletePendingTasksForCustomer(clientId: string): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('client_id', clientId)
      .eq('status', 'pending');
    return { data: null, error };
  },

  async updateTaskStatus(
    taskId: string,
    status: 'pending' | 'completed'
  ): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId);
    return { data: null, error };
  },

  async updateTaskSubtasks(
    taskId: string,
    subTasks: PersistedSubTask[]
  ): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('tasks')
      .update({ subTasks })
      .eq('id', taskId);
    return { data: null, error };
  },

  async updateTask(
    taskId: string,
    patch: Partial<PersistedTask>
  ): Promise<DbResult<null>> {
    const row = PersistenceAdapter.toDbTask(patch);
    const { error } = await supabase.from('tasks').update(row).eq('id', taskId);
    return { data: null, error };
  },

  // ── Logs ──
  // LogService writes camelCase keys; LOG_TO_DB renames them to the
  // snake_case columns the live schema actually has.
  async insertLog(row: Record<string, unknown>): Promise<DbResult<null>> {
    const dbRow = renameKeys(row, LOG_TO_DB);
    const { error } = await supabase.from('logs').insert([dbRow]);
    return { data: null, error };
  },

  // Exported for future fetch paths (no consumer yet).
  fromDbLog(row: Record<string, unknown>): Record<string, unknown> {
    return renameKeys(row, LOG_FROM_DB);
  },
};
