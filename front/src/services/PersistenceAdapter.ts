// src/services/PersistenceAdapter.ts
//
// Actual live schema:
//   customers      – flat customer fields and the new direct detail columns.
//   parent_tasks   – 1:many via customer_id FK
//   sub_tasks      – 1:many via parent_task_id FK (now holds priority!)
//   logs           – standalone
// Legacy detail tables remain for the moment as a migration backup:
//   business_details   – 1:1 with customers via customer_id PK
//   income_tax_cases   – 1:1 (optional) via customer_id PK
//   vat_cases          – 1:1 (optional) via customer_id PK
//   insurance_cases    – 1:1 (optional) via customer_id PK
//   payment_details    – 1:1 via customer_id PK

import { supabase } from '../supabaseClient.js';
import type { Customer } from '../registries/CustomerRegistry';
import { authService } from './authService.js';
import { AUTO_TASKS_CONFIG } from '../constants/taskRegistry';

// ──────────────────────────────────────────────────────────────────
// Persisted shapes
// ──────────────────────────────────────────────────────────────────
export const OFFICE_CUSTOMER_ID = '00000000-0000-0000-0000-000000000000';
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
  parentTaskId: string | null;    // maps to parent_tasks.registry_key
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
const TASK_ORDER = AUTO_TASKS_CONFIG.map((t: any) => t.id);
function getDisplayName(customer: any): string {
    if (customer?.business_type === 'חברה בע"מ' && customer?.business_name) {
        return customer.business_name;
    }
    return customer?.full_name ?? 'משימה משרדית';
}

function dbRowToCustomer(row: any): Customer {
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
      businessName: row.business_name || '',
      businessID: row.business_id || '',
      businessType: (row.business_type || '') as any,
      openingDate: row.opening_date || '',
      occupation: row.occupation || '',
      businessDescription: row.business_description || '',
      employsWorkers: (row.employs_workers || 'no') as any,
      deductionsId: row.deductions_id || '',
    },
    insuranceDetails: {
      insurancePrepayment: row.insurance_prepayment || '',
      workHours: row.work_hours || '',
      newInsuranceCase: row.insurance_is_new_case ?? true,
      insuranceId: row.insurance_id || '',
      insuranceStatus: row.insurance_status || '',
    },
    incomeTaxDetails: {
      repType: (row.income_tax_rep_type || 'ראשי') as any,
      incomeTaxPrepayment: row.income_tax_prepayment || '',
      annualTurnover: row.annual_turnover || '',
      newItCase: row.income_tax_is_new_case ?? true,
    },
    vatDetails: {
      newVatCase: row.vat_is_new_case ?? true,
    },
    paymentDetails: {
      setupFee: String(row.setup_fee ?? 0),
      monthlyFee: String(row.monthly_fee ?? 0),
      directDebit: row.direct_debit ?? false,
    },

    isInsuranceActive: !!row.is_insurance_active,
    isIncomeTaxActive: !!row.is_income_tax_active,
    isVatActive: !!row.is_vat_active,
    needsDeductionsFile: row.needs_deductions_file ?? false,
  };
}

function mapTaskRow(t: any): PersistedTask {
  return {
    id: t.id,
    clientId: t.customer_id,
    parentTaskId: t.registry_key ?? t.parent_task_id ?? null,
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

const FULL_CUSTOMER_SELECT = '*, parent_tasks(*, sub_tasks(*))';

// ──────────────────────────────────────────────────────────────────
// Public adapter
// ──────────────────────────────────────────────────────────────────

export const PersistenceAdapter = {
  async insertSubtaskUnderRegistry(
    customerId: string,
    registryKey: string,
    subtaskTitle: string
): Promise<DbResult<null>> {
    const { data: parent, error: pErr } = await supabase
        .from('parent_tasks')
        .select('id')
        .eq('customer_id', customerId)
        .eq('registry_key', registryKey)
        .single();

    if (pErr || !parent) return { 
        data: null, 
        error: pErr ?? { message: 'משימת אב לא נמצאה' } 
    };

    const { error } = await supabase.from('sub_tasks').insert({
        parent_task_id: parent.id,
        title: subtaskTitle,
        is_completed: false,
        comment: '',
        priority: 'medium',
    });

    return { data: null, error };
  },

  // ── Customers (read) ──

  async fetchAllCustomers(): Promise<DbResult<Customer[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .neq('id', OFFICE_CUSTOMER_ID)
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
      .neq('id', OFFICE_CUSTOMER_ID)
      .order('created_at', { ascending: false });
    if (!data) return { data: null, error };

    return {
     data: data.map((row: any) => ({
    ...dbRowToCustomer(row),
    tasks: (row.parent_tasks ?? [])
        .map(mapTaskRow)
        .sort((a: any, b: any) => {
            const ai = TASK_ORDER.indexOf(a.parentTaskId ?? '');
            const bi = TASK_ORDER.indexOf(b.parentTaskId ?? '');
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        }),
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
    if (!data) return { data: null, error };  // ← חסר!

    return {
      data: {
        ...dbRowToCustomer(data),
      tasks: (data.parent_tasks ?? [])
       .map(mapTaskRow)
       .sort((a, b) => {
          const ai = TASK_ORDER.indexOf(a.parentTaskId ?? '');
          const bi = TASK_ORDER.indexOf(b.parentTaskId ?? '');
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }),
      },
      error,
    };
  },

  // ── Customers (write) ──

  async insertCustomer(c: Partial<Customer>): Promise<DbResult<Customer>> {
    const row: Record<string, unknown> = {
      full_name: c.customerDetails?.fullName ?? '',
      identity_id: c.customerDetails?.identityId ?? '',
      phone_number: c.customerDetails?.phoneNumber ?? '',
      address: c.customerDetails?.address ?? '',
      email: c.customerDetails?.email ?? '',
      is_active: c.isActive ?? true,
      comments: c.comments ?? '',
      business_name: c.businessDetails?.businessName ?? '',
      business_id: c.businessDetails?.businessID ?? '',
      business_type: c.businessDetails?.businessType ?? '',
      opening_date: c.businessDetails?.openingDate || null,
      occupation: c.businessDetails?.occupation ?? '',
      business_description: c.businessDetails?.businessDescription ?? '',
      employs_workers: c.businessDetails?.employsWorkers ?? 'no',
      needs_deductions_file: c.needsDeductionsFile ?? false,
      deductions_id: c.businessDetails?.deductionsId ?? '',
      income_tax_rep_type: c.incomeTaxDetails?.repType ?? null,
      income_tax_prepayment: c.incomeTaxDetails?.incomeTaxPrepayment ?? '',
      annual_turnover: c.incomeTaxDetails?.annualTurnover ?? '',
      income_tax_is_new_case: c.incomeTaxDetails?.newItCase ?? true,
      vat_is_new_case: c.vatDetails?.newVatCase ?? true,
      insurance_prepayment: c.insuranceDetails?.insurancePrepayment ?? '',
      work_hours: c.insuranceDetails?.workHours ?? '',
      insurance_is_new_case: c.insuranceDetails?.newInsuranceCase ?? true,
      insurance_id: c.insuranceDetails?.insuranceId ?? '',
      insurance_status: c.insuranceDetails?.insuranceStatus ?? '',
      setup_fee: Number(c.paymentDetails?.setupFee) || 0,
      monthly_fee: Number(c.paymentDetails?.monthlyFee) || 0,
      direct_debit: c.paymentDetails?.directDebit ?? false,
      is_income_tax_active: c.isIncomeTaxActive ?? false,
      is_vat_active: c.isVatActive ?? false,
      is_insurance_active: c.isInsuranceActive ?? false,
    };

    const { data: inserted, error } = await supabase
      .from('customers')
      .insert(row)
      .select('*')
      .single();

    if (error) return { data: null, error };
    return { data: dbRowToCustomer(inserted), error: null };
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

    if (c.businessDetails) {
      flatRow.business_name = c.businessDetails.businessName;
      flatRow.business_id = c.businessDetails.businessID;
      flatRow.business_type = c.businessDetails.businessType;
      flatRow.opening_date = c.businessDetails.openingDate || null;
      flatRow.occupation = c.businessDetails.occupation;
      flatRow.business_description = c.businessDetails.businessDescription;
      flatRow.employs_workers = c.businessDetails.employsWorkers;
      flatRow.deductions_id = c.businessDetails.deductionsId;
    }

    if (c.incomeTaxDetails) {
      flatRow.income_tax_rep_type = c.incomeTaxDetails.repType;
      flatRow.income_tax_prepayment = c.incomeTaxDetails.incomeTaxPrepayment;
      flatRow.annual_turnover = c.incomeTaxDetails.annualTurnover;
      flatRow.income_tax_is_new_case = c.incomeTaxDetails.newItCase;
    }

    if (c.vatDetails) {
      flatRow.vat_is_new_case = c.vatDetails.newVatCase;
    }

    if (c.insuranceDetails) {
      flatRow.insurance_prepayment = c.insuranceDetails.insurancePrepayment;
      flatRow.work_hours = c.insuranceDetails.workHours;
      flatRow.insurance_is_new_case = c.insuranceDetails.newInsuranceCase;
      flatRow.insurance_id = c.insuranceDetails.insuranceId;
      flatRow.insurance_status = c.insuranceDetails.insuranceStatus;
    }

    if (c.paymentDetails) {
      flatRow.setup_fee = Number(c.paymentDetails.setupFee) || 0;
      flatRow.monthly_fee = Number(c.paymentDetails.monthlyFee) || 0;
      flatRow.direct_debit = c.paymentDetails.directDebit;
    }

    if (c.isIncomeTaxActive !== undefined) flatRow.is_income_tax_active = c.isIncomeTaxActive;
    if (c.isVatActive !== undefined) flatRow.is_vat_active = c.isVatActive;
    if (c.isInsuranceActive !== undefined) flatRow.is_insurance_active = c.isInsuranceActive;
    if (c.needsDeductionsFile !== undefined) flatRow.needs_deductions_file = c.needsDeductionsFile;
    if (c.comments !== undefined) flatRow.comments = c.comments;
    if (c.isActive !== undefined) flatRow.is_active = c.isActive;

    if (Object.keys(flatRow).length === 0) {
      return { data: { id } as unknown as Customer, error: null };
    }

    const { data: updated, error } = await supabase
      .from('customers')
      .update(flatRow)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return { data: null, error };
    return { data: dbRowToCustomer(updated), error: null };
  },

  async deleteCustomer(id: string): Promise<DbResult<null>> {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    return { data: null, error };
  },

  // ── Tasks ──

  async fetchTasksForCustomer(clientId: string): Promise<DbResult<PersistedTask[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
      .select('*, sub_tasks(*)')
      .eq('customer_id', clientId)
      .order('created_at', { ascending: true });

    const mapped = data ? data.map(mapTaskRow) : null;
    if (mapped) mapped.sort((a, b) => {
      const ai = TASK_ORDER.indexOf(a.parentTaskId ?? '');
      const bi = TASK_ORDER.indexOf(b.parentTaskId ?? '');
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  return { data: mapped, error };
  },

  async fetchAllTasksWithCustomer(): Promise<DbResult<PersistedTaskWithCustomer[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
.select('*, customers(id, full_name, business_name, business_type)')
      .order('created_at', { ascending: false });

    if (!data) return { data: null, error };
    return {
      data: data.map((row: any) => {
        const { customers: customer, ...rawTask } = row;
        return {
          ...mapTaskRow(rawTask),
          customerId: customer?.id ?? rawTask.customer_id,
 customerName: getDisplayName(customer),
        };
      }),
      error,
    };
  },

  async fetchTaskById(taskId: string): Promise<DbResult<PersistedTaskWithCustomer>> {
    const { data, error } = await supabase
      .from('parent_tasks')
.select('*, customers(id, full_name, business_name, business_type), sub_tasks(*)')
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      return { data: null, error };
    }
    if (!data) {
      return { data: null, error: null };
    }
    const { customers: customer, ...rawTask } = data as any;
    return {
      data: {
        ...mapTaskRow(rawTask),
        customerId: customer?.id ?? rawTask.customer_id,
        customerName: ((customer?.id === OFFICE_CUSTOMER_ID || !customer)
          ? 'משימה משרדית'
          : getDisplayName(customer))
      },
      error: null,
    };
  },

  async fetchAllSubtasksView(): Promise<DbResult<PersistedSubtaskRow[]>> {
    const { data, error } = await supabase
      .from('sub_tasks')
     .select('*, parent_tasks(id, title, status, customer_id, customers(id, full_name, business_name, business_type))')
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
        customerName: getDisplayName(customer),
      };
    });

    return { data: rows, error: null };
  },

  async insertTasks(tasks: Partial<PersistedTask>[]): Promise<DbResult<null>> {
    if (tasks.length === 0) return { data: null, error: null };

    for (const t of tasks) {
      const parentRow: Record<string, unknown> = {
        customer_id: t.clientId,
        title: t.title,
        status: t.status || 'pending',
      };
      if (t.parentTaskId) {
        parentRow.registry_key = t.parentTaskId;
      }
      const { data: parent, error: pErr } = await supabase
        .from('parent_tasks')
        .insert(parentRow)
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
    registryKey?: string | null;
    subTasks: { title: string }[];
  }) {
    try {
      const finalClientId = taskData.clientId || OFFICE_CUSTOMER_ID;
      const parentInsert: Record<string, unknown> = {
        title: taskData.title,
        customer_id: finalClientId,
        status: 'pending',
      };
      if (taskData.registryKey) {
        parentInsert.registry_key = taskData.registryKey;
      }
      const { data: parent, error: parentErr } = await supabase
        .from('parent_tasks')
        .insert(parentInsert)
        .select('id')
        .single();

      if (parentErr) throw parentErr;

      const subtasksRows = taskData.subTasks && taskData.subTasks.length > 0
        ? taskData.subTasks.map((sub) => ({
          parent_task_id: parent.id,
          title: sub.title.trim(),
          is_completed: false,
          comment: '',
          priority: 'medium'
        }))
        : [{
          parent_task_id: parent.id,
          title: taskData.title.trim(), // תת-משימה יחידה עם שם המשימה הראשית
          is_completed: false,
          comment: '',
          priority: 'medium'
        }];
      const { error: subErr } = await supabase.from('sub_tasks').insert(subtasksRows);
      if (subErr) throw subErr;


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
        return { data: null, error: { message: "לא ניתן לסמן משימה זו כבוצע כיוון שהיא מכילה את 'אישור ניהול סופי' שטרם אושר!" } };
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
          return { data: null, error: { message: "הפעולה נחסמה: התיק מכיל 'אישור ניהול סופי' ואין לך הרשאה לאשר אותו!" } };
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

    const existing = subTasks
      .filter(s => s.id && UUID_RE.test(s.id))
      .map(s => ({ id: s.id, parent_task_id: taskId, title: s.title, is_completed: s.completed ?? false, comment: s.comment ?? '', priority: s.priority || 'medium' }));

    const newOnes = subTasks
      .filter(s => !s.id || !UUID_RE.test(s.id))
      .map(s => ({ parent_task_id: taskId, title: s.title, is_completed: s.completed ?? false, comment: s.comment ?? '', priority: s.priority || 'medium' }));

    if (existing.length > 0) {
      const { error } = await supabase.from('sub_tasks').upsert(existing);
      if (error) return { data: null, error };
    }
    if (newOnes.length > 0) {
      const { error } = await supabase.from('sub_tasks').insert(newOnes);
      if (error) return { data: null, error };
    }
    return { data: null, error: null };
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
        return { data: null, error: { message: "אין לך הרשאה לשנות את הסטטוס של אישור ניהול סופי!" } };
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

  async updateSubtask(subtaskId: string, _parentTaskId: string, updates: { title: string; priority: string; comment: string }): Promise<DbResult<null>> {
    if (updates.title.toLowerCase().includes("אישור ניהול סופי") && !authService.canApproveFinal(updates.title)) {
      return { data: null, error: { message: "אין לך הרשאה לערוך או לשנות את אישור ניהול סופי!" } };
    }
    const { error } = await supabase
      .from('sub_tasks')
      .update({
        priority: updates.priority,
        title: updates.title.trim(),
        comment: updates.comment.trim(),
        updated_at: new Date().toISOString(),
        updated_by: authService.getCurrentUser()
      })
      .eq('id', subtaskId);
    return { data: null, error };
  },

  async updateTask(taskId: string, patch: Partial<PersistedTask>): Promise<DbResult<null>> {
    const row: Record<string, any> = {};
    if (patch.title) row.title = patch.title;
    if (patch.status) row.status = patch.status;
    if (patch.clientId) row.customer_id = patch.clientId;

    const { error } = await supabase.from('parent_tasks').update(row).eq('id', taskId);
    return { data: null, error };
  },

  // ── Dashboard counts ──

  async fetchActiveCustomerCount(): Promise<DbResult<number>> {
    const { count, error } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('id', OFFICE_CUSTOMER_ID);
    return { data: count ?? 0, error: error as any };
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
