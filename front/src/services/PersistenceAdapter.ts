// src/services/PersistenceAdapter.ts
//
// Actual live schema (normalized, multi-table):
//   customers      – flat columns: full_name, identity_id, phone_number, address, email, is_active, comments
//   business_details   – 1:1 with customers via customer_id PK
//   income_tax_cases   – 1:1 (optional) via customer_id PK
//   vat_cases          – 1:1 (optional) via customer_id PK
//   insurance_cases    – 1:1 (optional) via customer_id PK
//   payment_details    – 1:1 via customer_id PK
//   parent_tasks       – 1:many via customer_id FK
//   sub_tasks          – 1:many via parent_task_id FK (now holds priority!)
//   logs               – standalone

import { supabase } from '../supabaseClient.js';
import type { Customer } from '../registries/CustomerRegistry';
import { authService } from './authService.js';

// ──────────────────────────────────────────────────────────────────
// Persisted shapes
// ──────────────────────────────────────────────────────────────────

export type SubTaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PersistedSubTask {
  id: string;
  parentTaskId: string;
  title: string;
  completed: boolean;
  comment: string | null;
  priority: SubTaskPriority;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersistedTask {
  id: string;
  clientId: string | null;        // maps to parent_tasks.customer_id
  title: string;
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
  subtaskId: string | null;
  subtaskTitle: string;
  completed: boolean;
  comment: string;
  details: Record<string, unknown>;
  parentTaskId: string | null;
  parentTitle: string;
  priority: SubTaskPriority; // ✨ תיקון אות גדולה בטייפ
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

function dbRowToCustomer(row: any): Customer {
  const bd = row.business_details;
  const it = row.income_tax_cases;
  const vat = row.vat_cases;
  const ins = row.insurance_cases;
  const pay = row.payment_details;

  return {
    id: row.id,
    createdAt: row.created_at,
    isActive: row.is_active,
    comments: row.comments || '',

    customerDetails: {
      fullName: row.full_name || '',
      identityId: row.identity_id || '',
      phoneNumber: row.phone_number || '',
      address: row.address || '',
      email: row.email || '',
    },
    businessDetails: {
      businessName: bd?.business_name || '',
      businessID: bd?.business_id || '',
      businessType: (bd?.business_type || '') as any,
      openingDate: bd?.opening_date || '',
      occupation: bd?.occupation || '',
      businessDescription: bd?.business_description || '',
      employsWorkers: (bd?.employs_workers || 'no') as any,
      deductionsId: bd?.deductions_id || '',
    },
    insuranceDetails: {
      insurancePrepayment: ins?.insurance_prepayment || '',
      workHours: ins?.work_hours || '',
      newInsuranceCase: ins?.is_new_case ?? true,
      insuranceId: '',
      insuranceStatus: '',
    },
    incomeTaxDetails: {
      repType: (it?.rep_type || 'ראשי') as any,
      incomeTaxPrepayment: it?.income_tax_prepayment || '',
      annualTurnover: it?.annual_turnover || '',
      newItCase: it?.is_new_case ?? true,
    },
    vatDetails: {
      newVatCase: vat?.is_new_case ?? true,
    },
    paymentDetails: {
      setupFee: String(pay?.setup_fee ?? 0),
      monthlyFee: String(pay?.monthly_fee ?? 0),
      directDebit: pay?.direct_debit ?? false,
    },

    isInsuranceActive: !!ins,
    isIncomeTaxActive: !!it,
    isVatActive: !!vat,
    needsDeductionsFile: bd?.needs_deductions_file ?? false,
  };
}

function mapTaskRow(t: any): PersistedTask {
  return {
    id: t.id,
    clientId: t.customer_id, 
    title: t.title,
    status: t.status,
    createdAt: t.created_at,
    // ✨ תיקון: שליפת ה-priority ישירות מתוך שורת תת המשימה הספציפית ב-DB
    subTasks: (t.sub_tasks ?? []).map((s: any) => ({
      id: s.id,
      parentTaskId: t.id,
      title: s.title,
      completed: !!s.is_completed,
      comment: s.comment ?? null,
      priority: (s.priority || 'medium') as SubTaskPriority, 
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    })),
  };
}

const FULL_CUSTOMER_SELECT =
  '*, business_details(*), income_tax_cases(*), vat_cases(*), insurance_cases(*), payment_details(*), parent_tasks(*, sub_tasks(*))';

// ──────────────────────────────────────────────────────────────────
// Public adapter
// ──────────────────────────────────────────────────────────────────

export const PersistenceAdapter = {

  // ── Customers (read) ──

  async fetchAllCustomers(): Promise<DbResult<Customer[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select('*, business_details(*), income_tax_cases(*), vat_cases(*), insurance_cases(*), payment_details(*)')
      .order('created_at', { ascending: false });
    return {
      data: data ? data.map(dbRowToCustomer) : null,
      error,
    };
  },

  async fetchAllCustomersWithTasks(): Promise<DbResult<CustomerWithTasks[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select(FULL_CUSTOMER_SELECT)
      .order('created_at', { ascending: false });

    if (!data) return { data: null, error };

    return {
      data: data.map((row: any) => ({
        ...dbRowToCustomer(row),
        tasks: (row.parent_tasks ?? []).map(mapTaskRow),
      })),
      error,
    };
  },

  async fetchCustomerWithTasks(id: string): Promise<DbResult<CustomerWithTasks>> {
    const { data, error } = await supabase
      .from('customers')
      .select(FULL_CUSTOMER_SELECT)
      .eq('id', id)
      .single();

    if (!data) return { data: null, error };

    return {
      data: {
        ...dbRowToCustomer(data),
        tasks: (data.parent_tasks ?? [])
          .map(mapTaskRow)
          .sort((a: any, b: any) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
      },
      error,
    };
  },

  // ── Customers (write) ──

  async insertCustomer(c: Partial<Customer>): Promise<DbResult<Customer>> {
    const { data: inserted, error: custErr } = await supabase
      .from('customers')
      .insert({
        full_name: c.customerDetails?.fullName ?? '',
        identity_id: c.customerDetails?.identityId ?? '',
        phone_number: c.customerDetails?.phoneNumber ?? '',
        address: c.customerDetails?.address ?? '',
        email: c.customerDetails?.email ?? '',
        is_active: c.isActive ?? true,
        comments: c.comments ?? '',
      })
      .select('id')
      .single();

    if (custErr) return { data: null, error: custErr };
    const id = inserted.id;

    const errs = await PersistenceAdapter._writeDetailTables(id, c, false);
    if (errs) return { data: null, error: { message: errs } };

    return { data: { id } as unknown as Customer, error: null };
  },

  async updateCustomer(id: string, c: Partial<Customer>): Promise<DbResult<Customer>> {
    const flatRow: Record<string, unknown> = {};
    if (c.customerDetails) {
      flatRow.full_name = c.customerDetails.fullName;
      flatRow.identity_id = c.customerDetails.identityId;
      flatRow.phone_number = c.customerDetails.phoneNumber;
      flatRow.address = c.customerDetails.address;
      flatRow.email = c.customerDetails.email;
    }
    if (c.isActive !== undefined) flatRow.is_active = c.isActive;
    if (c.comments !== undefined) flatRow.comments = c.comments;

    if (Object.keys(flatRow).length > 0) {
      const { error } = await supabase.from('customers').update(flatRow).eq('id', id);
      if (error) return { data: null, error };
    }

    const errs = await PersistenceAdapter._writeDetailTables(id, c, true);
    if (errs) return { data: null, error: { message: errs } };

    return { data: { id } as unknown as Customer, error: null };
  },

  async deleteCustomer(id: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    return { data: null, error };
  },

  async _writeDetailTables(customerId: string, c: Partial<Customer>, isEdit: boolean): Promise<string | null> {
    const ops: any[] = [];

    if (c.businessDetails) {
      ops.push(supabase.from('business_details').upsert({
        customer_id: customerId,
        business_name: c.businessDetails.businessName,
        business_id: c.businessDetails.businessID,
        business_type: c.businessDetails.businessType,
        opening_date: c.businessDetails.openingDate || null,
        occupation: c.businessDetails.occupation,
        business_description: c.businessDetails.businessDescription,
        employs_workers: c.businessDetails.employsWorkers,
        needs_deductions_file: c.needsDeductionsFile ?? false,
        deductions_id: c.businessDetails.deductionsId,
      }));
    }

    if (c.isIncomeTaxActive === true && c.incomeTaxDetails) {
      ops.push(supabase.from('income_tax_cases').upsert({
        customer_id: customerId,
        rep_type: c.incomeTaxDetails.repType,
        income_tax_prepayment: c.incomeTaxDetails.incomeTaxPrepayment,
        annual_turnover: c.incomeTaxDetails.annualTurnover,
        is_new_case: c.incomeTaxDetails.newItCase,
      }));
    } else if (c.isIncomeTaxActive === false && isEdit) {
      ops.push(supabase.from('income_tax_cases').delete().eq('customer_id', customerId));
    }

    if (c.isVatActive === true && c.vatDetails) {
      ops.push(supabase.from('vat_cases').upsert({
        customer_id: customerId,
        is_new_case: c.vatDetails.newVatCase,
      }));
    } else if (c.isVatActive === false && isEdit) {
      ops.push(supabase.from('vat_cases').delete().eq('customer_id', customerId));
    }

    if (c.isInsuranceActive === true && c.insuranceDetails) {
      ops.push(supabase.from('insurance_cases').upsert({
        customer_id: customerId,
        insurance_prepayment: c.insuranceDetails.insurancePrepayment || 0,
        work_hours: c.insuranceDetails.workHours || 0,
        is_new_case: c.insuranceDetails.newInsuranceCase ?? true,
      }));
    } else if (c.isInsuranceActive === false && isEdit) {
      ops.push(supabase.from('insurance_cases').delete().eq('customer_id', customerId));
    }

    if (c.paymentDetails) {
      ops.push(supabase.from('payment_details').upsert({
        customer_id: customerId,
        setup_fee: Number(c.paymentDetails.setupFee) || 0,
        monthly_fee: Number(c.paymentDetails.monthlyFee) || 0,
        direct_debit: c.paymentDetails.directDebit,
      }));
    }

    if (ops.length === 0) return null;

    const results = await Promise.all(ops as Promise<{ error: any }>[]);
    const firstError = results.find((r: any) => r.error)?.error;
    return firstError ? firstError.message : null;
  },

  // ── Tasks ──

  async fetchTasksForCustomer(clientId: string): Promise<DbResult<PersistedTask[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
      .select('*, sub_tasks(*)')
      .eq('customer_id', clientId)
      .order('created_at', { ascending: true });

    return {
      data: data ? data.map(mapTaskRow) : null,
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
          ...mapTaskRow(rawTask),
          customerId: customer?.id ?? rawTask.customer_id,
          customerName: customer?.full_name ?? 'משימה משרדית',
        };
      }),
      error,
    };
  },

  async fetchAllSubtasksView(): Promise<DbResult<PersistedSubtaskRow[]>> {
    const { data, error } = await supabase
      .from('sub_tasks')
      .select('*, parent_tasks(id, title, status, customer_id, customers(id, full_name))')
      .order('created_at', { ascending: false });

    if (error) return { data: null, error };
    if (!data) return { data: [], error: null };

    const rows: PersistedSubtaskRow[] = data.map((item: any) => {
      const parent = item.parent_tasks;
      const customer = parent?.customers;
      return {
        taskId: parent?.id || '',
        subtaskId: item.id,
        subtaskTitle: item.title,
        completed: !!item.is_completed,
        comment: item.comment || '',
        details: {},
        parentTaskId: parent?.id || null,
        parentTitle: parent?.title || '',
        priority: (item.priority || 'medium') as SubTaskPriority, // ✨ שלוף מתוך תת-המשימה
        taskStatus: (parent?.status || 'pending') as 'pending' | 'completed',
        clientId: parent?.customer_id || null,
        customerName: customer?.full_name || 'משימה משרדית',
      };
    });

    return { data: rows, error: null };
  },

  async insertTasks(tasks: Partial<PersistedTask>[]): Promise<DbResult<null>> {
    if (tasks.length === 0) return { data: null, error: null };

    for (const t of tasks) {
      const { data: parent, error: pErr } = await supabase
        .from('parent_tasks')
        .insert({
          customer_id: t.clientId,
          title: t.title,
          status: t.status || 'pending',
        })
        .select('id')
        .single();

      if (pErr) return { data: null, error: pErr };

      if (t.subTasks && t.subTasks.length > 0) {
        const subRows = t.subTasks.map((s) => ({
          parent_task_id: parent.id,
          title: s.title,
          is_completed: s.completed || false,
          comment: s.comment || '',
          priority: s.priority || 'medium'
        }));
        const { error: sErr } = await supabase.from('sub_tasks').insert(subRows);
        if (sErr) return { data: null, error: sErr };
      }
    }
    return { data: null, error: null };
  },

  async insertSingleTask(taskData: {
    title: string;
    clientId: string | null;
    subTasks: { title: string }[];
  }) {
    try {
      const { data: parent, error: parentErr } = await supabase
        .from('parent_tasks')
        .insert({
          title: taskData.title,
          customer_id: taskData.clientId,   
          status: 'pending',
        })
        .select('id')
        .single();

      if (parentErr) throw parentErr;

      if (taskData.subTasks?.length > 0) {
        const subtasksRows = taskData.subTasks.map((sub) => ({
          parent_task_id: parent.id,
          title: sub.title,
          is_completed: false,
          comment: '',
          priority: 'medium'
        }));
        const { error: subErr } = await supabase.from('sub_tasks').insert(subtasksRows);
        if (subErr) throw subErr;
      }

      return { success: true, error: null };
    } catch (err: any) {
      console.error('Error in insertSingleTask:', err);
      return { success: false, error: err };
    }
  },

  async deletePendingTasksForCustomer(clientId: string): Promise<DbResult<null>> {
    const { error } = await supabase
      .from('parent_tasks')
      .delete()
      .eq('customer_id', clientId)
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
    // ✨ חסימת אב המשימה במידה והוא מכיל תת-משימה של אישור ניהול סופי
    if (status === 'completed') {
      const { data: subTasks } = await supabase
        .from('sub_tasks')
        .select('title')
        .eq('parent_task_id', taskId);

      const hasFinalApproval = subTasks?.some(sub => sub.title?.toLowerCase().includes("אישור ניהול סופי"));

      if (hasFinalApproval && !authService.canApproveFinal("אישור ניהול סופי")) {
        const errorMsg = "לא ניתן לסמן משימה זו כבוצע כיוון שהיא מכילה את 'אישור ניהול סופי' שטרם אושר!";
        alert(errorMsg);
        return { data: null, error: { message: errorMsg } as any };
      }
    }

    const { error } = await supabase.from('parent_tasks').update({ status }).eq('id', taskId);
    return { data: null, error };
  },

  // ✨ סעיף 2 + 6: מימוש פונקציית עדכון הסטטוס הגורפת עם חסימת הרשאות קשיחה ליוחנן ושמוליק
  async updateSubtasksStatusByParent(customerId: string, parentTaskId: string, completed: boolean): Promise<DbResult<null>> {
    
    if (completed) {
      // 1. נבדוק קודם כל האם בין כל תתי-המשימות של האב הזה יש תת-משימה של "אישור ניהול סופי"
      const { data: subTasks } = await supabase
        .from('sub_tasks')
        .select('title')
        .eq('parent_task_id', parentTaskId);

      if (subTasks) {
        // אם נמצאה לפחות תת-משימה אחת שהיא אישור ניהול סופי והיוזר הוא יוחנן/שמוליק - נחסום את כל הפעולה הגורפת!
        const hasFinalApproval = subTasks.some(sub => sub.title?.includes("אישור ניהול סופי"));
        
        if (hasFinalApproval && !authService.canApproveFinal("אישור ניהול סופי")) {
          const errorMsg = "הפעולה נחסמה: התיק מכיל 'אישור ניהול סופי' ואין לך הרשאה לאשר אותו!";
          alert(errorMsg);
          return { data: null, error: { message: errorMsg } as any };
        }
      }
    }

    // 2. רק אם הכל תקין והמשתמש מורשה (או שאין שם אישור סופי) - נבצע את העדכון ב-DB
    const { error } = await supabase
      .from('sub_tasks')
      .update({ 
        is_completed: completed, 
        updated_at: new Date().toISOString(),
        updated_by: authService.getCurrentUser() // שיוך הפעולה ליוזר המחובר (מוישי/יוחנן/שמוליק)
      })
      .eq('parent_task_id', parentTaskId);

    return { data: null, error };
  },

  // ✨ סעיף 1: שינוי דחיפות ברמת תת המשימה בטבלה sub_tasks
  async updateSubtaskPriority(subTaskId: string, priority: SubTaskPriority): Promise<DbResult<null>> {
    const { error } = await supabase.from('sub_tasks').update({ priority }).eq('id', subTaskId);
    return { data: null, error };
  },

  async updateTaskSubtasks(taskId: string, subTasks: PersistedSubTask[]): Promise<DbResult<null>> {
    if (subTasks.length === 0) return { data: null, error: null };

    const rows = subTasks.map((s) => ({
      id: s.id || undefined,
      parent_task_id: taskId,
      title: s.title,
      is_completed: s.completed,
      comment: s.comment,
      priority: s.priority || 'medium'
    }));

    const { error } = await supabase.from('sub_tasks').upsert(rows);
    return { data: null, error };
  },

async updateSubtaskStatus(
    _taskId: string,
    subtaskId: string,
    completed: boolean
  ): Promise<DbResult<null>> {
    // הפונקציה פשוטה, חדה ומניחה ש-subtaskId תמיד קיים ותקין (כי ה-UI מגן עליה)
    if (completed) {
      const { data: subtask } = await supabase
        .from('sub_tasks')
        .select('title')
        .eq('id', subtaskId)
        .single(); // חוזר ל-single בטוח כי המזהה חובה

      if (subtask && !authService.canApproveFinal(subtask.title)) {
        const errorMsg = "אין לך הרשאה לשנות את הסטטוס של אישור ניהול סופי!";
        alert(errorMsg);
        return { data: null, error: { message: errorMsg } as any };
      }
    }

    const { error } = await supabase
      .from('sub_tasks')
      .update({ 
        is_completed: completed, 
        updated_at: new Date().toISOString(),
        updated_by: authService.getCurrentUser() 
      })
      .eq('id', subtaskId);

    return { data: null, error };
  },
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

  async updateTaskTitle(taskId: string, title: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('parent_tasks').update({ title: title.trim() }).eq('id', taskId);
    return { data: null, error };
  },

async updateSubtask(subtaskId: string, _parentTaskId: string, updates: { title: string; priority: string; comment: string }) {
    try {
      // ✨ מניעת עריכה או עקיפה של אישור ניהול סופי מתוך חלון העריכה
      if (updates.title.toLowerCase().includes("אישור ניהול סופי") && !authService.canApproveFinal(updates.title)) {
        const errorMsg = "אין לך הרשאה לערוך או לשנות את אישור ניהול סופי!";
        alert(errorMsg);
        return { success: false, error: { message: errorMsg } };
      }

      const { error: subErr } = await supabase
        .from('sub_tasks')
        .update({ 
          priority: updates.priority, 
          title: updates.title.trim(), 
          comment: updates.comment.trim(), 
          updated_at: new Date().toISOString(),
          updated_by: authService.getCurrentUser() 
        })
        .eq('id', subtaskId);
      if (subErr) throw subErr;

      return { success: true, error: null };
    } catch (err: any) {
      console.error('Adapter transactional failure:', err);
      return { success: false, error: err };
    }
  },

  async updateTask(taskId: string, patch: Partial<PersistedTask>): Promise<DbResult<null>> {
    const row: Record<string, any> = {};
    if (patch.title) row.title = patch.title;
    if (patch.status) row.status = patch.status;
    if (patch.clientId) row.customer_id = patch.clientId;

    const { error } = await supabase.from('parent_tasks').update(row).eq('id', taskId);
    return { data: null, error };
  },

  // ── Logs ──

  async insertLog(row: Record<string, unknown>): Promise<DbResult<null>> {
    const dbRow = {
      actor: typeof row.actor === 'string' && row.actor ? row.actor : 'unknown',
      action: typeof row.action === 'string' && row.action ? row.action : 'unknown',
      entity_type: typeof row.entityType === 'string' && row.entityType ? row.entityType : 'system',
      entity_id: isUuid(row.entityId) ? row.entityId : null,
      payload: (row.payload && typeof row.payload === 'object') ? row.payload : {},
    };
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
      data: data.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        actor: r.actor,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        payload: r.payload,
      })),
      error,
    };
  },
};