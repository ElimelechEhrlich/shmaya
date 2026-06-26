// src/registries/CustomerRegistry.ts
//
// Single source of truth for customer business rules.
//
// Replaces the scattered logic discovered in the audit:
//   - CustomerService.applyBusinessLogic           (cross-field cascade)
//   - taskRegistry.AUTO_TASKS_CONFIG               (task generation)
//   - AddCustomer.jsx inline showEmployerFields    (visibility)
//   - CustomerCard.jsx inline isEmployerType/isVatRelevant
//   - TaskService.calculateProgress                (subtask-blind progress)
//
// Audit cross-reference: .claude/project-map.md §2, §3, §4.
//
// Naming policy:
//   Registry keys are camelCase. Customer field names match the live DB
//   shape directly (none of the customer columns use underscores), so the
//   adapter's translation map is intentionally small. The `Service` concept
//   has clean keys (`incomeTax`, `nationalInsurance`, `representation`)
//   that are mapped to the corresponding `is*Active` flag via
//   `ServiceDefinition.activeFlag`.

// ──────────────────────────────────────────────────────────────────
// 1. Enumerations
// ──────────────────────────────────────────────────────────────────

// Business type values are Hebrew because that's what the DB stores AND what
// the form selects emit. A separate English key would force a value-mapping
// layer for no architectural gain.
export type BusinessTypeKey = 'זעיר' | 'פטור' | 'מורשה' | 'חברה בע"מ' | 'אחר';

export type ServiceKey =
  | 'incomeTax'
  | 'nationalInsurance'
  | 'representation'; // models what the legacy schema stores as `isVatActive`

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export const PRIORITY_LEVELS: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

/** Tailwind color tokens for priority badges. */
export const PRIORITY_STYLES: Record<TaskPriority, { bg: string; text: string; border: string; label: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'נמוך' },
  medium: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'בינוני' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'גבוה' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'קריטי' },
};

/** Soft, non-intrusive color branding per parent_task_id. */
export const CATEGORY_STYLES: Record<string, { accent: string; bg: string; ring: string; emoji: string }> = {
  ADMIN_SETUP: { accent: 'border-r-slate-400', bg: 'bg-slate-50', ring: 'ring-slate-200', emoji: '🗂️' },
  INSURANCE: { accent: 'border-r-blue-400', bg: 'bg-blue-50/60', ring: 'ring-blue-200', emoji: '🛡️' },
  INCOME_TAX: { accent: 'border-r-emerald-400', bg: 'bg-emerald-50/60', ring: 'ring-emerald-200', emoji: '💼' },
  VAT: { accent: 'border-r-amber-400', bg: 'bg-amber-50/60', ring: 'ring-amber-200', emoji: '🧾' },
  DIRECT_DEBIT: { accent: 'border-r-purple-400', bg: 'bg-purple-50/60', ring: 'ring-purple-200', emoji: '💳' },
  FINAL_APPROVAL: { accent: 'border-r-rose-400', bg: 'bg-rose-50/60', ring: 'ring-rose-200', emoji: '✅' },
};
export const DEFAULT_CATEGORY_STYLE = { accent: 'border-r-slate-300', bg: 'bg-white', ring: 'ring-slate-200', emoji: '📋' };

/** The three Customer boolean fields that gate services. Narrow union so the
 *  cascade loop can write `next[flag] = false` without a Record<> cast. */
export type ServiceActiveFlag = 'isIncomeTaxActive' | 'isInsuranceActive' | 'isVatActive';

/** The three Customer nested-object fields owned by services. */
export type ServiceDetailsKey = 'incomeTaxDetails' | 'insuranceDetails' | 'vatDetails';

export type RepresentationType = 'ראשי' | 'משני';
export type YesNo = 'yes' | 'no';

// ──────────────────────────────────────────────────────────────────
// 2. Customer domain model
// ──────────────────────────────────────────────────────────────────

export interface CustomerDetails {
  fullName: string;
  identityId: string;
  phoneNumber: string;
  address: string;
  email: string;
}

export interface BusinessDetails {
  businessName: string;
  businessID: string;
  businessType: BusinessTypeKey | '';
  openingDate: string;                 // ISO date
  occupation: string;
  businessDescription: string;
  employsWorkers: YesNo;
  deductionsId: string;
}

export interface InsuranceDetails {
  insurancePrepayment: string;
  workHours: string;
  newInsuranceCase: boolean;
  insuranceId: string;                 // currently dangling in DB — must add form input
  insuranceStatus: string;             // currently dangling in DB — must add form input
}

export interface IncomeTaxDetails {
  repType: RepresentationType;
  incomeTaxPrepayment: string;
  annualTurnover: string;
  newItCase: boolean;
}

export interface VatDetails {
  newVatCase: boolean;
}

export interface PaymentDetails {
  setupFee: string;
  monthlyFee: string;
  directDebit: boolean;
}

export interface Customer {
  id?: string;
  createdAt?: string;                  // adapter translates from the legacy DB column

  customerDetails: CustomerDetails;
  businessDetails: BusinessDetails;
  insuranceDetails: InsuranceDetails;
  incomeTaxDetails: IncomeTaxDetails;
  vatDetails: VatDetails;
  paymentDetails: PaymentDetails;

  isIncomeTaxActive: boolean;
  isInsuranceActive: boolean;
  isVatActive: boolean;

  needsDeductionsFile: boolean;

  /** Soft deactivation — kept on the row so history/tasks survive. */
  isActive?: boolean;

  comments: string;
}

// ──────────────────────────────────────────────────────────────────
// 3. Business type matrix
// ──────────────────────────────────────────────────────────────────

export interface BusinessTypeRule {
  key: BusinessTypeKey;
  /** Whether the representation/VAT service is allowed at all. */
  representationAllowed: boolean;
  /** Whether the "employs workers?" section is shown. */
  showsEmployerFields: boolean;
  /** Services force-disabled whenever this business type is selected. */
  forcesServicesOff: ServiceKey[];
  /** Parent tasks that fire regardless of service activation flags. */
  forcedParentTasks: string[];
  /** Subtasks forced under their parent. An optional `when` predicate lets the
   *  rule depend on additional customer state (e.g. taxCoordination requires
   *  isIncomeTaxActive AND businessType==='זעיר'). */
  forcedSubtasks: { parentId: string; subtaskId: string; when?: (c: Customer) => boolean }[];
}

export const BUSINESS_TYPES: Record<BusinessTypeKey, BusinessTypeRule> = {
  // The audit's hidden coupling: זעיר force-creates INCOME_TAX even when
  // isIncomeTaxActive=false, and unconditionally adds the taxCoordination
  // subtask. See project-map.md §2.
  'זעיר': {
    key: 'זעיר',
    representationAllowed: false,
    showsEmployerFields: false,
    forcesServicesOff: ['representation'],
    // INCOME_TAX parent only fires when income tax is also active (gated automation).
    forcedParentTasks: [],
    // taxCoordination requires both: businessType=='זעיר' AND isIncomeTaxActive.
    forcedSubtasks: [
      { parentId: 'INCOME_TAX', subtaskId: 'taxCoordination', when: (c) => c.isIncomeTaxActive },
    ],
  },
  'פטור': {
    key: 'פטור',
    representationAllowed: false,
    showsEmployerFields: false,
    forcesServicesOff: ['representation'],
    forcedParentTasks: [],
    forcedSubtasks: [],
  },
  'מורשה': {
    key: 'מורשה',
    representationAllowed: true,
    showsEmployerFields: true,
    forcesServicesOff: [],
    forcedParentTasks: [],
    forcedSubtasks: [],
  },
  'חברה בע"מ': {
    key: 'חברה בע"מ',
    representationAllowed: true,
    showsEmployerFields: true,
    forcesServicesOff: [],
    forcedParentTasks: [],
    forcedSubtasks: [],
  },
  // 'אחר' had no special handling in legacy code — defaulting permissive.
  'אחר': {
    key: 'אחר',
    representationAllowed: true,
    showsEmployerFields: false,
    forcesServicesOff: [],
    forcedParentTasks: [],
    forcedSubtasks: [],
  },
};

export const BUSINESS_TYPE_OPTIONS: BusinessTypeKey[] = [
  'זעיר', 'פטור', 'מורשה', 'חברה בע"מ', 'אחר',
];

// ──────────────────────────────────────────────────────────────────
// 4. Service registry — which fields & tasks each service unlocks
// ──────────────────────────────────────────────────────────────────

export interface ServiceDefinition {
  key: ServiceKey;
  hebrewLabel: string;
  /** Root-level boolean on Customer that activates this service. */
  activeFlag: ServiceActiveFlag;
  /** Nested details object on Customer owned by this service. */
  detailsKey: ServiceDetailsKey;
  /** Dot-paths into Customer that become visible/editable when active. */
  unlockedFields: string[];
  /** Parent task id this service emits (matches AUTO_TASKS_CONFIG id). */
  parentTaskId: string;
  /** Subtask ids potentially emitted under the parent. Includes ids forced by
   *  a business type (e.g. taxCoordination), so iterating this array yields
   *  the full subtask catalog for the service. */
  subtaskIds: string[];
  /** Dot-paths cleared to empty when active flag flips to false. */
  clearsOnDeactivate: string[];
}

export const SERVICES: Record<ServiceKey, ServiceDefinition> = {
  incomeTax: {
    key: 'incomeTax',
    hebrewLabel: 'מס הכנסה',
    activeFlag: 'isIncomeTaxActive',
    detailsKey: 'incomeTaxDetails',
    unlockedFields: [
      'incomeTaxDetails.repType',
      'incomeTaxDetails.incomeTaxPrepayment',
      'incomeTaxDetails.annualTurnover',
      'incomeTaxDetails.newItCase',
    ],
    parentTaskId: 'INCOME_TAX',
    // Full catalog including taxCoordination (forced by businessType==='זעיר'
    // via BUSINESS_TYPES['זעיר'].forcedSubtasks). Listed here so consumers
    // iterating subtaskIds get the complete picture.
    subtaskIds: ['it_rep', 'it_open', 'taxCoordination'],
    clearsOnDeactivate: [
      'incomeTaxDetails.incomeTaxPrepayment',
      'incomeTaxDetails.annualTurnover',
    ],
  },
  nationalInsurance: {
    key: 'nationalInsurance',
    hebrewLabel: 'ביטוח לאומי',
    activeFlag: 'isInsuranceActive',
    detailsKey: 'insuranceDetails',
    unlockedFields: [
      'insuranceDetails.insurancePrepayment',
      'insuranceDetails.workHours',
      'insuranceDetails.newInsuranceCase',
      'insuranceDetails.insuranceId',
      'insuranceDetails.insuranceStatus',
    ],
    parentTaskId: 'INSURANCE',
    subtaskIds: ['rep', 'open', 'deductions'],
    clearsOnDeactivate: [],
  },
  representation: {
    key: 'representation',
    hebrewLabel: 'ייצוג מע"מ',
    activeFlag: 'isVatActive',
    detailsKey: 'vatDetails',
    unlockedFields: ['vatDetails.newVatCase'],
    parentTaskId: 'VAT',
    subtaskIds: ['vat_rep', 'vat_open'],
    clearsOnDeactivate: [],
  },
};

// ──────────────────────────────────────────────────────────────────
// 6. Public predicates
// ──────────────────────────────────────────────────────────────────

export function getBusinessTypeRule(c: Customer): BusinessTypeRule | null {
  const t = c.businessDetails?.businessType;
  if (!t) return null;
  return BUSINESS_TYPES[t as BusinessTypeKey] ?? null;
}

export function isEmployerType(c: Customer): boolean {
  return getBusinessTypeRule(c)?.showsEmployerFields ?? false;
}

export function isRepresentationAllowed(c: Customer): boolean {
  return getBusinessTypeRule(c)?.representationAllowed ?? true;
}


// ──────────────────────────────────────────────────────────────────
// 6b. Task-emission predicates
//
// Eliminates the duplicate condition lambdas that previously lived in
// taskRegistry.js. Service-owned parent tasks (INSURANCE/INCOME_TAX/VAT) are
// gated by SERVICES[*].activeFlag plus BUSINESS_TYPES[*].forcedParentTasks.
// Subtasks forced exclusively by business type (e.g. taxCoordination under
// INCOME_TAX for זעיר) are gated by BUSINESS_TYPES[*].forcedSubtasks.
// ──────────────────────────────────────────────────────────────────

/**
 * Returns:
 *   - true  → service-owned parent that should fire (service active OR business type forces it)
 *   - false → service-owned parent that should NOT fire
 *   - null  → parent isn't owned by any service; caller must use its own gating
 *             (ADMIN_SETUP, DIRECT_DEBIT, FINAL_APPROVAL fall here).
 */
export function shouldEmitServiceParent(parentId: string, c: Customer): boolean | null {
  const ownerService = Object.values(SERVICES).find((s) => s.parentTaskId === parentId);
  if (!ownerService) return null;
  if (c[ownerService.activeFlag]) return true;
  const btRule = getBusinessTypeRule(c);
  if (btRule?.forcedParentTasks.includes(parentId)) return true;
  return false;
}

/** True iff the current customer's business type forces this subtask under this parent.
 *  Honors the optional `when` predicate so multi-condition rules (e.g.
 *  taxCoordination only when isIncomeTaxActive) work correctly. */
export function isSubtaskForcedByBusinessType(
  parentId: string,
  subtaskId: string,
  c: Customer
): boolean {
  const btRule = getBusinessTypeRule(c);
  return btRule?.forcedSubtasks.some(
    (f) => f.parentId === parentId && f.subtaskId === subtaskId && (!f.when || f.when(c))
  ) ?? false;
}

/** True iff this subtask appears in ANY business type's forcedSubtasks list.
 *  When true, the subtask should ONLY emit when forced — never by default. */
export function isSubtaskBusinessTypeGated(parentId: string, subtaskId: string): boolean {
  return Object.values(BUSINESS_TYPES).some((rule) =>
    rule.forcedSubtasks.some((f) => f.parentId === parentId && f.subtaskId === subtaskId)
  );
}

// ──────────────────────────────────────────────────────────────────
// 7. Cross-field cascade
//
// Replaces CustomerService.applyBusinessLogic and the duplicated useEffect
// in AddCustomer.jsx. Symmetric: every rule that turns a flag ON must
// also turn it OFF when its trigger goes away (fixes the
// needsDeductionsFile ratchet found in the audit, §4).
//
// Idempotent: applyBusinessRules(applyBusinessRules(c)) === applyBusinessRules(c).
// This guarantees the useEffect pattern in AddCustomer cannot loop.
// ──────────────────────────────────────────────────────────────────
export function hasActiveAuthorities(customer: any): boolean {
  return !!(customer.isIncomeTaxActive || customer.isVatActive || customer.isInsuranceActive);
}

export function applyBusinessRules(c: Customer): Customer {
  // Clone every nested object so the cascade never mutates the input — fixes
  // the asymmetric-clone fragility flagged in the prior review.
  const next: Customer = {
    ...c,
    customerDetails: { ...c.customerDetails },
    businessDetails: { ...c.businessDetails },
    insuranceDetails: { ...c.insuranceDetails },
    incomeTaxDetails: { ...c.incomeTaxDetails },
    vatDetails: { ...c.vatDetails },
    paymentDetails: { ...c.paymentDetails },
    isActive: c.isActive,
  };

  // 1. Force services off where the business type forbids them
  const btRule = getBusinessTypeRule(next);
  if (btRule) {
    for (const svc of btRule.forcesServicesOff) {
      next[SERVICES[svc].activeFlag] = false;
    }
  }

  // 2. After forced-off cascade, deactivate the customer if no authority remains
  if (!hasActiveAuthorities(next)) {
    next.isActive = false;
  }

  // 2. Employer cascade — symmetric (true ↔ false)
  if (isEmployerType(next)) {
    next.needsDeductionsFile = next.businessDetails.employsWorkers === 'yes';
  } else {
    next.needsDeductionsFile = false;
  }

  // 3. Clear deactivated services' derived fields — generalized over every
  // ServiceDefinition. If a service's activeFlag is false, every path in its
  // clearsOnDeactivate list is reset to ''. Adding a new entry to any
  // service's array now takes effect automatically.
  for (const svc of Object.values(SERVICES)) {
    if (!next[svc.activeFlag]) {
      for (const path of svc.clearsOnDeactivate) {
        setByPath(next, path, '');
      }
    }
  }

  // 4. Direct debit guard — monthlyFee<=0 forces directDebit off
  if (Number(next.paymentDetails.monthlyFee) <= 0) {
    next.paymentDetails.directDebit = false;
  }

  return next;
}

function setByPath(obj: unknown, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = obj as Record<string, unknown>;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const existing = cursor[seg];
    cursor[seg] = (existing && typeof existing === 'object'
      ? { ...(existing as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

// ──────────────────────────────────────────────────────────────────
// 8. Coercion — kills the JSON.parse/string-bool divergence
//
// Background: AddCustomer.jsx used to wrap every <select> for boolean fields
// in JSON.parse(...), while CustomerCard.jsx renders the same fields as
// checkboxes/buttons. The two screens therefore wrote the same field as
// bool vs "true"/"false" string. All form↔registry traffic for boolean
// fields now flows through these two helpers — keep it that way.
// ──────────────────────────────────────────────────────────────────

export function coerceBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  return Boolean(v);
}

export function boolToOption(v: boolean): 'true' | 'false' {
  return v ? 'true' : 'false';
}

export const BOOLEAN_FIELDS: string[] = [
  'insuranceDetails.newInsuranceCase',
  'incomeTaxDetails.newItCase',
  'vatDetails.newVatCase',
  'isIncomeTaxActive',
  'isInsuranceActive',
  'isVatActive',
  'needsDeductionsFile',
  'paymentDetails.directDebit',
];

// ──────────────────────────────────────────────────────────────────
// 9. Progress — subtask-weighted
//
// Replaces TaskService.calculateProgress, which divided completed parent
// tasks by total parent tasks and ignored subtasks entirely.
//
// Model: every subtask is one unit. A parent task with no subtasks is itself
// one unit. A parent with status==='completed' counts as if every one of
// its subtasks is complete (so manually marking the parent done short-
// circuits the subtask grid).
// ──────────────────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  completed: boolean;
  /** Optional user-entered comment; persisted in tasks.subTasks JSONB. */
  comment?: string;
}

export interface Task {
  id?: string;
  status: 'pending' | 'completed';
  subTasks?: SubTask[];
  parentTaskId?: string;
  title?: string;
}

export interface ProgressBreakdown {
  totalUnits: number;
  doneUnits: number;
  percent: number;
}

export const PROGRESS_CONFIG = {
  parentOverridesSubtasks: true,
  emptyParentCountsAsOneUnit: true,
} as const;

export function calculateWeightedProgress(tasks: Task[] | null | undefined): ProgressBreakdown {
  if (!tasks?.length) return { totalUnits: 0, doneUnits: 0, percent: 0 };

  let totalUnits = 0;
  let doneUnits = 0;

  for (const t of tasks) {
    const subs = t.subTasks ?? [];
    if (subs.length === 0) {
      if (PROGRESS_CONFIG.emptyParentCountsAsOneUnit) {
        totalUnits += 1;
        if (t.status === 'completed') doneUnits += 1;
      }
      continue;
    }
    totalUnits += subs.length;
    if (PROGRESS_CONFIG.parentOverridesSubtasks && t.status === 'completed') {
      doneUnits += subs.length;
    } else {
      doneUnits += subs.filter((s) => s.completed).length;
    }
  }

  return {
    totalUnits,
    doneUnits,
    percent: totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100),
  };
}

// ──────────────────────────────────────────────────────────────────
// 10. Finalization probe
//
// Prefers the registry-anchored parentTaskId === FINAL_APPROVAL_PARENT_ID
// check. Falls back to the legacy Hebrew-substring match for rows that
// pre-date the parentTaskId column (project-map.md §4 finding #5).
// ──────────────────────────────────────────────────────────────────

export const FINAL_APPROVAL_PARENT_ID = 'FINAL_APPROVAL';

// ──────────────────────────────────────────────────────────────────
// 11. Cascade utilities (parent ↔ subtask completion coupling)
// ──────────────────────────────────────────────────────────────────
//
// Rules:
//   - Parent → completed  ⇒ every subtask becomes completed.
//   - Parent → pending    ⇒ subtasks are left as-is (manual control).
//   - Subtask toggled     ⇒ parent.status = all-subs-done ? 'completed' : 'pending'.
//
// Pure functions, no I/O. Callers apply the result via PersistenceAdapter.

interface CascadeInput {
  status: 'pending' | 'completed';
  subTasks?: { id: string; completed: boolean }[];
}

export interface CascadeResult {
  status: 'pending' | 'completed';
  subTasks: { id: string; completed: boolean;[k: string]: unknown }[];
}

export function cascadeOnParentToggle(task: CascadeInput): CascadeResult {
  const next: 'pending' | 'completed' = task.status === 'completed' ? 'pending' : 'completed';
  const subs = task.subTasks ?? [];
  return {
    status: next,
    subTasks: next === 'completed'
      ? subs.map((s) => ({ ...s, completed: true }))
      : subs.map((s) => ({ ...s })),
  };
}

export function cascadeOnSubtaskToggle(task: CascadeInput, subtaskId: string): CascadeResult {
  const subs = (task.subTasks ?? []).map((s) =>
    s.id === subtaskId ? { ...s, completed: !s.completed } : { ...s }
  );
  const allDone = subs.length > 0 && subs.every((s) => s.completed);
  return { status: allDone ? 'completed' : 'pending', subTasks: subs };
}

export function cascadeOnSubtaskSet(
  task: CascadeInput,
  subtaskId: string,
  completed: boolean
): CascadeResult {
  const subs = (task.subTasks ?? []).map((s) =>
    s.id === subtaskId ? { ...s, completed } : { ...s }
  );
  const allDone = subs.length > 0 && subs.every((s) => s.completed);
  return { status: allDone ? 'completed' : 'pending', subTasks: subs };
}

// ──────────────────────────────────────────────────────────────────
// 12. Idempotent task-generation merge
// ──────────────────────────────────────────────────────────────────
//
// When CustomerService.syncTasks runs on an edit, we don't want to wipe and
// re-create the customer's task list — that would lose subtask completion
// state and comments. Instead, we merge: for each generated parent task,
// either match an existing one (preserving its id/status/subtask
// completion+comments) or insert it fresh.

interface MergeableTask {
  id?: string;
  parentTaskId?: string | null;
  title: string;
  status?: 'pending' | 'completed';
  restrictedTo?: string | null;
  subTasks: { 
    id?: string; 
    title: string; 
    completed?: boolean; 
    comment?: string; 
    details?: Record<string, unknown> }[];
  priority?: TaskPriority;
}

export interface IdempotentSyncPlan {
  /** Tasks that should be INSERTED as new rows. */
  toInsert: MergeableTask[];
  /** Existing-task patches: { id, subTasks } — preserves status. */
  toUpdate: { id: string; subTasks: MergeableTask['subTasks'] }[];
  /** Pending-only existing tasks no longer in the generated set. */
  toDeletePendingIds: string[];
}

/**
 * Build a sync plan that preserves completion state across regenerations.
 * `generated` is the latest output of TaskGeneratorService.generateForCustomer.
 * `existing` is what's currently in the DB for this client.
 */
export function planIdempotentSync(
  generated: MergeableTask[],
  existing: { id: string; title: string; parentTaskId?: string | null; status: 'pending' | 'completed'; subTasks?: MergeableTask['subTasks'] }[]
): IdempotentSyncPlan {
  const existingByParent = new Map<string, typeof existing[number]>();
  const existingByTitle = new Map<string, typeof existing[number]>();
  for (const e of existing) {
    if (e.parentTaskId) existingByParent.set(e.parentTaskId, e);
    existingByTitle.set(e.title, e);
  }
  const generatedParentIds = new Set<string>();
  const generatedTitles = new Set<string>();

  const toInsert: MergeableTask[] = [];
  const toUpdate: IdempotentSyncPlan['toUpdate'] = [];

  for (const g of generated) {
    const match = g.parentTaskId ? existingByParent.get(g.parentTaskId) : undefined;
    if (g.parentTaskId) generatedParentIds.add(g.parentTaskId);
    generatedTitles.add(g.title);

    if (!match) {
      const titleMatch = existingByTitle.get(g.title);
      if (titleMatch) {
        toUpdate.push({
          id: titleMatch.id,
          subTasks: g.subTasks.map((newSub) => {
            // const oldByid = new Map((titleMatch.subTasks ?? []).map((s) => [s.id, s]));
            // const old = oldByid.get(newSub.id);
            const old = (titleMatch.subTasks ?? []).find(s => s.title === newSub.title);
            return old
              // ? { ...newSub, completed: !!old.completed, comment: old.comment ?? '' }
              // : { ...newSub, completed: false, comment: '' };
              ? { ...newSub, id: old.id, completed: !!old.completed, comment: old.comment ?? '' } // 👈 משתילים את ה-UUID האמיתי של תת-המשימה!
              : { ...newSub, id: undefined, completed: false, comment: '' }; // שורה חדשה באמת תקבל undefined ויבוצע לה Insert          })
          })
        });
        continue;
      }
      toInsert.push(g);
      continue;
    }

    // const oldByid = new Map((match.subTasks ?? []).map((s) => [s.id, s]));
    const mergedSubs = g.subTasks.map((newSub) => {
      const old = (match.subTasks ?? []).find(s => s.id === newSub.id || s.title === newSub.title);
      return old
        ? { ...newSub, id: old.id, completed: !!old.completed, comment: old.comment ?? '' } // 👈 הגנה קשיחה על ה-UUID של הבן
        : { ...newSub, id: undefined, completed: false, comment: '' };
        });
        toUpdate.push({ id: match.id, subTasks: mergedSubs 

        });
        }

  // Pending existing tasks whose parentTaskId is no longer generated → delete.
  const toDeletePendingIds: string[] = [];
  for (const e of existing) {
    if (e.status !== 'pending') continue;
    const existingKey = e.parentTaskId ?? e.title;
    if (!existingKey) continue;
    if (!generatedParentIds.has(existingKey) && !generatedTitles.has(existingKey)) {
      toDeletePendingIds.push(e.id);
    }
  }

  return { toInsert, toUpdate, toDeletePendingIds };
}

/** Read the parent id from a task, accepting either the adapter-translated
 *  camelCase shape OR a raw snake_case row (defensive — should normally be
 *  unnecessary because reads go through PersistenceAdapter.fromDbTask). */
function readParentTaskId(t: Task | Record<string, unknown>): string | undefined {
  const ct = t as Record<string, unknown>;
  return (ct.parentTaskId as string | undefined) ?? (ct.parent_task_id as string | undefined);
}

export function isCustomerFinalized(tasks: Task[] | null | undefined): boolean {
  if (!tasks?.length) return false;
  return tasks.some((t) => {
    if (t.status !== 'completed') return false;
    if (readParentTaskId(t) === FINAL_APPROVAL_PARENT_ID) return true;
    // Legacy fallback (pre-migration rows with NULL parent_task_id)
    return Boolean(
      t.title?.includes('אישור ניהול') || t.title?.includes('פתיחת תיק סופית')
    );
  });
}
