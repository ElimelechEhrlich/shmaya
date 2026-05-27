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

export type TaskPriority = 'low' | 'medium' | 'high';

export interface PersistedSubTask {
  id: string;
  parentTaskId: string;
  title: string;
  completed: boolean;
  comment: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersistedTask {
  id: string;
  clientId: string | null;          // NULL = office-wide task
  title: string;
  priority: TaskPriority;
  status: 'pending' | 'completed';
  createdAt?: string;
  subTasks?: PersistedSubTask[];
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
  details: Record<string, unknown>;  // נשמר למניעת שבירת קומפוננטות ישנות
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
  // — pure shape mappers —
  toDbCustomer(c: Partial<Customer>): Record<string, unknown> {
    return renameKeys(c, CUSTOMER_TO_DB) as Record<string, unknown>;
  },
  fromDbCustomer(row: Record<string, unknown>): Customer {
    return renameKeys(row, CUSTOMER_FROM_DB) as unknown as Customer;
  },
  fromDbLog(row: Record<string, unknown>): Record<string, unknown> {
    return renameKeys(row, LOG_FROM_DB);
  },

  // ── Customers ──
  async fetchAllCustomers(): Promise<DbResult<Customer[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    return {
      data: data ? data.map((r) => PersistenceAdapter.fromDbCustomer(r)) : null,
      error,
    };
  },

  async fetchAllCustomersWithTasks(): Promise<DbResult<CustomerWithTasks[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, parent_tasks(*, sub_tasks(*))')
      .order('created_at', { ascending: false });
    
    if (!data) return { data: null, error };
    
    return {
      data: data.map((row: any) => {
        const { parent_tasks: rawTasks, ...rawCust } = row;
        return {
          ...PersistenceAdapter.fromDbCustomer(rawCust),
          tasks: (rawTasks ?? []).map((t: any) => ({
            id: t.id,
            clientId: t.client_id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            createdAt: t.created_at,
            subTasks: (t.sub_tasks ?? []).map((s: any) => ({
              id: s.id,
              parentTaskId: s.parent_task_id,
              title: s.title,
              completed: s.is_completed,
              comment: s.comment
            }))
          })),
        };
      }),
      error,
    };
  },

  async fetchCustomerWithTasks(id: string): Promise<DbResult<CustomerWithTasks>> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, parent_tasks(*, sub_tasks(*))')
      .eq('id', id)
      .single();
      
    if (!data) return { data: null, error };
    const { parent_tasks: rawTasks, ...rawCustomer } = data as any;
    
    return {
      data: {
        ...PersistenceAdapter.fromDbCustomer(rawCustomer),
        tasks: (rawTasks ?? [])
          .map((t: any) => ({
            id: t.id,
            clientId: t.client_id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            createdAt: t.created_at,
            subTasks: (t.sub_tasks ?? []).map((s: any) => ({
              id: s.id,
              parentTaskId: s.parent_task_id,
              title: s.title,
              completed: s.is_completed,
              comment: s.comment
            }))
          }))
          .sort((a: any, b: any) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
      },
      error,
    };
  },

  async insertCustomer(c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase.from('customers').insert([row]).select().single();
    return { data: data ? PersistenceAdapter.fromDbCustomer(data) : null, error };
  },

  async updateCustomer(id: string, c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row = PersistenceAdapter.toDbCustomer(stripImmutableCustomer(c));
    const { data, error } = await supabase
      .from('customers').update(row).eq('id', id).select().single();
    return { data: data ? PersistenceAdapter.fromDbCustomer(data) : null, error };
  },

  /** Hard-delete a customer (All related sub-tables and tasks drop automatically due to CASCADE) */
  async deleteCustomer(id: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    return { data: null, error };
  },

  // ── Tasks ──
  async fetchTasksForCustomer(clientId: string): Promise<DbResult<PersistedTask[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
      .select('*, sub_tasks(*)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
      
    return {
      data: data ? data.map((t: any) => ({
        id: t.id,
        clientId: t.client_id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        createdAt: t.created_at,
        subTasks: (t.sub_tasks ?? []).map((s: any) => ({
          id: s.id,
          parentTaskId: s.parent_task_id,
          title: s.title,
          completed: s.is_completed,
          comment: s.comment
        }))
      })) : null,
      error,
    };
  },

  async fetchAllTasksWithCustomer(): Promise<DbResult<PersistedTaskWithCustomer[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
      .select('*, customers(id, full_name)')
      .order('created_at', { ascending: false });
      
    if (!data) return { data: null, error };
    return {
      data: data.map((row: any) => {
        const { customers: customer, ...rawTask } = row;
        return {
          id: rawTask.id,
          clientId: rawTask.client_id,
          title: rawTask.title,
          priority: rawTask.priority,
          status: rawTask.status,
          createdAt: rawTask.created_at,
          customerId: customer?.id ?? rawTask.client_id,
          customerName: customer?.full_name ?? 'משימה משרדית',
        };
      }),
      error,
    };
  },

  /**
   * Flattens parent_tasks × sub_tasks into a single view list for the central table.
   */
  async fetchAllSubtasksView(): Promise<DbResult<PersistedSubtaskRow[]>> {
    const { data, error } = await supabase
      .from('sub_tasks')
      .select(`
        id,
        title,
        is_completed,
        comment,
        parent_tasks (
          id,
          title,
          priority,
          status,
          client_id,
          customers (
            id,
            full_name
          )
        )
      `)
      .order('created_at', { foreignTable: 'parent_tasks', ascending: false });

    if (error) return { data: null, error };
    if (!data) return { data: [], error: null };

    const rows: PersistedSubtaskRow[] = data.map((item: any) => {
      const parent = item.parent_tasks;
      return {
        taskId: parent?.id || '',
        subtaskId: item.id,
        subtaskTitle: item.title,
        completed: !!item.is_completed,
        comment: item.comment || '',
        details: {}, 
        parentTaskId: parent?.id || null,
        parentTitle: parent?.title || '',
        priority: (parent?.priority || 'medium') as TaskPriority,
        taskStatus: (parent?.status || 'pending') as 'pending' | 'completed',
        clientId: parent?.client_id || null,
        customerName: parent?.customers?.full_name || 'משימה משרדית'
      };
    });

    return { data: rows, error: null };
  },

  /** Bulk implementation for automated services */
  async insertTasks(tasks: Partial<PersistedTask>[]): Promise<DbResult<null>> {
    if (tasks.length === 0) return { data: null, error: null };
    
    for (const t of tasks) {
      const { data: parent, error: pErr } = await supabase
        .from('parent_tasks')
        .insert({
          client_id: t.clientId,
          title: t.title,
          priority: t.priority || 'medium',
          status: t.status || 'pending'
        })
        .select('id')
        .single();
        
      if (pErr) return { data: null, error: pErr };

      if (t.subTasks && t.subTasks.length > 0) {
        const subRows = t.subTasks.map((s) => ({
          parent_task_id: parent.id,
          title: s.title,
          is_completed: s.completed || false,
          comment: s.comment || ''
        }));
        const { error: sErr } = await supabase.from('sub_tasks').insert(subRows);
        if (sErr) return { data: null, error: sErr };
      }
    }
    return { data: null, error: null };
  },

  /** Insert a single task — fully strict, strongly-typed. */
  async insertSingleTask(taskData: { 
    title: string; 
    clientId: string | null; 
    priority: TaskPriority; 
    subTasks: { title: string }[] 
  }) {
    try {
      const { data: parent, error: parentErr } = await supabase
        .from('parent_tasks')
        .insert({
          title: taskData.title,
          client_id: taskData.clientId,
          priority: taskData.priority,
          status: 'pending'
        })
        .select('id')
        .single();

      if (parentErr) throw parentErr;

      if (taskData.subTasks && taskData.subTasks.length > 0) {
        const subtasksRows = taskData.subTasks.map(sub => ({
          parent_task_id: parent.id,
          title: sub.title,
          is_completed: false,
          comment: ''
        }));

        const { error: subErr } = await supabase.from('sub_tasks').insert(subtasksRows);
        if (subErr) throw subErr;
      }

      return { success: true, error: null };
    } catch (err: any) {
      console.error("Error in insertSingleTask:", err);
      return { success: false, error: err };
    }
  },

  async deletePendingTasksForCustomer(clientId: string): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('parent_tasks')
      .delete()
      .eq('client_id', clientId)
      .eq('status', 'pending');
    return { data: null, error };
  },

  async deleteTasksByIds(ids: string[]): Promise<DbResult<null>> {
    if (ids.length === 0) return { data: null, error: null };
    const { error } = await supabase.from('parent_tasks').delete().in('id', ids);
    return { data: null, error };
  },

  async deleteTask(id: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('parent_tasks').delete().eq('id', id);
    return { data: null, error };
  },

  async updateTaskStatus(taskId: string, status: 'pending' | 'completed'): Promise<DbResult<null>> {
    const { error } = await supabase.from('parent_tasks').update({ status }).eq('id', taskId);
    return { data: null, error };
  },

  async updateTaskPriority(taskId: string, priority: TaskPriority): Promise<DbResult<null>> {
    const { error } = await supabase.from('parent_tasks').update({ priority }).eq('id', taskId);
    return { data: null, error };
  },

  /** Replaces old JSONB multi-update flow with structural upserts */
  async updateTaskSubtasks(
    taskId: string,
    subTasks: PersistedSubTask[]
  ): Promise<DbResult<null>> {
    if (subTasks.length === 0) return { data: null, error: null };
    
    const rows = subTasks.map(s => ({
      id: s.id || undefined,
      parent_task_id: taskId,
      title: s.title,
      is_completed: s.completed,
      comment: s.comment
    }));
    
    const { error } = await supabase.from('sub_tasks').upsert(rows);
    return { data: null, error };
  },

  /** Toggles a structural subtask row status directly */
  async updateSubtaskStatus(
    _taskId: string, // Keep parameter signature for backward compatibility
    subtaskId: string,
    completed: boolean
  ): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('sub_tasks')
      .update({ is_completed: completed, updated_at: new Date().toISOString() })
      .eq('id', subtaskId);
    return { data: null, error };
  },

  /** Update a single subtask's title from inline editor */
  async updateSubtaskTitle(
    _taskId: string,
    subtaskId: string,
    title: string
  ): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('sub_tasks')
      .update({ title: title.trim(), updated_at: new Date().toISOString() })
      .eq('id', subtaskId);
    return { data: null, error };
  },

  /** Update an item's title in parent_tasks */
  async updateTaskTitle(taskId: string, title: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('parent_tasks').update({ title: title.trim() }).eq('id', taskId);
    return { data: null, error };
  },

  /** Combined direct transactional subtask + priority editor */
  async updateSubtask(subtaskId: string, parentTaskId: string, updates: { title: string; priority: string; comment: string }) {
    try {
      const { error: subErr } = await supabase
        .from('sub_tasks')
        .update({ title: updates.title.trim(), comment: updates.comment.trim(), updated_at: new Date().toISOString() })
        .eq('id', subtaskId);

      if (subErr) throw subErr;

      const { error: parentErr } = await supabase
        .from('parent_tasks')
        .update({ priority: updates.priority })
        .eq('id', parentTaskId);

      if (parentErr) throw parentErr;

      return { success: true, error: null };
    } catch (err: any) {
      console.error("Adapter transactional failure:", err);
      return { success: false, error: err };
    }
  },

  async updateTask(taskId: string, patch: Partial<PersistedTask>): Promise<DbResult<null>> {
    const row: Record<string, any> = {};
    if (patch.title) row.title = patch.title;
    if (patch.priority) row.priority = patch.priority;
    if (patch.status) row.status = patch.status;
    if (patch.clientId) row.client_id = patch.clientId;

    const { error } = await supabase.from('parent_tasks').update(row).eq('id', taskId);
    return { data: null, error };
  },

  // ── Logs ──
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