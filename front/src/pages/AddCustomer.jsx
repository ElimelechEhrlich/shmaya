import React, { useEffect, useState } from 'react'
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
        incomeTaxDetails: { repType: 'ראשי', incomeTaxPrepayment: '', annualTurnover: '', newItCase: true},
        vatDetails: { newVatCase: true },
        paymentDetails: { setupFee: '', monthlyFee: '', directDebit: false },
        isInsuranceActive: false, isIncomeTaxActive: false, isVatActive: false, needsDeductionsFile: false, comments: ''
    });

    const [previewTasks, setPreviewTasks] = useState([]);

    // Single cascade: every formData change is run through the Registry's
    // applyBusinessRules so the same rule set governs creation and edit
    // (replaces the legacy needsDeductionsFile ratchet — audit §4 #4).
    // applyBusinessRules is idempotent, so the JSON.stringify guard prevents
    // a re-render loop when the input already satisfies the rules.
    useEffect(() => {
        const normalized = applyBusinessRules(formData);
        if (JSON.stringify(normalized) !== JSON.stringify(formData)) {
            setFormData(normalized);
        }
    }, [formData]);

    useEffect(() => {
        const tasks = TaskGeneratorService.generateForCustomer(formData);
        setPreviewTasks(tasks);
    }, [formData]);

    // handleChange המקורי והעובד שלך
    const handleChange = (category, e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [category]: { ...prev[category], [name]: value } }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // כאן אנחנו משתמשים ב-Service רק לצורך השמירה והלוגים, 
        // בלי שהוא ינהל את ה-State של הטופס
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
        <div className="max-w-4xl mx-auto bg-white p-10 rounded-2xl shadow-xl border border-slate-100 mb-10" dir="rtl">
            <div className="flex justify-between items-center mb-10 border-b pb-6">
                <h2 className="text-3xl font-black text-slate-800">רישום לקוח חדש</h2>
                <button onClick={() => navigate('/admin/customers')} className="text-slate-400 hover:text-slate-600 transition">ביטול</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">

                {/* פרטים אישיים */}
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-blue-600 border-b pb-2">פרטים אישיים</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="שם מלא">
                            <input name="fullName" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required />
                        </FormField>
                        <FormField label="מספר זהות">
                            <input name="identityId" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required />
                        </FormField>
                        <FormField label="מספר טלפון">
                            <input name="phoneNumber" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required />
                        </FormField>
                        <FormField label="כתובת מגורים">
                            <input name="address" className="input-style" onChange={(e) => handleChange('customerDetails', e)} />
                        </FormField>
                        <FormField label="כתובת אימייל">
                            <input name="email" type="email" className="input-style" onChange={(e) => handleChange('customerDetails', e)} required />
                        </FormField>
                    </div>
                </section>

                {/* פרטי עסק */}
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-blue-600 border-b pb-2">פרטי עסק</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField label="שם העסק">
                            <input name="businessName" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required />
                        </FormField>
                        <FormField label="מזהה עסק">
                            <input name="businessID" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required />
                        </FormField>
                        <FormField label="תאריך פתיחת העסק">
                            <input name="openingDate" type="date" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required />
                        </FormField>
                        <FormField label="סוג עסק לייצוג">
                            <select name="businessType" className="input-style" onChange={(e) => handleChange('businessDetails', e)} required>
                                <option value="">בחר סוג עסק...</option>
                                {BUSINESS_TYPE_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="משלח יד">
                            <input name="occupation" className="input-style" onChange={(e) => handleChange('businessDetails', e)} />
                        </FormField>
                        <div className="col-span-full">
                            <FormField label="תיאור פעילות העסק">
                                <textarea name="businessDescription" className="input-style h-24" onChange={(e) => handleChange('businessDetails', e)}></textarea>
                            </FormField>
                        </div>
                    </div>
                </section>

                {/* ביטוח לאומי */}
                <section className="space-y-4">
                    <div className={`flex items-center gap-3 ${formData.isInsuranceActive && 'text-blue-600'} border-b pb-3`}>
                        <input
                            type="checkbox"
                            id="insuranceToggle"
                            className="w-5 h-5 cursor-pointer accent-blue-600"
                            checked={formData.isInsuranceActive}
                            onChange={(e) => setFormData({ ...formData, isInsuranceActive: e.target.checked })}
                        />
                        <label htmlFor="insuranceToggle" className="text-lg font-semibold cursor-pointer">טיפול בביטוח לאומי</label>
                    </div>
                    {formData.isInsuranceActive && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                </section>

                {/* מס הכנסה ומע"מ */}
                <section className="space-y-4">
                    <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${(formData.isIncomeTaxActive || formData.isVatActive) && 'text-blue-600'} border-b pb-3`}>
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="incomeTaxToggle"
                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                checked={formData.isIncomeTaxActive}
                                onChange={(e) => setFormData({ ...formData, isIncomeTaxActive: e.target.checked })}
                            />
                            <label htmlFor="incomeTaxToggle" className="text-lg font-semibold cursor-pointer">טיפול במס הכנסה</label>
                        </div>
                        {isRepresentationAllowed(formData) && (
                            <div className="flex items-center justify-center gap-3">
                                <input
                                    type="checkbox"
                                    id="isVatActiveToggle"
                                    className="w-5 h-5 cursor-pointer accent-blue-600"
                                    checked={formData.isVatActive}
                                    onChange={(e) => setFormData({ ...formData, isVatActive: e.target.checked })}
                                />
                                <label htmlFor="isVatActiveToggle" className="text-lg font-semibold cursor-pointer">טיפול במע"מ</label>
                            </div>
                        )}
                    </div>

                    {(formData.isIncomeTaxActive || formData.isVatActive) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {formData.isIncomeTaxActive && (
                                <FormField label="תיק מס הכנסה חדש">
                                    <select name="newItCase" className="input-style"
                                        value={boolToOption(formData.incomeTaxDetails.newItCase)}
                                        onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, newItCase: coerceBool(e.target.value) } })}
                                        required>
                                        <option value={boolToOption(true)}>כן</option>
                                        <option value={boolToOption(false)}>לא</option>
                                    </select>
                                </FormField>
                            )}
                            {formData.isVatActive && (
                                <FormField label="תיק מע'מ חדש">
                                    <select name="newVatCase" className="input-style"
                                        value={boolToOption(formData.vatDetails.newVatCase)}
                                        onChange={(e) => setFormData({ ...formData, vatDetails: { ...formData.vatDetails, newVatCase: coerceBool(e.target.value) } })}
                                        required>
                                        <option value={boolToOption(true)}>כן</option>
                                        <option value={boolToOption(false)}>לא</option>
                                    </select>
                                </FormField>
                            )}
                            {formData.isIncomeTaxActive && (
                                <>
                                    <FormField label="מקדמות מס הכנסה">
                                        <input name="incomeTaxPrepayment" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                                    </FormField>
                                    <FormField label="מחזור שנתי צפוי">
                                        <input name="annualTurnover" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                                    </FormField>
                                    <FormField label="סוג ייצוג">
                                        <select name="repType" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)}>
                                            <option value="ראשי">ראשי</option><option value="משני">משני</option>
                                        </select>
                                    </FormField>
                                </>
                            )}

                            {showEmployerFields && (
                                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-6 rounded-xl border border-blue-100">
                                    <FormField label="האם מעסיק עובדים?">
                                        <select name="employsWorkers" value={formData.businessDetails.employsWorkers} className="input-style" onChange={(e) => handleChange('businessDetails', e)}>
                                            <option value="no">לא</option><option value="yes">כן</option>
                                        </select>
                                    </FormField>
                                    {formData.businessDetails.employsWorkers === 'yes' && (
                                        <div className="flex items-center justify-center gap-3">
                                            <label className="text-lg font-semibold cursor-pointer">האם נדרש פתיחת תיק ניכויים?</label>
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
                        </div>
                    )}
                </section>

                {/* תשלומים */}
                <section className="space-y-4 bg-slate-50 p-6 rounded-xl border-blue-300 border-t-1 border-b-1">
                    <h3 className="text-lg font-semibold flex items-center gap-2"><span className="bg-blue-600 w-2 h-6 rounded-full inline-block"></span>תשלומים</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField label="מחיר פתיחת תיק (₪)">
                            <input type="number" className="input-style" onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, setupFee: e.target.value } })} />
                        </FormField>
                        <FormField label="מחיר חודשי שוטף (₪)">
                            <input type="number" className="input-style" onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, monthlyFee: e.target.value, directDebit: Number(e.target.value) > 0 ? formData.paymentDetails.directDebit : false } })} />
                        </FormField>
                        <div>
                            <label className="block text-sm font-medium mb-1">הוקם הו"ק?</label>
                            <div className="flex gap-2 border rounded-lg items-center p-2.5 bg-white">
                                <button type="button" onClick={() => Number(formData.paymentDetails.monthlyFee) > 0 && setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: true } })} className={`flex-1 py-1.5 rounded-md text-sm font-bold ${formData.paymentDetails.directDebit ? 'bg-green-600 text-white' : 'bg-gray-200 text-slate-400'}`}>כן</button>
                                <button type="button" onClick={() => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: false } })} className={`flex-1 py-1.5 rounded-md text-sm font-bold ${!formData.paymentDetails.directDebit ? 'bg-red-600 text-white' : 'bg-gray-200 text-slate-400'}`}>לא</button>
                            </div>
                        </div>
                    </div>
                </section>

                <section><FormField label="הערות נוספות"><textarea className="input-style h-20" onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}></textarea></FormField></section>

                <section className="space-y-4 bg-slate-50 p-6 rounded-xl border-blue-300 border-t-1 border-b-1">
                    <div className="w-full sticky top-8">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">משימות: ({previewTasks.length})</h3>
                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                            {previewTasks.length > 0 ? previewTasks.map(task => <TaskCard key={task.id} task={task} currentUser="מוישי" onSubTaskToggle={() => { }} />) : (
                                <div className="p-8 border-2 border-dashed rounded-xl text-center text-slate-400">הזן נתונים כדי לראות את המשימות שייווצרו</div>
                            )}
                        </div>
                    </div>
                </section>

                <div className="pt-4"><button className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition">שמור לקוח והפעל אוטומציית משימות</button></div>
            </form>
        </div>
    );
}