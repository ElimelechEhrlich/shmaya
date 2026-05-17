import React, { useEffect, useState } from 'react';
import { TaskGeneratorService } from '../services/TaskService.js';
import { useNavigate } from 'react-router';
import FormField from '../comps/FormField.jsx';
import TaskCard from '../comps/TaskCard.jsx';
import { CustomerService } from '../services/CustomerService.js';
import {
    applyBusinessRules,
    isEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
    coerceBool,
    boolToOption,
} from '../registries/CustomerRegistry.ts';

export default function AddCustomer() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        customerDetails: { fullName: '', identityId: '', phoneNumber: '', address: '', email: '' },
        businessDetails: {
            businessName: '', businessID: '', businessType: '', openingDate: '', occupation: '', businessDescription: '', employsWorkers: 'no', deductionsId: ''
        },
        insuranceDetails: { insurancePrepayment: '', workHours: '', newInsuranceCase: true, insuranceId: '', insuranceStatus: '' },
        incomeTaxDetails: { repType: 'ראשי', incomeTaxPrepayment: '', annualTurnover: '', newItCase: true },
        vatDetails: { newVatCase: true },
        paymentDetails: { setupFee: '', monthlyFee: '', directDebit: false },
        isInsuranceActive: false, isIncomeTaxActive: false, isVatActive: false, needsDeductionsFile: false, comments: ''
    });

    const [previewTasks, setPreviewTasks] = useState([]);

    // Single cascade: every formData change is run through the Registry's
    // applyBusinessRules so the same rule set governs creation and edit.
    useEffect(() => {
        const normalized = applyBusinessRules(formData);
        if (JSON.stringify(normalized) !== JSON.stringify(formData)) {
            setFormData(normalized);
        }
    }, [formData]);

    useEffect(() => {
        setPreviewTasks(TaskGeneratorService.generateForCustomer(formData));
    }, [formData]);

    const handleChange = (category, e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [category]: { ...prev[category], [name]: value } }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const result = await CustomerService.saveCustomer(formData, false);
            if (result.success) {
                alert('הלקוח נוסף ותועד במערכת!');
                navigate('/admin/customers');
            } else {
                alert('שגיאה בשמירה: ' + result.error);
            }
        } catch (error) {
            console.error("Error saving data:", error);
            alert('שגיאה בשמירת הנתונים: ' + error.message);
        }
    };

    const showEmployerFields = isEmployerType(formData);

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
                                        {BUSINESS_TYPE_OPTIONS.map(opt => (<option key={opt} value={opt}>{opt}</option>))}
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
                                {isRepresentationAllowed(formData) && (
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
                                                onChange={(e) => setFormData({ ...formData, needsDeductionsFile: e.target.checked })}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>

                        <Card title="תשלומים למשרד" icon="💰">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField label="מחיר פתיחת תיק (₪)">
                                    <input type="number" className="input-style" onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, setupFee: e.target.value } })} />
                                </FormField>
                                <FormField label="מחיר חודשי שוטף (₪)">
                                    <input type="number" className="input-style" onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, monthlyFee: e.target.value, directDebit: Number(e.target.value) > 0 ? formData.paymentDetails.directDebit : false } })} />
                                </FormField>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1 mr-1">הוקם הו״ק?</label>
                                    <div className="flex gap-2 border border-slate-200 rounded-lg items-center p-1.5 bg-slate-50">
                                        <button type="button" onClick={() => Number(formData.paymentDetails.monthlyFee) > 0 && setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: true } })} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${formData.paymentDetails.directDebit ? 'bg-green-600 text-white' : 'bg-white text-slate-400'}`}>כן</button>
                                        <button type="button" onClick={() => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: false } })} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition ${!formData.paymentDetails.directDebit ? 'bg-red-600 text-white' : 'bg-white text-slate-400'}`}>לא</button>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <Card title="הערות" icon="📝">
                            <FormField label="הערות נוספות">
                                <textarea className="input-style h-24" onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}></textarea>
                            </FormField>
                        </Card>

                        <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-bold shadow-lg transition">
                            שמור לקוח והפעל אוטומציית משימות
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
                                    previewTasks.map(task => <TaskCard key={task.id} task={task} currentUser="מוישי" onSubTaskToggle={() => { }} />)
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

// Card wrapper — consistent styling for every form section.
const Card = ({ title, icon, children }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-blue-700 font-black text-[11px] uppercase tracking-[0.2em] mb-5 border-b border-slate-100 pb-2 flex items-center gap-2">
            {icon && <span className="text-base">{icon}</span>}
            {title}
        </h3>
        {children}
    </div>
);

// Toggle header — styled checkbox + label, used for service activation rows.
const ToggleHeader = ({ label, checked, onChange }) => (
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
