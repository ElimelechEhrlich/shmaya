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
  /** Subtasks that fire under their parent regardless of normal gating. */
  forcedSubtasks: { parentId: string; subtaskId: string }[];
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
    forcedParentTasks: ['INCOME_TAX'],
    forcedSubtasks: [{ parentId: 'INCOME_TAX', subtaskId: 'taxCoordination' }],
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
// 5. Field rules (visibility + required)
// ──────────────────────────────────────────────────────────────────

type Predicate = (c: Customer) => boolean;
const always: Predicate = () => true;
const never: Predicate = () => false;

interface FieldRule {
  visibleWhen?: Predicate;
  requiredWhen?: Predicate;
}

const FIELD_RULES: Record<string, FieldRule> = {
  // — customer details —
  'customerDetails.fullName':    { visibleWhen: always, requiredWhen: always },
  'customerDetails.identityId':  { visibleWhen: always, requiredWhen: always },
  'customerDetails.phoneNumber': { visibleWhen: always, requiredWhen: always },
  'customerDetails.address':     { visibleWhen: always, requiredWhen: never  },
  'customerDetails.email':       { visibleWhen: always, requiredWhen: always },

  // — business details —
  'businessDetails.businessName':        { visibleWhen: always, requiredWhen: always },
  'businessDetails.businessID':          { visibleWhen: always, requiredWhen: always },
  'businessDetails.businessType':        { visibleWhen: always, requiredWhen: always },
  'businessDetails.openingDate':         { visibleWhen: always, requiredWhen: always },
  'businessDetails.occupation':          { visibleWhen: always, requiredWhen: never  },
  'businessDetails.businessDescription': { visibleWhen: always, requiredWhen: never  },
  'businessDetails.employsWorkers': {
    visibleWhen: (c) => isEmployerType(c),
    requiredWhen: (c) => isEmployerType(c),
  },
  'businessDetails.deductionsId': {
    visibleWhen: (c) => c.needsDeductionsFile,
    requiredWhen: (c) => c.needsDeductionsFile,
  },

  // — service toggles —
  isIncomeTaxActive:  { visibleWhen: always, requiredWhen: never },
  isInsuranceActive:  { visibleWhen: always, requiredWhen: never },
  isVatActive: {
    visibleWhen: (c) => isRepresentationAllowed(c),
    requiredWhen: never,
  },

  // — insurance details —
  'insuranceDetails.newInsuranceCase': {
    visibleWhen: (c) => c.isInsuranceActive,
    requiredWhen: (c) => c.isInsuranceActive,
  },
  'insuranceDetails.insurancePrepayment': {
    visibleWhen: (c) => c.isInsuranceActive,
    requiredWhen: never,
  },
  'insuranceDetails.workHours': {
    visibleWhen: (c) => c.isInsuranceActive,
    requiredWhen: never,
  },
  'insuranceDetails.insuranceId': {
    visibleWhen: (c) => c.isInsuranceActive,
    requiredWhen: never,
  },
  'insuranceDetails.insuranceStatus': {
    visibleWhen: (c) =>
      c.isInsuranceActive && Boolean(c.insuranceDetails?.newInsuranceCase),
    requiredWhen: never,
  },

  // — income tax details —
  'incomeTaxDetails.repType': {
    visibleWhen: (c) => c.isIncomeTaxActive,
    requiredWhen: (c) => c.isIncomeTaxActive,
  },
  'incomeTaxDetails.incomeTaxPrepayment': {
    visibleWhen: (c) => c.isIncomeTaxActive,
    requiredWhen: never,
  },
  'incomeTaxDetails.annualTurnover': {
    visibleWhen: (c) => c.isIncomeTaxActive,
    requiredWhen: never,
  },
  'incomeTaxDetails.newItCase': {
    visibleWhen: (c) => c.isIncomeTaxActive,
    requiredWhen: (c) => c.isIncomeTaxActive,
  },

  // — vat details (under representation) —
  'vatDetails.newVatCase': {
    visibleWhen: (c) => c.isVatActive,
    requiredWhen: (c) => c.isVatActive,
  },

  // — payment —
  'paymentDetails.setupFee':   { visibleWhen: always, requiredWhen: never },
  'paymentDetails.monthlyFee': { visibleWhen: always, requiredWhen: never },
  'paymentDetails.directDebit': {
    visibleWhen: (c) => Number(c.paymentDetails?.monthlyFee) > 0,
    requiredWhen: never,
  },

  // — derived —
  needsDeductionsFile: {
    visibleWhen: (c) =>
      isEmployerType(c) && c.businessDetails?.employsWorkers === 'yes',
    requiredWhen: never,
  },

  comments: { visibleWhen: always, requiredWhen: never },
};

/** All field paths declared in FIELD_RULES, in declaration order. */
export const ALL_FIELDS: readonly string[] = Object.keys(FIELD_RULES);

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

export function isAttributeVisible(c: Customer, field: string): boolean {
  const rule = FIELD_RULES[field];
  if (!rule?.visibleWhen) return true;
  return rule.visibleWhen(c);
}

export function isAttributeRequired(c: Customer, field: string): boolean {
  if (!isAttributeVisible(c, field)) return false;
  const rule = FIELD_RULES[field];
  if (!rule?.requiredWhen) return false;
  return rule.requiredWhen(c);
}

/** Filters ALL_FIELDS to those visible for the given customer. */
export function listVisibleFields(c: Customer): string[] {
  return ALL_FIELDS.filter((f) => isAttributeVisible(c, f));
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

/** True iff the current customer's business type forces this subtask under this parent. */
export function isSubtaskForcedByBusinessType(
  parentId: string,
  subtaskId: string,
  c: Customer
): boolean {
  const btRule = getBusinessTypeRule(c);
  return btRule?.forcedSubtasks.some(
    (f) => f.parentId === parentId && f.subtaskId === subtaskId
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

export function applyBusinessRules(c: Customer): Customer {
  // Clone every nested object so the cascade never mutates the input — fixes
  // the asymmetric-clone fragility flagged in the prior review.
  const next: Customer = {
    ...c,
    customerDetails:  { ...c.customerDetails },
    businessDetails:  { ...c.businessDetails },
    insuranceDetails: { ...c.insuranceDetails },
    incomeTaxDetails: { ...c.incomeTaxDetails },
    vatDetails:       { ...c.vatDetails },
    paymentDetails:   { ...c.paymentDetails },
  };

  // 1. Force services off where the business type forbids them
  const btRule = getBusinessTypeRule(next);
  if (btRule) {
    for (const svc of btRule.forcesServicesOff) {
      next[SERVICES[svc].activeFlag] = false;
    }
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

export function isCustomerFinalized(tasks: Task[] | null | undefined): boolean {
  if (!tasks?.length) return false;
  return tasks.some((t) => {
    if (t.status !== 'completed') return false;
    if (t.parentTaskId === FINAL_APPROVAL_PARENT_ID) return true;
    // Legacy fallback (pre-migration rows with NULL parentTaskId)
    return Boolean(
      t.title?.includes('אישור ניהול') || t.title?.includes('פתיחת תיק סופית')
    );
  });
}
