// src/constants/taskRegistry.ts
//
// Declarative task catalog consumed by TaskGeneratorService. Parent gating for
// service-owned parents (INSURANCE, INCOME_TAX, VAT) is driven by
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
        deductionsId?: string;
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
        [key: string]: any;
    };
    vatDetails?: {
        newVatCase?: boolean;
        [key: string]: any;
    };
}

export interface RegistrySubTask {
    id: string;
    title: string;
    isAutoUpdate?: boolean;
    condition?: (c: RegistryCustomer) => boolean;
    getDetails?: (c: RegistryCustomer) => Record<string, any>;
    getCompleted?: (c: RegistryCustomer) => boolean;
}

export interface RegistryParentTask {
    id: string;
    title: string;
    condition?: (c: RegistryCustomer) => boolean;
    restrictedTo?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    subTasks: RegistrySubTask[];
}

// -- התאמת תנאי הוראת הקבע למבנה החדש והמנורמל
const directDebitCondition = (c: RegistryCustomer): boolean =>
    (!c.paymentDetails?.directDebit && Number(c.paymentDetails?.monthlyFee) > 0) ||
    !!c.isIncomeTaxActive ||
    !!c.isVatActive ||
    !!c.isInsuranceActive;

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
        ],
    },
    {
        id: 'INSURANCE',
        title: 'טיפול מול ביטוח לאומי',
        // -- הגנה ברמת האב: מופעל רק אם קיימת שורה פעילה בטבלת ביטוח לאומי
        condition: (c: RegistryCustomer): boolean => !!c.isInsuranceActive,
        subTasks: [
            { 
                id: 'rep', 
                title: 'ייצוגים', 
                getDetails: (c: RegistryCustomer): Record<string, any> => ({ 
                    'מספר תיק': c.insuranceDetails?.insuranceId || 'טרם הוזן' 
                }) 
            },
            {
                id: 'open',
                title: 'פתיחת תיק',
                condition: (c: RegistryCustomer): boolean => !!c.insuranceDetails?.newInsuranceCase,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({ 
                    'סטטוס': c.insuranceDetails?.insuranceStatus || 'לא ידוע' 
                }),
            },
            {
                id: 'deductions',
                title: 'ייצוג תיק ניכויים',
                condition: (c: RegistryCustomer): boolean => !!c.needsDeductionsFile,
                getDetails: (c: RegistryCustomer): Record<string, any> => ({ 
                    'מספר תיק ניכויים': c.businessDetails?.deductionsId || 'טרם הוזן' 
                }),
            },
        ],
    },
    {
        id: 'VAT',
        title: 'טיפול מול מע"מ',
        condition: (c: RegistryCustomer): boolean => !!c.isVatActive,
        subTasks: [
            { id: 'vat_rep', title: 'מע"מ ייצוגים' },
            {
                id: 'vat_open',
                title: 'פתיחת תיק מע"מ',
                condition: (c: RegistryCustomer): boolean => !!c.vatDetails?.newVatCase
            },
        ],
    },
    {
        id: 'INCOME_TAX',
        title: 'טיפול מול מס הכנסה',
        condition: (c: RegistryCustomer): boolean => !!c.isIncomeTaxActive,
        subTasks: [
            {
                id: 'it_rep',
                title: 'מס הכנסה ייצוגים'
            },
            {
                id: 'it_open',
                title: 'פתיחת תיק מס הכנסה',
                condition: (c: RegistryCustomer): boolean => !!c.incomeTaxDetails?.newItCase
            },
            {
                id: 'taxCoordination',
                title: 'תיאום מס'
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
        id: 'FINAL_APPROVAL',
        title: 'אישור ניהולי סופי',
        condition: (): boolean => true,
        restrictedTo: 'מוישי',
        subTasks: [
            { id: 'approve', title: 'אישור ע"י המשרד' },
        ],
    },
];