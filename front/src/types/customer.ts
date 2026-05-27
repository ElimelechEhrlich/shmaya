// --- טיפוסי לקוחות ---
export interface CustomerBase {
    id?: string;
    fullName: string;
    identityId: string;
    phoneNumber: string;
    address: string;
    email: string;
    isActive: boolean;
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
    needsDeductionsFile: boolean;
}

export interface IncomeTaxCase {
    repType: string;
    incomeTaxPrepayment: string;
    annualTurnover: string;
    newItCase: boolean;
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