const directDebitCondition = (c) => (!c.paymentDetails.directDebit && Number(c.paymentDetails.monthlyFee) > 0) || c.isIncomeTaxActive || c.isVatActive || c.isInsuranceActive

export const AUTO_TASKS_CONFIG = [
    {
        id: 'ADMIN_SETUP',
        title: 'הקמה אדמיניסטרטיבית',
        condition: () => true,
        subTasks: [
            {
                id: 'excel',
                title: 'הזנת לקוח באקסל',
                // כאן הנתונים נלקחים ישירות מהלקוח
                getDetails: (c) => ({
                    'שם לקוח': c.customerDetails.fullName || 'טרם הוזן',
                    'מספר טלפון': c.customerDetails.phoneNumber || 'טרם הוזן',
                    'שם עסק': c.businessDetails.businessName || 'טרם הוזן',
                    'מזהה עסק': c.businessDetails.businessID || 'טרם הוזן',
                    'סכום פתיחה': `${c.paymentDetails.setupFee || 0} ₪`
                })
            },
            {
                id: 'folder',
                title: 'פתיחת תיקיית לקוח במחשב',
                getDetails: (c) => ({ 'שם תיקייה': c.customerDetails.fullName })
            }

        ]
    },
    {
        id: 'INSURANCE',
        title: 'טיפול מול ביטוח לאומי',
        // תנאי: אם סומן TRUE בביטוח לאומי בטופס
        condition: (c) => c.isInsuranceActive,
        subTasks: [
            { id: 'rep', title: 'ייצוגים', getDetails: (c) => ({ 'מספר תיק': c.insuranceDetails.insuranceId }) },
            { id: 'open', title: 'פתיחת תיק', getDetails: (c) => ({ 'סטטוס': c.insuranceDetails.insuranceStatus}), condition: (c) => c.isInsuranceActive && c.insuranceDetails.newInsuranceCase } ,
            {
                id: 'deductions', title: 'ייצוג תיק ניכויים',
                condition: (c) => c.needsDeductionsFile, // רק אם יש תיק ניכויים
                getDetails: (c) => ({ 'מספר תיק ניכויים': c.businessDetails.deductionsId })
            }
        ]
    },
    {
        id: 'INCOME_TAX',
        title: 'טיפול מול מס הכנסה',
        condition: (c) => c.isIncomeTaxActive || c.businessDetails.businessType === 'זעיר',
        subTasks: [
            { id: 'it_rep', title: 'מס הכנסה ייצוגים', condition: (c) => c.isIncomeTaxActive },
            { id: 'it_open', title: 'פתיחת תיק מס הכנסה', condition: (c) => c.isIncomeTaxActive && c.incomeTaxDetails.newItCase},
            { id: 'taxCoordination', title: 'תיאום מס', condition: (c) => c.businessDetails.businessType === 'זעיר' }
        ]
    },
    {
        id: 'VAT',
        title: 'טיפול מול מע"מ',
        condition: (c) => c.isVatActive,
        subTasks: [
            { id: 'vat_rep', title: 'מע"מ ייצוגים' },
            { id: 'vat_open', title: 'פתיחת תיק מע"מ', condition: (c) => c.isVatActive && c.vatDetails.newVatCase}
        ]
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
                id: 'dd_office', title: 'הסדרת הו"ק משרד',
                isAutoUpdate: true, // לוגיקה לעדכון ה-DB שסודר הו"ק
                condition: (c) => !c.paymentDetails.directDebit && Number(c.paymentDetails.monthlyFee) > 0,
                getDetails: (c) => ({ 'סכום חודשי': `${c.paymentDetails.monthlyFee} ש"ח` })
            }
        ]
    },
    {
        id: 'FINAL_APPROVAL',
        title: 'אישור ניהולי סופי',
        condition: () => true,
        restrictedTo: 'מוישי',
        subTasks: [
            { id: 'approve', title: 'אישור ע"י המשרד' }
        ]
    }
];