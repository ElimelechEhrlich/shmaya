// src/comps/AddCustomer.tsx
import React, { useEffect, useState, useRef } from 'react';
import { TaskGeneratorService } from '../services/TaskService';
import { useNavigate, useLocation } from 'react-router';
import FormField from '../comps/FormField';
import TaskCard from '../comps/TaskCard';
import { CustomerService } from '../services/CustomerService';
import {
    isEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
    CLIENT_TYPE_OPTIONS,
    applyBusinessRules,
    type Customer,
} from '../registries/CustomerRegistry';
import type { NewCustomerPrecheckState } from '../comps/NewCustomerPrecheckModal';
import { useModal } from '../contexts/ModalContext';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { handleLtdCustomerFlow } from '../utils/handleLtdCustomerFlow';
import FilterableSelect from '../comps/FilterableSelect';
import { branchesList } from '../constants/branches';
import WhatsAppIcon from '../comps/WhatsAppIcon';


interface CustomerFormData {
    customerDetails: { fullName: string; identityId: string; phoneNumber: string; address: string; email: string; parentIdNumber: string; hasWhatsapp: boolean; spouseBirthYear: string };
    businessDetails: {
        businessName: string; businessID: string; businessType: string; clientType: string; openingDate: string; occupation: string; businessDescription: string; employsWorkers: string; deductionsId: string; caseStartYear: string; deductionsFileStatus: string;
    };
    insuranceDetails: { insurancePrepayment: string; workHours: string; newInsuranceCase: boolean; insuranceId: string; insuranceStatus: string };
    incomeTaxDetails: { repType: string; incomeTaxPrepayment: string; annualTurnover: string; newItCase: boolean; needsIncomeTaxDirectDebit: boolean; spouseFileExists: boolean; spouseRepresentationTransferNeeded: boolean };
    vatDetails: { newVatCase: boolean };
    paymentDetails: { setupFee: string; monthlyFee: string; directDebit: boolean; setupFeePaid: boolean };
    isInsuranceActive: boolean;
    isIncomeTaxActive: boolean;
    isVatActive: boolean;
    comments: string;
    isActive: boolean;
}

interface CardProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

interface ToggleHeaderProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

type PendingFileField = 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl';

interface PendingFileRowProps {
    label: string;
    file: File | undefined;
    onSelect: (file: File) => void;
    onRemove: () => void;
}

// 'עסק חדש' → true (ברירת המחדל הישנה). כל שאר הערכים, כולל clientType חסר
// (קישור ישיר בלי חלון מקדים) → false, חוץ מ-clientType חסר לגמרי שנשאר true כנפילה בטוחה.
const getNewCaseDefault = (clientType: string | undefined): boolean =>
    clientType === undefined || clientType === '' ? true : clientType === 'עסק חדש';

export default function AddCustomer(): React.ReactElement {
    const navigate = useNavigate();
    const location = useLocation();
    const prefill = (location.state as (
        { fullName?: string; identityId?: string; phoneNumber?: string; address?: string; email?: string }
        & Partial<NewCustomerPrecheckState>
    )) || {};
    const modal = useModal();

    const [formData, setFormData] = useState<CustomerFormData>({
        customerDetails: {
            fullName: prefill.fullName || '',
            identityId: prefill.identityId || '',
            phoneNumber: prefill.phoneNumber || '',
            address: prefill.address || '',
            email: prefill.email || '',
            parentIdNumber: '',
            hasWhatsapp: false,
            spouseBirthYear: '',
        },
        businessDetails: {
            businessName: '', businessID: '', businessType: prefill.businessType || '', clientType: prefill.clientType || '', openingDate: '', occupation: '', businessDescription: '', employsWorkers: prefill.employsWorkers || 'no', deductionsId: '', caseStartYear: '', deductionsFileStatus: prefill.deductionsFileStatus || ''
        },
        insuranceDetails: { insurancePrepayment: '', workHours: '', newInsuranceCase: getNewCaseDefault(prefill.clientType), insuranceId: '', insuranceStatus: '' },
        incomeTaxDetails: {
            repType: 'ראשי', incomeTaxPrepayment: '', annualTurnover: '', newItCase: getNewCaseDefault(prefill.clientType), needsIncomeTaxDirectDebit: true,
            spouseFileExists: prefill.spouseFileExists ?? false, spouseRepresentationTransferNeeded: prefill.spouseRepresentationTransferNeeded ?? false,
        },
        vatDetails: { newVatCase: getNewCaseDefault(prefill.clientType) },
        paymentDetails: { setupFee: '', monthlyFee: '', directDebit: false, setupFeePaid: false },
        isInsuranceActive: prefill.isInsuranceActive ?? false, isIncomeTaxActive: prefill.isIncomeTaxActive ?? false, isVatActive: prefill.isVatActive ?? false, comments: '', isActive: true
    });

    const [previewTasks, setPreviewTasks] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [pendingFiles, setPendingFiles] = useState<Partial<Record<PendingFileField, File>>>({});

    const handleFileSelect = (field: PendingFileField, file: File): void => {
        setPendingFiles(prev => ({ ...prev, [field]: file }));
    };

    const handleFileRemove = (field: PendingFileField): void => {
        setPendingFiles(prev => {
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    // תצוגה מקדימה של משימות בלבד - ללא הפעלת לולאת שינוי הסטייט של הלקוח
    useEffect(() => {
        setPreviewTasks(TaskGeneratorService.generateForCustomer(formData as any));
    }, [formData]);

    const handleChange = (
        category: keyof CustomerFormData | 'root',
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ): void => {
        const { name, value, type } = e.target;
        const finalValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

        if (category === 'root') {
            setFormData(prev => {
                const updated = { ...prev, [name]: finalValue };
                return updated;
            });
        } else {
            setFormData(prev => {
                const updated = {
                    ...prev,
                    [category]: {
                        ...(prev[category] as Record<string, any>),
                        [name]: finalValue
                    }
                };

                // חוק עסק קל ומבוקר בשכבת הקומפוננטה: אם שונה סטטוס העסקת עובדים.
                // בשונה מהישן (needsDeductionsFile) — לא דורס בחירה קיימת, רק ממלא ברירת
                // מחדל כשעדיין ריק (תואם applyBusinessRules ב-handleSubmit).
                if (category === 'businessDetails' && name === 'employsWorkers') {
                    const bd = updated.businessDetails as CustomerFormData['businessDetails'];
                    if (finalValue === 'yes') {
                        if (!bd.deductionsFileStatus) bd.deductionsFileStatus = 'נדרש לפתוח תיק ניכויים';
                    } else {
                        bd.deductionsFileStatus = '';
                    }
                }

                return updated;
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();

        if (!formData.businessDetails.businessName.trim()) {
            alert('⚠️ חובה למלא את שם העסק!');
            return;
        }

        const hasAuthorities = formData.isIncomeTaxActive || formData.isVatActive || formData.isInsuranceActive;
        let dataToSave = { ...formData };

        if (!hasAuthorities) {
            const saveAsInactive = await modal.confirm('לא הגדרת טיפול באף רשות. האם ברצונך לשמור את הלקוח כ"לא פעיל"?');
            if (!saveAsInactive) return;
            dataToSave = { ...dataToSave, isActive: false };
        }

        try {
            setIsSaving(true);
            const cleanedData = applyBusinessRules(dataToSave as unknown as Customer);
            const result = await CustomerService.saveCustomer(cleanedData as unknown as CustomerFormData, false);
            if (result.success) {
                const newCustomerId = result.data.id;
                const fileEntries = Object.entries(pendingFiles) as [PendingFileField, File][];

                if (fileEntries.length > 0) {
                    const FILE_TYPE_MAP: Record<PendingFileField, 'id_photo' | 'bank_approval' | 'agreement'> = {
                        idPhotoUrl: 'id_photo',
                        bankApprovalUrl: 'bank_approval',
                        agreementUrl: 'agreement',
                    };
                    const uploadResults = await Promise.all(
                        fileEntries.map(async ([field, file]) => {
                            const { data: path, error } = await PersistenceAdapter.uploadCustomerFile(newCustomerId, file, FILE_TYPE_MAP[field]);
                            return { field, path, error };
                        })
                    );
                    const patch: Partial<Pick<Customer, 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl'>> = {};
                    uploadResults.forEach(r => { if (r.path) patch[r.field] = r.path; });
                    if (Object.keys(patch).length > 0) {
                        await PersistenceAdapter.updateCustomer(newCustomerId, patch);
                    }
                    const failed = uploadResults.filter(r => r.error || !r.path);
                    if (failed.length > 0) {
                        await modal.alert('הלקוח נשמר בהצלחה, אך העלאת חלק מהמסמכים נכשלה. ניתן להעלות אותם מחדש מתוך כרטיס הלקוח.');
                    }
                }

                if (formData.businessDetails.businessType === 'חברה בע"מ') {
                    await handleLtdCustomerFlow(
                        result.data.id,
                        formData.customerDetails,
                        modal,
                        navigate
                    );
                } else {
                    await modal.alert('הלקוח נוסף ותועד במערכת!');
                    navigate('/admin/customers');
                }
            } else {
                alert('שגיאה בשמירה: ' + result.error);
            }
        } catch (error: any) {
            console.error("Error saving data:", error);
            alert('שגיאה בשמירת הנתונים: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const showEmployerFields = isEmployerType(formData as any);
    const directDebitDisabled = !formData.paymentDetails.monthlyFee || parseFloat(formData.paymentDetails.monthlyFee) <= 0;

    return (
        <div className="p-4 md:p-6 bg-slate-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-3xl font-black text-slate-900">רישום לקוח חדש</h2>
                        <p className="text-sm text-slate-500 mt-1">המשימות נוצרות אוטומטית לפי הנתונים שתזין</p>
                    </div>
                    <button type="button" onClick={() => navigate('/admin/customers')} className="text-slate-400 hover:text-slate-600 font-bold transition">ביטול ←</button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

                    {/* Left: form sections (2/3 width on desktop) */}
                    <div className="lg:col-span-2 space-y-6">

                        <Card title="פרטים אישיים" icon="👤">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="שם מלא"><input name="fullName" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required /></FormField>
                                <FormField label="מספר זהות"><input name="identityId" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required /></FormField>
                                <FormField label="מספר טלפון">
                                    <div className="flex items-center gap-2">
                                        <input name="phoneNumber" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required />
                                        <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="יש וואטסאפ במספר זה">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 cursor-pointer accent-green-600"
                                                checked={formData.customerDetails.hasWhatsapp}
                                                onChange={(e) => setFormData({ ...formData, customerDetails: { ...formData.customerDetails, hasWhatsapp: e.target.checked } })}
                                            />
                                            <WhatsAppIcon size={18} />
                                        </label>
                                    </div>
                                </FormField>
                                <FormField label="כתובת מגורים"><input name="address" className="input-style" onChange={(e) => handleChange('customerDetails', e)} /></FormField>
                                <FormField label="אימייל"><input name="email" type="email" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required /></FormField>
                                <FormField label="ת.ז. הורה"><input name="parentIdNumber" className="input-style" onChange={(e) => handleChange('customerDetails', e)} /></FormField>
                                <FormField label="שנת לידה בן זוג">
                                    <input
                                        type="number"
                                        name="spouseBirthYear"
                                        className="input-style"
                                        value={formData.customerDetails.spouseBirthYear}
                                        onChange={(e) => handleChange('customerDetails', e)}
                                    />
                                </FormField>
                            </div>
                        </Card>

                        <Card title="פרטי עסק" icon="🏢">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="שם העסק"><input name="businessName" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required /></FormField>
                                <FormField label="מזהה עסק"><input name="businessID" className="input-style" onChange={(e) => handleChange('businessDetails', e)} /></FormField>
                              <FormField label="סוג לקוח">
                                <div className="flex flex-col gap-1">
                                    <select
                                        className="input-style cursor-pointer"
                                        value={formData.businessDetails.clientType}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            businessDetails: {
                                                ...formData.businessDetails,
                                                clientType: e.target.value
                                            }
                                        })}
                                    >
                                        <option value="">בחר סוג לקוח...</option>
                                        {CLIENT_TYPE_OPTIONS.map((o) => (
                                            <option key={o} value={o}>{o}</option>
                                        ))}
                                    </select>
                                </div>
                                  </FormField>
                                <FormField label="תאריך פתיחת העסק"><input name="openingDate" type="date" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required={formData.businessDetails.clientType === 'עסק חדש'} /></FormField>
                                <FormField label="שנת תחילת טיפול בתיק"><input name="caseStartYear" type="number" min="2000" max="2100" className="input-style" value={formData.businessDetails.caseStartYear} onChange={(e) => handleChange('businessDetails', e)} /></FormField>
                                    <FormField label="סוג עסק לייצוג">
                                    <FilterableSelect
                                        options={BUSINESS_TYPE_OPTIONS}
                                        value={formData.businessDetails.businessType}
                                        onChange={(v) => setFormData(prev => ({ ...prev, businessDetails: { ...prev.businessDetails, businessType: v } }))}
                                        placeholder="בחר סוג עסק..."
                                    />
                                </FormField>
                                
                                <FormField label="משלח יד">
                                    <FilterableSelect
                                        options={branchesList}
                                        value={formData.businessDetails.occupation}
                                        placeholder="הקלד לחיפוש משלח יד..."
                                        onChange={(val) => {
                                            // יצירת אובייקט אירוע מדומה כדי להשתלב בצורה שקופה בתוך ה-handleChange הקיים שלך
                                            handleChange('businessDetails', {
                                                target: {
                                                    name: 'occupation',
                                                    value: val,
                                                    type: 'text'
                                                }
                                            } as React.ChangeEvent<HTMLInputElement>);
                                        }}
                                    />
                                </FormField>                                <div className="md:col-span-2">
                                    <FormField label="תיאור פעילות העסק">
                                        <textarea name="businessDescription" className="input-style h-20" onChange={(e) => handleChange('businessDetails', e)}></textarea>
                                    </FormField>
                                </div>
                            </div>
                            {(formData.businessDetails.clientType === 'עסק חדש' || formData.businessDetails.clientType === 'לקוח עובר (עסק קיים)') && (
                                <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 cursor-pointer accent-blue-600"
                                            checked={formData.incomeTaxDetails.spouseFileExists}
                                            onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, spouseFileExists: e.target.checked } })}
                                        />
                                        <span className="text-sm font-semibold text-slate-700">תיק בן זוג קיים במס הכנסה</span>
                                    </label>
                                    {formData.incomeTaxDetails.spouseFileExists && (
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                                checked={formData.incomeTaxDetails.spouseRepresentationTransferNeeded}
                                                onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, spouseRepresentationTransferNeeded: e.target.checked } })}
                                            />
                                            <span className="text-sm font-semibold text-slate-700">נדרשת העברת ייצוג תיק בן הזוג</span>
                                        </label>
                                    )}
                                </div>
                            )}
                        </Card>

                        <Card title="מסמכים" icon="📎">
                            <div className="space-y-2">
                                <PendingFileRow
                                    label="צילום ת.ז."
                                    file={pendingFiles.idPhotoUrl}
                                    onSelect={(file) => handleFileSelect('idPhotoUrl', file)}
                                    onRemove={() => handleFileRemove('idPhotoUrl')}
                                />
                                <PendingFileRow
                                    label="אישור ניהול חשבון"
                                    file={pendingFiles.bankApprovalUrl}
                                    onSelect={(file) => handleFileSelect('bankApprovalUrl', file)}
                                    onRemove={() => handleFileRemove('bankApprovalUrl')}
                                />
                                <PendingFileRow
                                    label="הסכם התקשרות"
                                    file={pendingFiles.agreementUrl}
                                    onSelect={(file) => handleFileSelect('agreementUrl', file)}
                                    onRemove={() => handleFileRemove('agreementUrl')}
                                />
                            </div>
                        </Card>

                        <Card title="ביטוח לאומי" icon="🛡️">
                            <ToggleHeader
                                label="טיפול בביטוח לאומי"
                                checked={formData.isInsuranceActive}
                                onChange={(v) => setFormData({ ...formData, isInsuranceActive: v })}
                            />
                            {formData.isInsuranceActive && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                                    <FormField label="תיק ביטוח לאומי חדש">
                                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                                checked={formData.insuranceDetails.newInsuranceCase}
                                                onChange={(e) => setFormData({ ...formData, insuranceDetails: { ...formData.insuranceDetails, newInsuranceCase: e.target.checked } })}
                                            />
                                            <span className="text-sm text-slate-600">{formData.insuranceDetails.newInsuranceCase ? 'כן' : 'לא'}</span>
                                        </label>
                                    </FormField>
                                    <FormField label="מקדמות ביטוח לאומי">
                                        <input name="insurancePrepayment" className="input-style" onChange={(e) => handleChange('insuranceDetails', e)} />
                                    </FormField>
                                    <FormField label="שעות עבודה שבועיות">
                                        <select name="workHours" className="input-style" value={formData.insuranceDetails.workHours} onChange={(e) => handleChange('insuranceDetails', e)}>
                                            <option value="">בחר...</option>
                                            <option value="9">9</option>
                                            <option value="25">25</option>
                                        </select>
                                    </FormField>
                                </div>
                            )}
                        </Card>

                        <Card title="מס הכנסה ומע״מ" icon="💼">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <ToggleHeader
                                    label="טיפול במס הכנסה"
                                    checked={formData.isIncomeTaxActive}
                                    onChange={(v) => setFormData({ ...formData, isIncomeTaxActive: v })}
                                />
                                {isRepresentationAllowed(formData as any) && (
                                    <ToggleHeader
                                        label="טיפול במע״מ"
                                        checked={formData.isVatActive}
                                        onChange={(v) => setFormData({ ...formData, isVatActive: v })}
                                    />
                                )}
                            </div>

                            {(formData.isIncomeTaxActive || formData.isVatActive) && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                                    {formData.isIncomeTaxActive && (
                                        <>
                                            <FormField label="תיק מס הכנסה חדש">
                                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 cursor-pointer accent-blue-600"
                                                        checked={formData.incomeTaxDetails.newItCase}
                                                        onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, newItCase: e.target.checked } })}
                                                    />
                                                    <span className="text-sm text-slate-600">{formData.incomeTaxDetails.newItCase ? 'כן' : 'לא'}</span>
                                                </label>
                                            </FormField>
                                            <FormField label="נדרש הוראת קבע">
                                                <label className="flex items-center gap-2 cursor-pointer mt-1">
                                                    <input
                                                        type="checkbox"
                                                        className="w-5 h-5 cursor-pointer accent-emerald-600"
                                                        checked={formData.incomeTaxDetails.needsIncomeTaxDirectDebit}
                                                        onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, needsIncomeTaxDirectDebit: e.target.checked } })}
                                                    />
                                                    <span className="text-sm text-slate-600">{formData.incomeTaxDetails.needsIncomeTaxDirectDebit ? 'כן' : 'לא'}</span>
                                                </label>
                                            </FormField>
                                            <FormField label="מקדמות מס הכנסה">
                                                <input name="incomeTaxPrepayment" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                                            </FormField>
                                            <FormField label="מחזור שנתי צפוי">
                                                <input name="annualTurnover" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                                            </FormField>
                                            <FormField label="סוג ייצוג">
                                                <select name="repType" value={formData.incomeTaxDetails.repType} className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)}>
                                                    <option value="ראשי">ראשי</option>
                                                    <option value="משני">משני</option>
                                                </select>
                                            </FormField>
                                        </>
                                    )}
                                    {formData.isVatActive && (
                                        <FormField label="תיק מע״מ חדש">
                                            <label className="flex items-center gap-2 cursor-pointer mt-1">
                                                <input
                                                    type="checkbox"
                                                    className="w-5 h-5 cursor-pointer accent-blue-600"
                                                    checked={formData.vatDetails.newVatCase}
                                                    onChange={(e) => setFormData({ ...formData, vatDetails: { ...formData.vatDetails, newVatCase: e.target.checked } })}
                                                />
                                                <span className="text-sm text-slate-600">{formData.vatDetails.newVatCase ? 'כן' : 'לא'}</span>
                                            </label>
                                        </FormField>
                                    )}
                                </div>
                            )}

                            {showEmployerFields && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 mt-4 rounded-xl border border-blue-100">
                                    <FormField label="האם מעסיק עובדים?">
                                        <select name="employsWorkers" value={formData.businessDetails.employsWorkers} className="input-style" onChange={(e) => handleChange('businessDetails', e)}>
                                            <option value="no">לא</option>
                                            <option value="yes">כן</option>
                                        </select>
                                    </FormField>
                                    {formData.businessDetails.employsWorkers === 'yes' && (
                                        <FormField label="סטטוס תיק ניכויים">
                                            <select
                                                name="deductionsFileStatus"
                                                className="input-style"
                                                value={formData.businessDetails.deductionsFileStatus}
                                                onChange={(e) => handleChange('businessDetails', e)}
                                            >
                                                <option value="נדרש לפתוח תיק ניכויים">נדרש לפתוח תיק ניכויים</option>
                                                <option value="תיק ניכויים כבר קיים">תיק ניכויים כבר קיים</option>
                                            </select>
                                        </FormField>
                                    )}
                                </div>
                            )}
                        </Card>

                        <Card title="תשלומים למשרד" icon="💰">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField label="מחיר פתיחת תיק (₪)">
                                    <input name="setupFee" type="number" className="input-style" onChange={(e) => handleChange('paymentDetails', e)} />
                                    {parseFloat(formData.paymentDetails.setupFee) > 0 && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <input
                                                type="checkbox"
                                                id="setupFeePaid"
                                                checked={formData.paymentDetails.setupFeePaid}
                                                onChange={(e) => setFormData(prev => ({ ...prev, paymentDetails: { ...prev.paymentDetails, setupFeePaid: e.target.checked } }))}
                                                className="w-4 h-4 accent-green-600 cursor-pointer"
                                            />
                                            <label htmlFor="setupFeePaid" className="text-xs font-bold text-green-700 cursor-pointer">שולם</label>
                                        </div>
                                    )}
                                </FormField>
                                <FormField label="מחיר חודשי שוטף (₪)">
                                    <input name="monthlyFee" type="number" className="input-style" onChange={(e) => handleChange('paymentDetails', e)} />
                                </FormField>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1 mr-1">הוקם הו״ק?</label>
                                    <div className={`flex gap-2 border rounded-lg items-center p-1.5 ${directDebitDisabled ? 'bg-slate-100 border-slate-200 opacity-50' : 'bg-slate-50 border-slate-200'}`}>
                                        <button type="button" disabled={directDebitDisabled} onClick={() => setFormData(prev => ({ ...prev, paymentDetails: { ...prev.paymentDetails, directDebit: true } }))} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${formData.paymentDetails.directDebit ? 'bg-green-600 text-white' : 'bg-white text-slate-400'} ${directDebitDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>כן</button>
                                        <button type="button" disabled={directDebitDisabled} onClick={() => setFormData(prev => ({ ...prev, paymentDetails: { ...prev.paymentDetails, directDebit: false } }))} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${!formData.paymentDetails.directDebit ? 'bg-red-600 text-white' : 'bg-white text-slate-400'} ${directDebitDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>לא</button>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card title="הערות" icon="📝">
                            <FormField label="הערות נוספות">
                                <textarea name="comments" className="input-style h-24" onChange={(e) => handleChange('root', e)}></textarea>
                            </FormField>
                        </Card>

                        <button type="submit" disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60">
                            {isSaving ? 'שומר, נא להמתין...' : 'שמור לקוח והפעל אוטומציית משימות'}
                        </button>
                    </div>

                    {/* Right: sticky task preview (1/3 width on desktop) */}
                    <div className="self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1 lg:sticky lg:top-6">
                        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700">תצוגת משימות</h3>
                            <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{previewTasks.length}</span>
                        </div>
                        <div className="space-y-3 pl-1 lg:max-h-[calc(100vh-13.5rem)] lg:overflow-y-auto">
                            {previewTasks.length > 0 ? (
                                previewTasks.map((task: any) => <TaskCard key={task.id} task={task} currentUser="מוישי" onSubTaskToggle={() => { }} />)
                            ) : (
                                <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                                    הזן נתונים כדי לראות את המשימות שייווצרו
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

const Card: React.FC<CardProps> = ({ title, icon, children }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-blue-700 font-black text-[11px] uppercase tracking-[0.2em] mb-5 border-b border-slate-100 pb-2 flex items-center gap-2">
            {icon && <span className="text-base">{icon}</span>}
            {title}
        </h3>
        {children}
    </div>
);

const PendingFileRow: React.FC<PendingFileRowProps> = ({ label, file, onSelect, onRemove }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
            <div className="min-w-0">
                <span className="text-sm font-bold text-slate-700 block">{label}</span>
                {file && <span className="text-xs text-slate-500 truncate block max-w-[220px]">{file.name}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg border border-slate-200 transition"
                >
                    {file ? 'החלפה' : 'בחירה'}
                </button>
                {file && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="cursor-pointer text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg transition"
                    >
                        הסרה
                    </button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) onSelect(f);
                    }}
                />
            </div>
        </div>
    );
};

const ToggleHeader: React.FC<ToggleHeaderProps> = ({ label, checked, onChange }) => (
    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${checked ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
        <input
            type="checkbox"
            className="w-5 h-5 cursor-pointer accent-blue-600"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
        />
        <span className={`text-sm font-bold ${checked ? 'text-blue-700' : 'text-slate-600'}`}>{label}</span>
    </label>
);
