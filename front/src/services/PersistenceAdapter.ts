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
import { AUTO_TASKS_CONFIG, getSubtaskRegistryOrder } from '../constants/taskRegistry';

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
  restrictedTo?: string | null;
  dependsOn?: string | null;
  registryKey?: string | null;
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
  isManual?: boolean;              // maps to parent_tasks.is_manual
}

export interface CustomerWithTasks extends Customer {
  tasks: PersistedTask[];
}

export interface PersistedTaskWithCustomer extends PersistedTask {
  customerId: string | null;
  customerName: string;
  customerIsWaiting?: boolean;
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
  customerComments?: string;
  customerIsWaiting?: boolean;
  restrictedTo?: string | null;
  dependsOn?: string | null;
  registryKey?: string | null;
  customerCreatedAt?: string | null;
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
    isWaiting: !!row.is_waiting,
    comments: row.comments || '',

    customerDetails: {
      fullName: row.full_name || '',
      identityId: row.identity_id || '',
      phoneNumber: row.phone_number || '',
      address: row.address || '',
      email: row.email || '',
      parentIdNumber: row.parent_id_number || '',
      hasWhatsapp: !!row.has_whatsapp,
      spouseBirthYear: row.spouse_birth_year != null ? String(row.spouse_birth_year) : '',
    },
    businessDetails: {
      businessName: row.business_name || '',
      businessID: row.business_id || '',
      businessType: (row.business_type || '') as any,
      clientType: (row.client_type || '') as any,
      openingDate: row.opening_date || '',
      occupation: row.occupation || '',
      businessDescription: row.business_description || '',
      employsWorkers: (row.employs_workers || 'no') as any,
      deductionsId: row.deductions_id || '',
      caseStartYear: row.case_start_year != null ? String(row.case_start_year) : '',
      deductionsFileStatus: row.deductions_file_status || '',
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
      needsIncomeTaxDirectDebit: row.needs_income_tax_direct_debit ?? true,
      spouseFileExists: row.spouse_file_exists ?? false,
      spouseRepresentationTransferNeeded: row.spouse_representation_transfer_needed ?? false,
    },
    vatDetails: {
      newVatCase: row.vat_is_new_case ?? true,
    },
    paymentDetails: {
      setupFee: String(row.setup_fee ?? 0),
      monthlyFee: String(row.monthly_fee ?? 0),
      directDebit: row.direct_debit ?? false,
      setupFeePaid: row.setup_fee_paid ?? false,
    },

    isInsuranceActive: !!row.is_insurance_active,
    isIncomeTaxActive: !!row.is_income_tax_active,
    isVatActive: !!row.is_vat_active,

    idPhotoUrl: row.id_photo_url ?? null,
    bankApprovalUrl: row.bank_approval_url ?? null,
    agreementUrl: row.agreement_url ?? null,
  };
}

function mapTaskRow(t: any): PersistedTask {
  const parentTaskId = t.registry_key ?? t.parent_task_id ?? null;
  // ✨ תיקון: שליפת ה-priority ישירות מתוך שורת תת המשימה הספציפית ב-DB
  const subTasks = (t.sub_tasks ?? []).map((s: any) => ({
      id: s.id,
      parentTaskId: t.id,
      title: s.title,
      completed: !!s.is_completed,
      comment: s.comment ?? null,
      priority: (s.priority || 'medium') as SubTaskPriority,
      restrictedTo: s.restricted_to ?? null,
      dependsOn: s.depends_on ?? null,
      registryKey: s.registry_key ?? null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
  // DB read order is not guaranteed to match the registry's intended order
  // (no ORDER BY, random UUID PKs) — sort explicitly so dependsOn chains
  // (rep_1..4 etc.) always render in the right sequence.
  subTasks.sort((a: any, b: any) =>
    getSubtaskRegistryOrder(parentTaskId, a.registryKey) - getSubtaskRegistryOrder(parentTaskId, b.registryKey));
  return {
    id: t.id,
    clientId: t.customer_id,
    parentTaskId,
    title: t.title,
    status: t.status,
    createdAt: t.created_at,
    isManual: !!t.is_manual,
    subTasks,
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

  async insertOfficeSubtask(title: string, priority: string, comment: string): Promise<DbResult<null>> {
    const { data: existing, error: findErr } = await supabase
      .from('parent_tasks')
      .select('id')
      .eq('registry_key', 'OFFICE_GENERAL')
      .eq('customer_id', OFFICE_CUSTOMER_ID)
      .maybeSingle();

    if (findErr) return { data: null, error: findErr };

    let parentId = existing?.id;

    if (!parentId) {
      const { data: created, error: createErr } = await supabase
        .from('parent_tasks')
        .insert({
          customer_id: OFFICE_CUSTOMER_ID,
          registry_key: 'OFFICE_GENERAL',
          title: 'משימות משרד כלליות',
          status: 'pending',
        })
        .select('id')
        .single();

      if (createErr) return { data: null, error: createErr };
      parentId = created.id;
    }

    const { error: subErr } = await supabase.from('sub_tasks').insert({
      parent_task_id: parentId,
      title: title.trim(),
      is_completed: false,
      priority,
      comment: comment.trim(),
    });

    return { data: null, error: subErr };
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

  async fetchOfficeTasks(): Promise<DbResult<PersistedTask[]>> {
    const { data, error } = await supabase
      .from('parent_tasks')
      .select('*, sub_tasks(*)')
      .eq('customer_id', OFFICE_CUSTOMER_ID)
      .order('created_at', { ascending: true });
    if (!data) return { data: null, error };
    return {
      data: data.map(mapTaskRow),
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
       .sort((a: PersistedTask, b: PersistedTask) => {
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
      parent_id_number: c.customerDetails?.parentIdNumber ?? '',
      has_whatsapp: c.customerDetails?.hasWhatsapp ?? false,
      spouse_birth_year: Number(c.customerDetails?.spouseBirthYear) || null,
      is_active: c.isActive ?? true,
      is_waiting: c.isWaiting ?? true,
      comments: c.comments ?? '',
      business_name: c.businessDetails?.businessName ?? '',
      business_id: c.businessDetails?.businessID ?? '',
      business_type: c.businessDetails?.businessType ?? '',
      client_type: c.businessDetails?.clientType ?? '',
      opening_date: c.businessDetails?.openingDate || null,
      occupation: c.businessDetails?.occupation ?? '',
      business_description: c.businessDetails?.businessDescription ?? '',
      employs_workers: c.businessDetails?.employsWorkers ?? 'no',
      deductions_id: c.businessDetails?.deductionsId ?? '',
      case_start_year: c.businessDetails?.caseStartYear ? Number(c.businessDetails.caseStartYear) : null,
      deductions_file_status: c.businessDetails?.deductionsFileStatus || null,
      income_tax_rep_type: c.incomeTaxDetails?.repType ?? null,
      income_tax_prepayment: c.incomeTaxDetails?.incomeTaxPrepayment ?? '',
      annual_turnover: c.incomeTaxDetails?.annualTurnover ?? '',
      income_tax_is_new_case: c.incomeTaxDetails?.newItCase ?? true,
      needs_income_tax_direct_debit: c.incomeTaxDetails?.needsIncomeTaxDirectDebit ?? true,
      spouse_file_exists: c.incomeTaxDetails?.spouseFileExists ?? false,
      spouse_representation_transfer_needed: c.incomeTaxDetails?.spouseRepresentationTransferNeeded ?? false,
      vat_is_new_case: c.vatDetails?.newVatCase ?? true,
      insurance_prepayment: c.insuranceDetails?.insurancePrepayment ?? '',
      work_hours: c.insuranceDetails?.workHours ?? '',
      insurance_is_new_case: c.insuranceDetails?.newInsuranceCase ?? true,
      insurance_id: c.insuranceDetails?.insuranceId ?? '',
      insurance_status: c.insuranceDetails?.insuranceStatus ?? '',
      setup_fee: Number(c.paymentDetails?.setupFee) || 0,
      monthly_fee: Number(c.paymentDetails?.monthlyFee) || 0,
      direct_debit: c.paymentDetails?.directDebit ?? false,
      setup_fee_paid: c.paymentDetails?.setupFeePaid ?? false,
      is_income_tax_active: c.isIncomeTaxActive ?? false,
      is_vat_active: c.isVatActive ?? false,
      is_insurance_active: c.isInsuranceActive ?? false,
      id_photo_url: c.idPhotoUrl ?? null,
      bank_approval_url: c.bankApprovalUrl ?? null,
      agreement_url: c.agreementUrl ?? null,
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
      flatRow.parent_id_number = c.customerDetails.parentIdNumber ?? '';
      flatRow.has_whatsapp = c.customerDetails.hasWhatsapp ?? false;
      flatRow.spouse_birth_year = Number(c.customerDetails.spouseBirthYear) || null;
    }

    if (c.businessDetails) {
      flatRow.business_name = c.businessDetails.businessName;
      flatRow.business_id = c.businessDetails.businessID;
      flatRow.business_type = c.businessDetails.businessType;
      flatRow.client_type = c.businessDetails.clientType ?? '';
      flatRow.opening_date = c.businessDetails.openingDate || null;
      flatRow.occupation = c.businessDetails.occupation;
      flatRow.business_description = c.businessDetails.businessDescription;
      flatRow.employs_workers = c.businessDetails.employsWorkers;
      flatRow.deductions_id = c.businessDetails.deductionsId;
      flatRow.case_start_year = c.businessDetails.caseStartYear ? Number(c.businessDetails.caseStartYear) : null;
      flatRow.deductions_file_status = c.businessDetails.deductionsFileStatus || null;
    }

    if (c.incomeTaxDetails) {
      flatRow.income_tax_rep_type = c.incomeTaxDetails.repType;
      flatRow.income_tax_prepayment = c.incomeTaxDetails.incomeTaxPrepayment;
      flatRow.annual_turnover = c.incomeTaxDetails.annualTurnover;
      flatRow.income_tax_is_new_case = c.incomeTaxDetails.newItCase;
      flatRow.needs_income_tax_direct_debit = c.incomeTaxDetails.needsIncomeTaxDirectDebit ?? true;
      flatRow.spouse_file_exists = c.incomeTaxDetails.spouseFileExists ?? false;
      flatRow.spouse_representation_transfer_needed = c.incomeTaxDetails.spouseRepresentationTransferNeeded ?? false;
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
      flatRow.setup_fee_paid = c.paymentDetails.setupFeePaid ?? false;
    }

    if (c.isIncomeTaxActive !== undefined) flatRow.is_income_tax_active = c.isIncomeTaxActive;
    if (c.isVatActive !== undefined) flatRow.is_vat_active = c.isVatActive;
    if (c.isInsuranceActive !== undefined) flatRow.is_insurance_active = c.isInsuranceActive;
    if (c.comments !== undefined) flatRow.comments = c.comments;
    if (c.isActive !== undefined) flatRow.is_active = c.isActive;
    if (c.isWaiting !== undefined) flatRow.is_waiting = c.isWaiting;
    if (c.idPhotoUrl !== undefined) flatRow.id_photo_url = c.idPhotoUrl;
    if (c.bankApprovalUrl !== undefined) flatRow.bank_approval_url = c.bankApprovalUrl;
    if (c.agreementUrl !== undefined) flatRow.agreement_url = c.agreementUrl;

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

  // ── Customer files (private `customer-files` Storage bucket) ──
  // Returns the storage PATH, not a URL — the bucket is private, so callers
  // must resolve a usable link via getSignedFileUrl() at click-time.

  async uploadCustomerFile(
    customerId: string,
    file: File,
    fileType: 'id_photo' | 'bank_approval' | 'agreement'
  ): Promise<DbResult<string>> {
    const ext = file.name.split('.').pop();
    const path = `customers/${customerId}/${fileType}.${ext}`;
    const { error } = await supabase.storage
      .from('customer-files')
      .upload(path, file, { upsert: true });
    if (error) return { data: null, error };
    return { data: path, error: null };
  },

  async getSignedFileUrl(path: string): Promise<DbResult<string>> {
    const { data, error } = await supabase.storage
      .from('customer-files')
      .createSignedUrl(path, 60 * 5); // 5 minutes — generated fresh per download click
    if (error) return { data: null, error };
    return { data: data.signedUrl, error: null };
  },

  async deleteCustomerFile(path: string): Promise<DbResult<null>> {
    const { error } = await supabase.storage.from('customer-files').remove([path]);
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
.select('*, customers(id, full_name, business_name, business_type, is_waiting), sub_tasks(*)')
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
        customerIsWaiting: !!customer?.is_waiting,
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
     .select('*, parent_tasks(id, title, status, customer_id, registry_key, customers(id, full_name, business_name, business_type, comments, is_waiting, created_at))')
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
        parentTaskId: parent?.registry_key || null,
        parentTitle: parent?.title || '',
        priority: (item.priority || 'medium') as SubTaskPriority, // ✨ שלוף מתוך תת-המשימה
        taskStatus: (parent?.status || 'pending') as 'pending' | 'completed',
        clientId: parent?.customer_id || null,
        customerName: getDisplayName(customer),
        customerComments: customer?.comments || '',
        customerIsWaiting: !!customer?.is_waiting,
        restrictedTo: item.restricted_to ?? null,
        dependsOn: item.depends_on ?? null,
        registryKey: item.registry_key ?? null,
        customerCreatedAt: customer?.created_at ?? null,
      };
    });

    const filteredRows = rows.filter(r => r.clientId !== OFFICE_CUSTOMER_ID);
    return { data: filteredRows, error: null };
  },

  async insertSingleTask(taskData: {
    title: string;
    clientId: string | null;
    registryKey?: string | null;
    restrictedTo?: string | null;
    priority?: string;
    subTasks: { title: string; restrictedTo?: string | null; dependsOn?: string | null; registryKey?: string | null }[];
    isManual?: boolean;
  }) {
    try {
      const finalClientId = taskData.clientId || OFFICE_CUSTOMER_ID;
      const parentInsert: Record<string, unknown> = {
        title: taskData.title,
        customer_id: finalClientId,
        status: 'pending',
        is_manual: taskData.isManual ?? false,
        restricted_to: taskData.restrictedTo ?? null,
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
          priority: taskData.priority || 'medium',
          restricted_to: sub.restrictedTo ?? null,
          depends_on: sub.dependsOn ?? null,
          registry_key: sub.registryKey ?? null,
        }))
        : [{
          parent_task_id: parent.id,
          title: taskData.title.trim(),
          is_completed: false,
          comment: '',
          priority: taskData.priority || 'medium',
          restricted_to: null,
          depends_on: null,
          registry_key: null,
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

  async deleteSubtask(subtaskId: string): Promise<DbResult<null>> {
    const { data: deleted, error } = await supabase
      .from('sub_tasks')
      .delete()
      .eq('id', subtaskId)
      .select('parent_task_id')
      .single();

    if (error) return { data: null, error };

    const parentId: string = deleted.parent_task_id;

    const { count } = await supabase
      .from('sub_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('parent_task_id', parentId);

    if (count === 0) {
      // best-effort: clean up orphaned parent row; FK violation if race — silently ignored
      await supabase.from('parent_tasks').delete().eq('id', parentId);
    }

    return { data: null, error: null };
  },

  async updateTaskStatus(taskId: string, status: 'pending' | 'completed'): Promise<DbResult<null>> {
    // ✨ חסימת אב המשימה במידה והלקוח "בהמתנה", או שהוא מכיל תת-משימה מוגבלת שהמשתמש הנוכחי אינו מורשה לה
    if (status === 'completed') {
      const { data: parentRow } = await supabase
        .from('parent_tasks')
        .select('customers(is_waiting)')
        .eq('id', taskId)
        .single();

      if ((parentRow as any)?.customers?.is_waiting) {
        return { data: null, error: { message: 'הלקוח במצב "בהמתנה" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.' } };
      }

      const { data: subTasks } = await supabase
        .from('sub_tasks')
        .select('restricted_to')
        .eq('parent_task_id', taskId);

      const restrictedSub = subTasks?.find(sub => sub.restricted_to);

      if (restrictedSub && !authService.canEditRestricted(restrictedSub.restricted_to)) {
        return { data: null, error: { message: `לא ניתן לסמן משימה זו כבוצע — היא מכילה תת-משימה המוגבלת ל-${restrictedSub.restricted_to} בלבד!` } };
      }
    }

    const { error } = await supabase.from('parent_tasks').update({ status }).eq('id', taskId);
    return { data: null, error };
  },

  // ✨ סעיף 2 + 6: מימוש פונקציית עדכון הסטטוס הגורפת עם חסימת הרשאות קשיחה ליוחנן ושמוליק
  async updateSubtasksStatusByParent(customerId: string, parentTaskId: string, completed: boolean): Promise<DbResult<null>> {

    if (completed) {
      const { data: customerRow } = await supabase
        .from('customers')
        .select('is_waiting')
        .eq('id', customerId)
        .single();

      if (customerRow?.is_waiting) {
        return { data: null, error: { message: 'הלקוח במצב "בהמתנה" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.' } };
      }

      // 1. נבדוק קודם כל האם בין כל תתי-המשימות של האב הזה יש תת-משימה מוגבלת
      const { data: subTasks } = await supabase
        .from('sub_tasks')
        .select('restricted_to')
        .eq('parent_task_id', parentTaskId);

      if (subTasks) {
        // אם נמצאה לפחות תת-משימה מוגבלת שהיוזר הנוכחי לא מורשה לה - נחסום את כל הפעולה הגורפת!
        const restrictedSub = subTasks.find(sub => sub.restricted_to);

        if (restrictedSub && !authService.canEditRestricted(restrictedSub.restricted_to)) {
          return { data: null, error: { message: `הפעולה נחסמה: התיק מכיל תת-משימה המוגבלת ל-${restrictedSub.restricted_to} בלבד!` } };
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
    // upsert — תת-משימות קיימות עם UUID תקני
    const existing = subTasks
      .filter(s => s.id && UUID_RE.test(s.id))
      .map(s => ({
        id: s.id, parent_task_id: taskId, title: s.title, is_completed: s.completed ?? false,
        comment: s.comment ?? '', priority: s.priority || 'medium',
        restricted_to: s.restrictedTo ?? null, depends_on: s.dependsOn ?? null, registry_key: s.registryKey ?? null,
      }));

    // insert — תת-משימות חדשות ללא UUID
    const newOnes = subTasks
      .filter(s => !s.id || !UUID_RE.test(s.id))
      .map(s => ({
        parent_task_id: taskId, title: s.title, is_completed: s.completed ?? false,
        comment: s.comment ?? '', priority: s.priority || 'medium',
        restricted_to: s.restrictedTo ?? null, depends_on: s.dependsOn ?? null, registry_key: s.registryKey ?? null,
      }));

    // 1. DELETE קודם — כך לא יגע ב-newOnes שיוכנסו אחרי
    // knownIds ריק → מחק את כל ה-pending של האב
    const knownIds = existing.map(s => s.id as string);
    let deleteQuery = supabase
      .from('sub_tasks')
      .delete()
      .eq('parent_task_id', taskId)
      .eq('is_completed', false);
    if (knownIds.length > 0) {
      deleteQuery = deleteQuery.not('id', 'in', `(${knownIds.join(',')})`);
    }
    const { error: deleteError } = await deleteQuery;
    if (deleteError) return { data: null, error: deleteError };

    // 2. upsert existing
    if (existing.length > 0) {
      const { error } = await supabase.from('sub_tasks').upsert(existing);
      if (error) return { data: null, error };
    }

    // 3. insert newOnes — אחרון, אחרי ה-DELETE
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
        .select('restricted_to, parent_tasks(customers(is_waiting))')
        .eq('id', subtaskId)
        .single(); // חוזר ל-single בטוח כי המזהה חובה

      if ((subtask as any)?.parent_tasks?.customers?.is_waiting) {
        return { data: null, error: { message: 'הלקוח במצב "בהמתנה" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.' } };
      }

      if (subtask?.restricted_to && !authService.canEditRestricted(subtask.restricted_to)) {
        return { data: null, error: { message: `אין לך הרשאה לשנות את הסטטוס של משימה זו — מוגבלת ל-${subtask.restricted_to} בלבד!` } };
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
    const { data: subtask } = await supabase
      .from('sub_tasks')
      .select('restricted_to')
      .eq('id', subtaskId)
      .single();

    if (subtask?.restricted_to && !authService.canEditRestricted(subtask.restricted_to)) {
      return { data: null, error: { message: `אין לך הרשאה לערוך משימה זו — מוגבלת ל-${subtask.restricted_to} בלבד!` } };
    }

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
    const { data: subtask } = await supabase
      .from('sub_tasks')
      .select('restricted_to')
      .eq('id', subtaskId)
      .single();

    if (subtask?.restricted_to && !authService.canEditRestricted(subtask.restricted_to)) {
      return { data: null, error: { message: `אין לך הרשאה לערוך משימה זו — מוגבלת ל-${subtask.restricted_to} בלבד!` } };
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
    if (patch.status === 'completed') {
      const { data: parentRow } = await supabase
        .from('parent_tasks')
        .select('customers(is_waiting)')
        .eq('id', taskId)
        .single();

      if ((parentRow as any)?.customers?.is_waiting) {
        return { data: null, error: { message: 'הלקוח במצב "בהמתנה" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.' } };
      }

      const { data: subTasks } = await supabase
        .from('sub_tasks')
        .select('restricted_to')
        .eq('parent_task_id', taskId);

      const restrictedSub = subTasks?.find(sub => sub.restricted_to);

      if (restrictedSub && !authService.canEditRestricted(restrictedSub.restricted_to)) {
        return { data: null, error: { message: `לא ניתן לסמן משימה זו כבוצע — היא מכילה תת-משימה המוגבלת ל-${restrictedSub.restricted_to} בלבד!` } };
      }
    }

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

  async fetchWaitingCustomers(): Promise<DbResult<{ id: string; name: string }[]>> {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name, business_name, business_type')
      .eq('is_waiting', true)
      .neq('id', OFFICE_CUSTOMER_ID)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error };
    return {
      data: (data ?? []).map((row: any) => ({ id: row.id, name: getDisplayName(row) })),
      error: null,
    };
  },

  async fetchCustomerTaskStats(): Promise<DbResult<{ pending: number; completed: number }>> {
    const [customersRes, tasksRes] = await Promise.all([
      supabase.from('customers').select('id, is_active').neq('id', OFFICE_CUSTOMER_ID),
      supabase.from('parent_tasks').select('customer_id, status').neq('customer_id', OFFICE_CUSTOMER_ID),
    ]);
    if (customersRes.error) return { data: null, error: customersRes.error };
    if (tasksRes.error) return { data: null, error: tasksRes.error };

    const byCustomer = new Map<string, boolean>();
    for (const row of (tasksRes.data ?? [])) {
      if (!row.customer_id) continue;
      const prev = byCustomer.get(row.customer_id);
      byCustomer.set(row.customer_id,
        prev === undefined ? row.status === 'completed' : prev && row.status === 'completed'
      );
    }

    let pending = 0, completed = 0;
    for (const c of (customersRes.data ?? [])) {
      if (!c.is_active) continue;
      const allDone = byCustomer.get(c.id);
      if (allDone === true) completed++;
      else pending++;
    }
    return { data: { pending, completed }, error: null };
  },

  // ── Logs ──

  async insertLog(actor: string, action: string, entityType: string, entityId: string, details: string): Promise<void> {
    try {
        await supabase.from('logs').insert({
            actor,
            action,
            entity_type: entityType,
            entity_id: entityId,
            payload: { details }
        });
    } catch {
        // לוגים לא חוסמים את הפעולה הראשית
    }
},
  async fetchLogs(): Promise<DbResult<any[]>> {
    const { data, error } = await supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    return { data, error };
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
