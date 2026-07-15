// src/constants/taskRegistry.ts
//
// Declarative task catalog consumed by TaskGeneratorService. Parent gating for
// service-owned parents (INSURANCE, TAX_VAT) is driven by
// CustomerRegistry.SERVICES + BUSINESS_TYPES — NOT by `condition` lambdas
// here.

export interface RegistryCustomer {
    id?: string;
    isIncomeTaxActive?: boolean;
    isVatActive?: boolean;
    isInsuranceActive?: boolean;
    needsDeductionsFile?: boolean;
    customerDetails?: {
        fullName?: string;
        phoneNumber?: string;
        [key: string]: any;
    };
    businessDetails?: {
        businessName?: string;
        businessID?: string;
        businessType?: string;
        deductionsId?: string;
        caseStartYear?: string | number;
        [key: string]: any;
    };
    paymentDetails?: {
        directDebit?: boolean;
        monthlyFee?: string | number;
        setupFee?: string | number;
        [key: string]: any;
    };
    insuranceDetails?: {
        insuranceId?: string;
        newInsuranceCase?: boolean;
        insuranceStatus?: string;
        [key: string]: any;
    };
    incomeTaxDetails?: {
        newItCase?: boolean;
        needsIncomeTaxDirectDebit?: boolean;
        spouseFileExists?: boolean;
        spouseRepresentationTransferNeeded?: boolean;
        [key: string]: any;
    };
    vatDetails?: {
        newVatCase?: boolean;
        [key: string]: any;
    };
}

type RegistryTitle = string | ((c: RegistryCustomer) => string);

export interface RegistrySubTask {
    id: string;
    title: RegistryTitle;
    isAutoUpdate?: boolean;
    condition?: (c: RegistryCustomer) => boolean;
    getDetails?: (c: RegistryCustomer) => Record<string, any>;
    getCompleted?: (c: RegistryCustomer) => boolean;
    /** Restricts editing this specific subtask to one user (e.g. 'מוישי'). */
    restrictedTo?: string | null;
    /** id of another subtask in the SAME category that must be completed first. */
    dependsOn?: string;
}

export interface RegistryParentTask {
    id: string;
    title: RegistryTitle;
    condition?: (c: RegistryCustomer) => boolean;
    restrictedTo?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    subTasks: RegistrySubTask[];
}

function resolveTitle(title: RegistryTitle, c: RegistryCustomer): string {
    return typeof title === 'function' ? title(c) : title;
}

// -- התאמת תנאי הוראת הקבע למבנה החדש והמנורמל
const directDebitCondition = (c: RegistryCustomer): boolean =>
    (!c.paymentDetails?.directDebit && Number(c.paymentDetails?.monthlyFee) > 0) ||
    !!c.isIncomeTaxActive ||
    !!c.isVatActive ||
    !!c.isInsuranceActive;

const ardeniOpenTitle = (c: RegistryCustomer): string => {
    let title = 'פתיחה בארדני';
    const businessType = c.businessDetails?.businessType;
    if (businessType === 'מורשה') title += ' כמורשה';
    else if (businessType === 'חברה בע"מ') title += ' כחברה בע"מ';
    const caseStartYear = c.businessDetails?.caseStartYear;
    if (caseStartYear) title += ` מ${caseStartYear}`;
    return title;
};

const taxVatTitle = (c: RegistryCustomer): string =>
    c.isIncomeTaxActive && !c.incomeTaxDetails?.spouseFileExists ? 'מס הכנסה ומע"מ' : 'מע"מ';

const itRepCondition = (c: RegistryCustomer): boolean =>
    !!c.isIncomeTaxActive && !c.incomeTaxDetails?.spouseFileExists;

export const AUTO_TASKS_CONFIG: RegistryParentTask[] = [
    {
        id: 'ADMIN_SETUP',
        title: 'הקמה משרדית',
        condition: (): boolean => true,
        subTasks: [
            {
                id: 'excel',
                title: 'הזנת לקוח באקסל',
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'שם לקוח': c.customerDetails?.fullName || 'טרם הוזן',
                    'מספר טלפון': c.customerDetails?.phoneNumber || 'טרם הוזן',
                    'שם עסק': c.businessDetails?.businessName || 'טרם הוזן',
                    'מזהה עסק': c.businessDetails?.businessID || 'טרם הוזן',
                    'סכום פתיחה': `${c.paymentDetails?.setupFee || 0} ₪`,
                }),
            },
            {
                id: 'folder',
                title: 'פתיחת תיקיית לקוח במחשב',
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'שם תיקייה': c.customerDetails?.fullName || 'טרם הוזן'
                }),
            },
            {
                id: 'setup_fee_payment',
                title: 'תשלום עבור פתיחת תיק',
                condition: (c: RegistryCustomer): boolean => Number(c.paymentDetails?.setupFee) > 0,
                getCompleted: (c: RegistryCustomer): boolean => c.paymentDetails?.setupFeePaid === true,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'סכום': `${c.paymentDetails?.setupFee || 0} ₪`,
                    'סטטוס': c.paymentDetails?.setupFeePaid ? 'שולם' : 'טרם שולם',
                }),
            },
            {
                id: 'spouse_case_setup',
                title: 'הקמת תיק לקוח לבן הזוג עבור ייצוג התיק',
                condition: (c: RegistryCustomer): boolean =>
                    !!c.incomeTaxDetails?.spouseFileExists && !!c.incomeTaxDetails?.spouseRepresentationTransferNeeded,
            },
        ],
    },
    {
        id: 'INSURANCE',
        title: 'טיפול מול ביטוח לאומי',
        subTasks: [
            {
                id: 'rep_1',
                title: 'ביטוח לאומי רישום ייצוג בן זוג רשום',
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'מספר תיק': c.insuranceDetails?.insuranceId || 'טרם הוזן'
                })
            },
            {
                id: 'rep_2',
                title: 'ביטוח לאומי רישום ייצוג בן זוג',
                dependsOn: 'rep_1',
            },
            {
                id: 'rep_3',
                title: 'ייצוג ביטוח לאומי בן זוג רשום - אושר',
                dependsOn: 'rep_2',
            },
            {
                id: 'rep_4',
                title: 'ייצוג ביטוח לאומי בן זוג - אושר',
                dependsOn: 'rep_3',
            },
            {
                id: 'open',
                title: 'פתיחת תיק ביטוח לאומי',
                condition: (c: RegistryCustomer): boolean => !!c.insuranceDetails?.newInsuranceCase,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'סטטוס': c.insuranceDetails?.insuranceStatus || 'לא ידוע'
                }),
            },
            {
                id: 'deductions',
                title: 'ביטוח לאומי ייצוג תיק ניכויים',
                condition: (c: RegistryCustomer): boolean => !!c.needsDeductionsFile,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'מספר תיק ניכויים': c.businessDetails?.deductionsId || 'טרם הוזן'
                }),
            },
        ],
    },
    {
        id: 'TAX_VAT',
        title: taxVatTitle,
        condition: (c: RegistryCustomer): boolean => !!c.isIncomeTaxActive || !!c.isVatActive,
        subTasks: [
            {
                id: 'it_rep_1',
                title: 'מס הכנסה רישום ייצוג + שליחה לחתימת לקוח',
                condition: itRepCondition,
            },
            {
                id: 'it_rep_2',
                title: 'ייצוג מס הכנסה נחתם ע"י הלקוח',
                condition: itRepCondition,
                dependsOn: 'it_rep_1',
            },
            {
                id: 'it_rep_3',
                title: 'ייצוג מס הכנסה שודר',
                condition: itRepCondition,
                dependsOn: 'it_rep_2',
            },
            {
                id: 'it_rep_4',
                title: 'ייצוג מס הכנסה נקלט',
                condition: itRepCondition,
                dependsOn: 'it_rep_3',
            },
            {
                id: 'vat_rep_1',
                title: 'מע"מ רישום ייצוג + שליחה לחתימת לקוח',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive,
            },
            {
                id: 'vat_rep_2',
                title: 'ייצוג מע"מ נחתם ע"י הלקוח',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive,
                dependsOn: 'vat_rep_1',
            },
            {
                id: 'vat_rep_3',
                title: 'ייצוג מע"מ שודר',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive,
                dependsOn: 'vat_rep_2',
            },
            {
                id: 'vat_rep_4',
                title: 'ייצוג מע"מ נקלט',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive,
                dependsOn: 'vat_rep_3',
            },
            {
                id: 'it_open',
                title: 'פתיחת תיק מס הכנסה',
                condition: (c: RegistryCustomer): boolean =>
                    !!c.isIncomeTaxActive && !c.incomeTaxDetails?.spouseFileExists && !!c.incomeTaxDetails?.newItCase,
            },
            {
                id: 'vat_open',
                title: 'פתיחת תיק מע"מ',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive && !!c.vatDetails?.newVatCase,
            },
            {
                id: 'it_deductions',
                title: 'מס הכנסה ייצוג ניכויים',
                condition: (c: RegistryCustomer): boolean =>
                    !!c.isIncomeTaxActive && !!c.needsDeductionsFile,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'מספר תיק ניכויים': c.businessDetails?.deductionsId || 'טרם הוזן'
                }),
            },
            {
                id: 'taxCoordination',
                title: 'תיאום מס',
            },
        ],
    },
    {
        id: 'DIRECT_DEBIT',
        title: 'הסדרת הוראות קבע',
        condition: directDebitCondition,
        subTasks: [
            {
                id: 'dd_nii_personal',
                title: 'הסדרת הו"ק ביטוח לאומי אישי',
                condition: (c: RegistryCustomer): boolean => !!c.isInsuranceActive
            },
            {
                id: 'dd_vat',
                title: 'הסדרת הו"ק מע"מ',
                condition: (c: RegistryCustomer): boolean => !!c.isVatActive
            },
            {
                id: 'dd_it',
                title: 'הסדרת הו"ק מס הכנסה',
                condition: (c: RegistryCustomer): boolean =>
                    !!c.isIncomeTaxActive && (c.incomeTaxDetails?.needsIncomeTaxDirectDebit ?? true) === true
            },
            {
                id: 'dd_office',
                title: 'הסדרת הו"ק משרד',
                isAutoUpdate: true,
                condition: (c: RegistryCustomer): boolean => !c.paymentDetails?.directDebit && Number(c.paymentDetails?.monthlyFee) > 0,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({
                    'סכום חודשי': `${c.paymentDetails?.monthlyFee || 0} ש"ח`
                }),
            },
        ],
    },
    {
        id: 'OFFICE_HANDLING',
        title: 'טיפול משרדי',
        condition: (): boolean => true,
        subTasks: [
            {
                id: 'ardeni_open',
                title: ardeniOpenTitle,
            },
            {
                id: 'approve',
                title: 'אישור ע"י המשרד',
                restrictedTo: 'מוישי',
            },
        ],
    },
];

export { resolveTitle };

// bg classes for the 3-4px accent strip (absolute-positioned, right side in RTL)
export const CATEGORY_ACCENT_COLORS: Record<string, string> = {
    ADMIN_SETUP: 'bg-slate-400',
    INSURANCE: 'bg-sky-400',
    TAX_VAT: 'bg-indigo-400',
    DIRECT_DEBIT: 'bg-teal-400',
    OFFICE_HANDLING: 'bg-emerald-500',
};
