import React, { useEffect, useState } from 'react'
import { TaskGeneratorService } from '../services/TaskService.js';
import { useNavigate } from 'react-router';
import FormField from '../comps/FormField.jsx';
import { logService } from '../services/logService.js';
import TaskCard from '../comps/TaskCard.jsx';
import CustomerDetails from './CustomerDetails.jsx';
import { supabase } from '../supabaseClient.js';

export default function AddCustomer() {
    const navigate = useNavigate();

    // הגדרת State ראשוני לכל השדות
    const [formData, setFormData] = useState({
        customerDetails: { fullName: '', identityId: '', phoneNumber: '', address: '', email: '' },
        representationFor: [], // מערך לאפשרויות מרובות
        businessDetails: {
            businessName: '',
            businessID: '',
            businessType: '',
            openingDate: '',
            occupation: '',
            businessDescription: '',
            employsWorkers: 'no',
            deductionsId: ''
        },
        insuranceDetails: {
            insurancePrepayment: '',
            workHours: '',
            newInsuranceCase: true
        },
        incomeTaxDetails: {
            repType: 'ראשי',
            incomeTaxPrepayment: '',
            annualTurnover: '',
            newItCase: true},
        vatDetails: {
            newVatCase: true
        },
        paymentDetails: {
            setupFee: '',       // מחיר פתיחת תיק
            monthlyFee: '',     // מחיר חודשי שוטף
            directDebit: false
        }, // הוקם הו"ק (כן/לא)
        isInsuranceActive: false,
        isIncomeTaxActive: false,
        isVatActive: false,
        needsDeductionsFile: false,
        comments: ''
    });

    // לוגיקה אוטומטית: אם מעסיק עובדים, תיק ניכויים הופך ל'כן'
    useEffect(() => {
        if (formData.businessDetails.employsWorkers === 'yes') {
            setFormData(prev => ({ ...prev, needsDeductionsFile: 'yes' }));
        }
    }, [formData.businessDetails.employsWorkers]);
    // בכל פעם שנתוני הלקוח משתנים - עדכן את רשימת המשימות
    useEffect(() => {
        console.log('changed...');
        console.log(formData.businessDetails.businessType);


        const tasks = TaskGeneratorService.generateForCustomer(formData);
        setPreviewTasks(tasks);
    }, [formData]); // האזנה לשינויים ב-customerData

    const handleChange = (category, e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [category]: { ...prev[category], [name]: value } }));
    };

    // const handleCheckboxChange = (option) => {
    //     const current = formData.representationFor;
    //     const updated = current.includes(option)
    //         ? current.filter(i => i !== option)
    //         : [...current, option];
    //     setFormData(prev => ({ ...prev, representationFor: updated }));
    // };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert([formData])
    .select();

  if (clientError) return console.error(clientError);

  // 2. יצירת המשימות בעזרת ה-Service שלנו
  const clientId = client[0].id;
  const tasksToCreate = TaskGeneratorService.generateForCustomer(formData).map(t => ({
    ...t,
    client_id: clientId // שיוך המשימה ללקוח החדש
  }));

  // 3. שמירת כל המשימות בבת אחת
  const { error: tasksError } = await supabase
    .from('tasks')
    .insert(tasksToCreate);

  if (!tasksError) alert("הלקוח והמשימות הוקמו ב-DB!");

            // כאן יבוא ה-Fetch ל-DB לקוחות
            // const response = await fetch(...);
            // כאן יבוא ה-Fetch ל-DB משימות
            // const response = await fetch(...);
            await logService.recordAction('הוספת לקוח חדש', {
                customerName: formData.customerDetails.fullName,
                businessType: formData.businessDetails.businessType
            });

            alert('הלקוח נוסף ותועד במערכת!');
            navigate('/admin/customers');
        } catch (error) {
            console.error("Error saving data:", error);
        }
    };

    // תנאי להצגת שדות ניכויים/עובדים
    const showEmployerFields = formData.businessDetails.businessType === 'מורשה' || formData.businessDetails.businessType === 'חברה בע"מ';
    const [previewTasks, setPreviewTasks] = useState([]);

    return (
        <div className="max-w-4xl mx-auto bg-white p-10 rounded-2xl shadow-xl border border-slate-100 mb-10" dir="rtl">
            <div className="flex justify-between items-center mb-10 border-b pb-6">
                <h2 className="text-3xl font-black text-slate-800">רישום לקוח חדש</h2>
                <button onClick={() => navigate('/admin/customers')} className="text-slate-400 hover:text-slate-600 transition">ביטול</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">

                {/* קטגוריה: פרטים אישיים */}
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

                {/* קטגוריה: פרטי עסק */}
                <section className="space-y-4">
                    <h3 className="text-lg font-bold text-blue-600 border-b pb-2">פרטי עסק</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* תאריך פתיחת העסק - הוספה מפורשת */}
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
                                {['זעיר', 'פטור', 'מורשה', 'חברה בע"מ', 'אחר'].map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </FormField>


                        <FormField label="משלח יד">
                            <input name="occupation" className="input-style" onChange={(e) => handleChange('businessDetails', e)} />
                        </FormField>


                        {/* תיאור העסק */}
                        <div className="col-span-full">
                            <FormField label="תיאור פעילות העסק">
                                <textarea name="businessDescription" className="input-style h-24" onChange={(e) => handleChange('businessDetails', e)}></textarea>
                            </FormField>
                        </div>



                    </div>
                </section>

                <section className="space-y-4">
                    <div className={`flex items-center gap-3 ${formData.isInsuranceActive && 'text-blue-600'} border-b pb-3`}>
                        <input
                            type="checkbox"
                            id="insuranceToggle"
                            className="w-5 h-5 cursor-pointer accent-blue-600"
                            checked={formData.isInsuranceActive}
                            onChange={(e) => setFormData({
                                ...formData,
                                isInsuranceActive: e.target.checked
                            })}
                        />
                        <label htmlFor="insuranceToggle" className={`text-lg font-semibold ${formData.isInsuranceActive ? 'text-blue-600' : 'text-slate-700'} cursor-pointer`}>
                            טיפול בביטוח לאומי
                        </label>
                    </div>
                    {formData.isInsuranceActive && (<div className="grid grid-cols-1 md:grid-cols-2  gap-6">

                        <FormField label="תיק ביטוח לאומי חדש">
                            <select name="newInsuranceCase" className="input-style" onChange={(e) => setFormData({ ...formData, insuranceDetails: { ...formData.insuranceDetails, newInsuranceCase: JSON.parse(e.target.value) } })} required>
                                    <option key={'כן'} value={true}>{'כן'}</option>
                                    <option key={'לא'} value={false}>{'לא'}</option>
                            </select>
                        </FormField>

                        <FormField label="מקדמות ביטוח לאומי">
                            <input name="insurancePrepayment" className="input-style" onChange={(e) => handleChange('insuranceDetails', e)} />
                        </FormField>

                        <FormField label="סך שעות עבודה">
                            <input name="workHours" className="input-style" onChange={(e) => handleChange('insuranceDetails', e)} />
                        </FormField>
                    </div>)}
                </section>

                <section className="space-y-4">
                    <div className={`grid grid-cols-1 md:grid-cols-4  gap-4 ${(formData.isIncomeTaxActive || formData.isVatActive) && 'text-blue-600'} border-b pb-3`}>

                        <div className={`flex items-center gap-3 `}>
                            <input
                                type="checkbox"
                                id="incomeTaxToggle"
                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                checked={formData.isIncomeTaxActive}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    isIncomeTaxActive: e.target.checked
                                })}
                            />

                            <label htmlFor="incomeTaxToggle" className={`text-lg font-semibold ${formData.isIncomeTaxActive ? 'text-blue-600' : 'text-slate-700'} cursor-pointer`}>
                                טיפול במס הכנסה
                            </label>
                        </div>
                        {(formData.businessDetails.businessType !== 'זעיר' && formData.businessDetails.businessType !== 'פטור') && (<div className={`flex items-center justify-center gap-3`}>
                            <input
                                type="checkbox"
                                id="isVatActiveToggle"
                                className="w-5 h-5 cursor-pointer accent-blue-600"
                                checked={formData.isVatActive}
                                onChange={(e) => setFormData({
                                    ...formData,
                                    isVatActive: e.target.checked
                                })}
                            />
                            <label htmlFor="incomeTaxToggle" className={`text-lg font-semibold ${formData.isVatActive ? 'text-blue-600' : 'text-slate-700'} cursor-pointer`}>
                                טיפול במע"מ
                            </label>
                        </div>)}
                    </div>

                    {(formData.isIncomeTaxActive || formData.isVatActive) && (<div className="grid grid-cols-1 md:grid-cols-3  gap-6">

                        {formData.isIncomeTaxActive && (<FormField label="תיק מס הכנסה חדש">
                            <select name="newItCase" className="input-style" onChange={(e) => setFormData({ ...formData, incomeTaxDetails: { ...formData.incomeTaxDetails, newItCase: JSON.parse(e.target.value) } })} required>
                                    <option key={'כן'} value={true}>{'כן'}</option>
                                    <option key={'לא'} value={false}>{'לא'}</option>
                            </select>
                        </FormField>)}
                    {formData.isVatActive && (<FormField label="תיק מע'מ חדש">
                            <select name="newVatCase" className="input-style" onChange={(e) => setFormData({ ...formData, vatDetails: { ...formData.vatDetails, newVatCase: JSON.parse(e.target.value) } })} required>
                                    <option key={'כן'} value={true}>{'כן'}</option>
                                    <option key={'לא'} value={false}>{'לא'}</option>
                            </select>
                        </FormField>)}
                        <FormField label="מקדמות מס הכנסה">
                            <input name="incomeTaxPrepayment" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                        </FormField>

                        <FormField label="מחזור שנתי צפוי">
                            <input name="annualTurnover" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)} />
                        </FormField>

                        <FormField label="סוג ייצוג">
                            <select name="repType" className="input-style" onChange={(e) => handleChange('incomeTaxDetails', e)}>
                                <option value="ראשי">ראשי</option>
                                <option value="משני">משני</option>
                            </select>
                        </FormField>

                        {/* שדות מותנים למעסיקים */}
                        {showEmployerFields && (
                            <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-6 rounded-xl border border-blue-100">
                                <FormField label="האם מעסיק עובדים?">
                                    <select name="employsWorkers" value={formData.businessDetails.employsWorkers} className="input-style" onChange={(e) => handleChange('businessDetails', e)}>
                                        <option value="no">לא</option>
                                        <option value="yes">כן</option>
                                    </select>
                                </FormField>

                                {formData.businessDetails.employsWorkers === 'yes' && (<div className={`flex items-center justify-center gap-3`}>
                                    <label htmlFor="needsDeductionsFileToggle" className={`text-lg font-semibold ${formData.needsDeductionsFile ? 'text-blue-600' : 'text-slate-700'} cursor-pointer`}>
                                        האם נדרש פתיחת תיק ניכויים?
                                    </label>
                                    <input
                                        type="checkbox"
                                        id="needsDeductionsFileToggle"
                                        className="w-5 h-5 cursor-pointer accent-blue-600"
                                        checked={formData.needsDeductionsFile}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            needsDeductionsFile: e.target.checked
                                        })}
                                    />
                                </div>)}
                                {/* <FormField label="האם נדרש פתיחת תיק ניכויים?">
                                    <select name="needsDeductionsFile" value={formData.needsDeductionsFile} className="input-style" onChange={handleChange}>
                                        <option value="no">לא</option>
                                        <option value="yes">כן</option>
                                    </select>
                                </FormField> */}
                            </div>
                        )}
                    </div>)}
                </section>
                {/* קטגוריית תשלומים - ה-Section החדש */}
                <section className="space-y-4 bg-slate-50 p-6 rounded-xl border-blue-300 border-t-1 border-b-1">
                    <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                        <span className="bg-blue-600 w-2 h-6 rounded-full inline-block"></span>
                        תשלומים
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* מחיר פתיחת תיק */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">מחיר פתיחת תיק (₪)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, setupFee: e.target.value } })}
                            />
                        </div>

                        {/* מחיר חודשי שוטף */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">מחיר חודשי שוטף (₪)</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full border p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, monthlyFee: e.target.value, directDebit: Number(e.target.value) > 0 ? formData.paymentDetails.directDebit : false } })} // אם המחיר הוא 0, הו"ק לא יכול להיות פעיל
                            />
                        </div>

                        {/* הוקם הו"ק - Toggle/Select */}
                        <div>
                            <label className={`block text-sm font-medium mb-1 ${Number(formData.paymentDetails.monthlyFee) > 0 ? 'text-slate-600' : 'text-slate-300'}`}>
                                הוקם הו"ק?
                            </label>
                            <div className={`flex gap-2 border rounded-lg items-center p-2.5 transition-all 
    ${Number(formData.paymentDetails.monthlyFee) > 0 ? 'bg-white border-slate-200' : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'}`}>

                                <button
                                    type="button"
                                    // האפשרות ללחוץ קיימת רק אם המחיר החודשי גדול מ-0
                                    onClick={() => Number(formData.paymentDetails.monthlyFee) > 0 && setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: true } })}
                                    className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all 
        ${formData.paymentDetails.directDebit && Number(formData.paymentDetails.monthlyFee) > 0
                                            ? 'bg-green-600 text-white shadow-sm'
                                            : 'bg-gray-200 text-slate-400'}`}
                                >
                                    כן
                                </button>

                                <button
                                    type="button"
                                    // אם המחיר הוא 0, הלחיצה לא תעשה כלום והוא תמיד יישאר "לא"
                                    onClick={() => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, directDebit: false } })}
                                    className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all 
        ${!formData.paymentDetails.directDebit && Number(formData.paymentDetails.monthlyFee) > 0
                                            ? 'bg-red-600 text-white shadow-sm'
                                            : 'bg-gray-200 text-slate-400'}`}
                                >
                                    לא
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* הערות */}
                <section>
                    <FormField label="הערות נוספות">
                        <textarea name="comments" className="input-style h-20" onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}></textarea>
                    </FormField>
                </section>
                <section className="space-y-4 bg-slate-50 p-6 rounded-xl border-blue-300 border-t-1 border-b-1">

                    <div className="w-full  sticky top-8">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="bg-blue-500 w-2 h-6 rounded-full"></span>
                            משימות: ({previewTasks.length})
                        </h3>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                            {previewTasks.length > 0 ? (
                                previewTasks.map(task => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        currentUser="מוישי" // לצורך התצוגה המקדימה
                                        onSubTaskToggle={() => { }}
                                    />
                                ))
                            ) : (
                                <div className="p-8 border-2 border-dashed rounded-xl text-center text-slate-400">
                                    הזן נתונים כדי לראות את המשימות שייווצרו
                                </div>
                            )}
                        </div>
                    </div>

                </section>


                {/* כפתור שמירה */}
                <div className="pt-4">
                    <button className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200">
                        שמור לקוח והפעל אוטומציית משימות
                    </button>
                </div>
            </form>
        </div>
    );
}
