// src/comps/AddCustomer.tsx
import React, { useEffect, useState } from 'react';
import { TaskGeneratorService } from '../services/TaskService';
import { useNavigate } from 'react-router';
import FormField from '../comps/FormField';
import TaskCard from '../comps/TaskCard';
import { CustomerService } from '../services/CustomerService';
import {
    isEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
    coerceBool,
    boolToOption,
    applyBusinessRules,
    type Customer,
} from '../registries/CustomerRegistry';

interface CustomerFormData {
    customerDetails: { fullName: string; identityId: string; phoneNumber: string; address: string; email: string };
    businessDetails: {
        businessName: string; businessID: string; businessType: string; openingDate: string; occupation: string; businessDescription: string; employsWorkers: string; deductionsId: string;
    };
    insuranceDetails: { insurancePrepayment: string; workHours: string; newInsuranceCase: boolean; insuranceId: string; insuranceStatus: string };
    incomeTaxDetails: { repType: string; incomeTaxPrepayment: string; annualTurnover: string; newItCase: boolean };
    vatDetails: { newVatCase: boolean };
    paymentDetails: { setupFee: string; monthlyFee: string; directDebit: boolean };
    isInsuranceActive: boolean;
    isIncomeTaxActive: boolean;
    isVatActive: boolean;
    needsDeductionsFile: boolean;
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

export default function AddCustomer(): React.ReactElement {
    const navigate = useNavigate();

    const [formData, setFormData] = useState<CustomerFormData>({
        customerDetails: { fullName: '', identityId: '', phoneNumber: '', address: '', email: '' },
        businessDetails: {
            businessName: '', businessID: '', businessType: '', openingDate: '', occupation: '', businessDescription: '', employsWorkers: 'no', deductionsId: ''
        },
        insuranceDetails: { insurancePrepayment: '', workHours: '', newInsuranceCase: true, insuranceId: '', insuranceStatus: '' },
        incomeTaxDetails: { repType: 'ראשי', incomeTaxPrepayment: '', annualTurnover: '', newItCase: true },
        vatDetails: { newVatCase: true },
        paymentDetails: { setupFee: '', monthlyFee: '', directDebit: false },
        isInsuranceActive: false, isIncomeTaxActive: false, isVatActive: false, needsDeductionsFile: false, comments: '', isActive: true
    });

    const [previewTasks, setPreviewTasks] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState<boolean>(false);

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

                // חוק עסק קל ומבוקר בשכבת הקומפוננטה: אם שונה סטטוס העסקת עובדים
                if (category === 'businessDetails' && name === 'employsWorkers') {
                    updated.needsDeductionsFile = finalValue === 'yes';
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
            const saveAsInactive = window.confirm('⚠️ לא הגדרת טיפול באף רשות. האם ברצונך לשמור את הלקוח כ"לא פעיל"?');
            if (!saveAsInactive) return;
            dataToSave = { ...dataToSave, isActive: false };
        }
        
        try {
            setIsSaving(true);
            const cleanedData = applyBusinessRules(dataToSave as unknown as Customer);
            const result = await CustomerService.saveCustomer(cleanedData as unknown as CustomerFormData, false);
            if (result.success) {
                alert('הלקוח נוסף ותועד במערכת!');
                navigate('/admin/customers');
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

    return (
        <div className="p-6 bg-slate-50 min-h-screen" dir="rtl">
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
                                <FormField label="מספר טלפון"><input name="phoneNumber" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required /></FormField>
                                <FormField label="כתובת מגורים"><input name="address" className="input-style" onChange={(e) => handleChange('customerDetails', e)} /></FormField>
                                <FormField label="אימייל"><input name="email" type="email" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required /></FormField>
                            </div>
                        </Card>

                        <Card title="פרטי עסק" icon="🏢">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField label="שם העסק"><input name="businessName" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required /></FormField>
                                <FormField label="מזהה עסק"><input name="businessID" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required /></FormField>
                                <FormField label="תאריך פתיחת העסק"><input name="openingDate" type="date" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required /></FormField>
                                <FormField label="סוג עסק לייצוג">
                                    <select name="businessType" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required>
                                        <option value="">בחר סוג עסק...</option>
                                        {BUSINESS_TYPE_OPTIONS.map((opt: string) => (<option key={opt} value={opt}>{opt}</option>))}
                                    </select>
                                </FormField>
                                <FormField label="משלח יד"><input name="occupation" className="input-style" onChange={(e) => handleChange('businessDetails', e)} /></FormField>
                                <div className="md:col-span-2">
                                    <FormField label="תיאור פעילות העסק">
                                        <textarea name="businessDescription" className="input-style h-20" onChange={(e) => handleChange('businessDetails', e)}></textarea>
                                    </FormField>
                                </div>
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
                                        <select name="newInsuranceCase" className="input-style"
                                            value={boolToOption(formData.insuranceDetails.newInsuranceCase)}
                                            onChange={(e) => setFormData({ ...formData, insuranceDetails: { ...formData.insuranceDetails, newInsuranceCase: coerceBool(e.target.value) } })}
                                            required>
                                            <option value={boolToOption(true)}>כן</option>
                                            <option value={boolToOption(false)}>לא</option>
                                        </select>
                                    </FormField>
                                    <FormField label="מקדמות ביטוח לאומי">
                                        <input name="insurancePrepayment" className="input-style" onChange={(e) => handleChange('insuranceDetails', e)} />
                                    </FormField>
                                    <FormField label="סך שעות עבודה">
                                        <input name="workHours" className="input-style" onChange={(e) => handleChange('insuranceDetails', e)} />
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
                                                <select name="newItCase" className="input-style"
                                                    value={boolToOption(formData.incomeTaxDetails.newItCase)}
                                                    onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, newItCase: coerceBool(e.target.value) } })}
                                                    required>
                                                    <option value={boolToOption(true)}>כן</option>
                                                    <option value={boolToOption(false)}>לא</option>
                                                </select>
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
                                            <select name="newVatCase" className="input-style"
                                                value={boolToOption(formData.vatDetails.newVatCase)}
                                                onChange={(e) => setFormData({ ...formData, vatDetails: { ...formData.vatDetails, newVatCase: coerceBool(e.target.value) } })}
                                                required>
                                                <option value={boolToOption(true)}>כן</option>
                                                <option value={boolToOption(false)}>לא</option>
                                            </select>
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
                                        <div className="flex items-center gap-3 self-end pb-2">
                                            <label className="text-sm font-semibold cursor-pointer">תיק ניכויים נדרש?</label>
                                            <input
                                                type="checkbox"
                                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                                checked={formData.needsDeductionsFile}
                                                name="needsDeductionsFile"
                                                onChange={(e) => handleChange('root', e)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>

                        <Card title="תשלומים למשרד" icon="💰">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField label="מחיר פתיחת תיק (₪)">
                                    <input name="setupFee" type="number" className="input-style" onChange={(e) => handleChange('paymentDetails', e)} />
                                </FormField>
                                <FormField label="מחיר חודשי שוטף (₪)">
                                    <input name="monthlyFee" type="number" className="input-style" onChange={(e) => handleChange('paymentDetails', e)} />
                                </FormField>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1 mr-1">הוקם הו״ק?</label>
                                    <div className="flex gap-2 border border-slate-200 rounded-lg items-center p-1.5 bg-slate-50">
                                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, paymentDetails: { ...prev.paymentDetails, directDebit: true } }))} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${formData.paymentDetails.directDebit ? 'bg-green-600 text-white' : 'bg-white text-slate-400'}`}>כן</button>
                                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, paymentDetails: { ...prev.paymentDetails, directDebit: false } }))} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${!formData.paymentDetails.directDebit ? 'bg-red-600 text-white' : 'bg-white text-slate-400'}`}>לא</button>
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
                    <div className="lg:col-span-1">
                        <div className="lg:sticky lg:top-6 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                                <h3 className="text-blue-700 font-black text-[11px] uppercase tracking-[0.2em]">תצוגת משימות</h3>
                                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold border border-blue-100">{previewTasks.length}</span>
                            </div>
                            <div className="space-y-3 max-h-[70vh] overflow-y-auto pl-1">
                                {previewTasks.length > 0 ? (
                                    previewTasks.map((task: any) => <TaskCard key={task.id} task={task} currentUser="מוישי" onSubTaskToggle={() => { }} />)
                                ) : (
                                    <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-sm">
                                        הזן נתונים כדי לראות את המשימות שייווצרו
                                    </div>
                                )}
                            </div>
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