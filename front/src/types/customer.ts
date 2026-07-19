// --- טיפוסי לקוחות ---
export interface CustomerBase {
    id?: string;
    fullName: string;
    identityId: string;
    phoneNumber: string;
    address: string;
    email: string;
    parentIdNumber: string;
    hasWhatsapp: boolean;
    spouseBirthYear: string;
}

export interface BusinessDetails {
    businessName: string;
    businessID: string;
    businessType: string;
    clientType: string;
    openingDate: string;
    occupation: string;
    businessDescription: string;
    employsWorkers: string;
    deductionsId: string;
    caseStartYear: string;
    deductionsFileStatus: string;
}

export interface IncomeTaxCase {
    repType: string;
    incomeTaxPrepayment: string;
    annualTurnover: string;
    newItCase: boolean;
    needsIncomeTaxDirectDebit: boolean;
    spouseFileExists: boolean;
    spouseRepresentationTransferNeeded: boolean;
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
    comments: string;
    isActive: boolean;
    idPhotoUrl?: string;
    bankApprovalUrl?: string;
    agreementUrl?: string;
}
