// src/constants/taskRegistry.js
//
// Declarative task catalog consumed by TaskGeneratorService. Parent gating for
// service-owned parents (INSURANCE, INCOME_TAX, VAT) is driven by
// CustomerRegistry.SERVICES + BUSINESS_TYPES — NOT by `condition` lambdas
// here. Likewise, subtasks forced exclusively by business type (e.g.
// taxCoordination under INCOME_TAX for זעיר) carry no condition lambda and are
// gated by BUSINESS_TYPES[*].forcedSubtasks in the Registry.
//
// Non-service parents (ADMIN_SETUP / DIRECT_DEBIT / FINAL_APPROVAL) keep their
// own `condition` lambdas because the Registry doesn't model them as services.

const directDebitCondition = (c) =>
    (!c.paymentDetails.directDebit && Number(c.paymentDetails.monthlyFee) > 0)
    || c.isIncomeTaxActive
    || c.isVatActive
    || c.isInsuranceActive;

export const AUTO_TASKS_CONFIG = [
    {
        id: 'ADMIN_SETUP',
        title: 'הקמה אדמיניסטרטיבית',
        condition: () => true,
        subTasks: [
            {
                id: 'excel',
                title: 'הזנת לקוח באקסל',
                getDetails: (c) => ({
                    'שם לקוח': c.customerDetails.fullName || 'טרם הוזן',
                    'מספר טלפון': c.customerDetails.phoneNumber || 'טרם הוזן',
                    'שם עסק': c.businessDetails.businessName || 'טרם הוזן',
                    'מזהה עסק': c.businessDetails.businessID || 'טרם הוזן',
                    'סכום פתיחה': `${c.paymentDetails.setupFee || 0} ₪`,
                }),
            },
            {
                id: 'folder',
                title: 'פתיחת תיקיית לקוח במחשב',
                getDetails: (c) => ({ 'שם תיקייה': c.customerDetails.fullName }),
            },
        ],
    },
    {
        id: 'INSURANCE',
        title: 'טיפול מול ביטוח לאומי',
        // Parent gated by SERVICES.nationalInsurance.activeFlag + BUSINESS_TYPES.forcedParentTasks.
        subTasks: [
            { id: 'rep', title: 'ייצוגים', getDetails: (c) => ({ 'מספר תיק': c.insuranceDetails.insuranceId }) },
            {
                id: 'open',
                title: 'פתיחת תיק',
                condition: (c) => c.isInsuranceActive && c.insuranceDetails.newInsuranceCase,
                getDetails: (c) => ({ 'סטטוס': c.insuranceDetails.insuranceStatus }),
            },
            {
                id: 'deductions',
                title: 'ייצוג תיק ניכויים',
                condition: (c) => c.needsDeductionsFile,
                getDetails: (c) => ({ 'מספר תיק ניכויים': c.businessDetails.deductionsId }),
            },
        ],
    },
    {
        id: 'INCOME_TAX',
        title: 'טיפול מול מס הכנסה',
        // Parent gated by SERVICES.incomeTax.activeFlag + BUSINESS_TYPES['זעיר'].forcedParentTasks.
        subTasks: [
            { id: 'it_rep', title: 'מס הכנסה ייצוגים', condition: (c) => c.isIncomeTaxActive },
            { id: 'it_open', title: 'פתיחת תיק מס הכנסה', condition: (c) => c.isIncomeTaxActive && c.incomeTaxDetails.newItCase },
            // taxCoordination has NO condition — emitted only when forced by
            // BUSINESS_TYPES['זעיר'].forcedSubtasks. The Registry's
            // isSubtaskBusinessTypeGated detects this.
            { id: 'taxCoordination', title: 'תיאום מס' },
        ],
    },
    {
        id: 'VAT',
        title: 'טיפול מול מע"מ',
        // Parent gated by SERVICES.representation.activeFlag.
        subTasks: [
            { id: 'vat_rep', title: 'מע"מ ייצוגים' },
            { id: 'vat_open', title: 'פתיחת תיק מע"מ', condition: (c) => c.isVatActive && c.vatDetails.newVatCase },
        ],
    },
    {
        id: 'DIRECT_DEBIT',
        title: 'הסדרת הוראות קבע',
        condition: directDebitCondition,
        subTasks: [
            { id: 'dd_nii_personal', title: 'הסדרת הו"ק ביטוח לאומי אישי', condition: (c) => c.isInsuranceActive },
            { id: 'dd_vat', title: 'הסדרת הו"ק מע"מ', condition: (c) => c.isVatActive },
            { id: 'dd_it', title: 'הסדרת הו"ק מס הכנסה', condition: (c) => c.isIncomeTaxActive },
            {
                id: 'dd_office',
                title: 'הסדרת הו"ק משרד',
                isAutoUpdate: true,
                condition: (c) => !c.paymentDetails.directDebit && Number(c.paymentDetails.monthlyFee) > 0,
                getDetails: (c) => ({ 'סכום חודשי': `${c.paymentDetails.monthlyFee} ש"ח` }),
            },
        ],
    },
    {
        id: 'FINAL_APPROVAL',
        title: 'אישור ניהולי סופי',
        condition: () => true,
        restrictedTo: 'מוישי',
        subTasks: [
            { id: 'approve', title: 'אישור ע"י המשרד' },
        ],
    },
];
