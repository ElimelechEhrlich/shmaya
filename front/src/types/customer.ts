// --- טיפוסי לקוחות ---
export interface CustomerBase {
    id?: string;
    fullName: string;
    identityId: string;
    phoneNumber: string;
    address: string;
    email: string;
    isActive: boolean;
    // DEAD FIELD — never read by formDataToCustomer or any service code.
    // The real value always comes from the top-level CustomerFormData.comments field.
    comments: string;
}

export interface BusinessDetails {
    businessName: string;
    businessID: string;
    businessType: string;
    openingDate: string;
    occupation: string;
    businessDescription: string;
    employsWorkers: string;
    deductionsId: string;
    // DEAD FIELD — never read by formDataToCustomer or any service code.
    // The real value always comes from the top-level CustomerFormData.needsDeductionsFile field.
    needsDeductionsFile: boolean;
}

export interface IncomeTaxCase {
    repType: string;
    incomeTaxPrepayment: string;
    annualTurnover: string;
    newItCase: boolean;
    needsIncomeTaxDirectDebit: boolean;
}

export interface VatCase {
    newVatCase: boolean;
}

export interface InsuranceCase {
    insurancePrepayment: string;
    workHours: string;
    newInsuranceCase: boolean;
}

export interface PaymentDetails {
    setupFee: string;
    monthlyFee: string;
    directDebit: boolean;
    setupFeePaid: boolean;
}

export interface CustomerFormData {
    customerDetails: CustomerBase;
    businessDetails: BusinessDetails;
    insuranceDetails: InsuranceCase;
    incomeTaxDetails: IncomeTaxCase;
    vatDetails: VatCase;
    paymentDetails: PaymentDetails;
    isInsuranceActive: boolean;
    isIncomeTaxActive: boolean;
    isVatActive: boolean;
    needsDeductionsFile: boolean;
    comments: string;
    isActive: boolean;
}