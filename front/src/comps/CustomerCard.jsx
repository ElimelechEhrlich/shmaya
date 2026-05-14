import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomer } from '../hooks/useCustomer.ts';
import {
    isEmployerType as registryIsEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
} from '../registries/CustomerRegistry.ts';

const CustomerCard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const {
        customer,
        editData,
        loading,
        isEditing,
        progress,
        actions,
    } = useCustomer(id);

    const handleSave = async () => {
        const result = await actions.save();
        if (result.success) {
            alert("הנתונים נשמרו וסונכרנו בהצלחה!");
        } else {
            alert("שגיאה בשמירה: " + result.error);
        }
    };

    if (loading || !editData) {
        return <div className="p-20 text-center font-bold text-slate-400">טוען נתונים...</div>;
    }

    const bType = editData.businessDetails?.businessType;
    const isEmployerType = registryIsEmployerType(editData);
    const isVatRelevant = isRepresentationAllowed(editData);

    const onCh = (category, field) => (value) => actions.updateField(category, field, value);

    return (
        <div className="p-6 bg-slate-50 min-h-screen rtl text-right font-sans" dir="rtl">
            <div className="max-w-7xl mx-auto">

                {/* Actions Bar */}
                <div className="flex justify-between items-center mb-8">
                    <button onClick={() => navigate('/admin/customers')} className="text-slate-400 font-bold hover:text-slate-600 transition">➜ חזרה</button>
                    <div className="flex gap-4">
                        {isEditing && (
                            <button onClick={() => actions.setEditMode(false)} className="text-red-500 underline font-bold px-4">ביטול</button>
                        )}
                        <button
                            onClick={isEditing ? handleSave : () => actions.setEditMode(true)}
                            className={`px-10 py-3 rounded-2xl font-black shadow-xl transition-all ${isEditing ? 'bg-green-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        >
                            {isEditing ? '💾 שמור וסנכרן משימות' : '✏️ עריכת כרטיס'}
                        </button>
                    </div>
                </div>

                {/* Banner */}
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex justify-between items-center mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-3 h-full bg-blue-600"></div>
                    <div>
                        <span className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{bType}</span>
                        <h1 className="text-4xl font-black text-slate-900 mt-1">{editData.customerDetails?.fullName}</h1>
                        <p className="text-slate-500 font-bold">{editData.businessDetails?.businessName}</p>
                    </div>
                    <div className="text-left bg-slate-50 p-6 rounded-3xl border border-slate-100 min-w-[140px]">
                        <div className="text-4xl font-black text-slate-800 leading-none">{progress}%</div>
                        <div className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">ביצוע משימות</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

                    {/* Column 1: personal & business */}
                    <div className="space-y-6">
                        <Section title="👤 פרטים אישיים">
                            <EditableRow label="שם מלא"        value={editData.customerDetails?.fullName}    isEditing={isEditing} onCh={onCh('customerDetails', 'fullName')} />
                            <EditableRow label="תעודת זהות"   value={editData.customerDetails?.identityId}  isEditing={isEditing} onCh={onCh('customerDetails', 'identityId')} />
                            <EditableRow label="טלפון"        value={editData.customerDetails?.phoneNumber} isEditing={isEditing} onCh={onCh('customerDetails', 'phoneNumber')} />
                            <EditableRow label="כתובת מגורים" value={editData.customerDetails?.address}     isEditing={isEditing} onCh={onCh('customerDetails', 'address')} />
                            <EditableRow label="אימייל"       value={editData.customerDetails?.email}       isEditing={isEditing} onCh={onCh('customerDetails', 'email')} />
                        </Section>

                        <Section title="🏢 פרטי עסק">
                            <EditableRow label="שם העסק"    value={editData.businessDetails?.businessName} isEditing={isEditing} onCh={onCh('businessDetails', 'businessName')} />
                            <EditableRow label="מזהה עסק"   value={editData.businessDetails?.businessID}   isEditing={isEditing} onCh={onCh('businessDetails', 'businessID')} />
                            <EditableRow label="סוג עסק"    value={editData.businessDetails?.businessType} isEditing={isEditing} type="select" options={BUSINESS_TYPE_OPTIONS} onCh={onCh('businessDetails', 'businessType')} />
                            <EditableRow label="תאריך פתיחה" value={editData.businessDetails?.openingDate}  isEditing={isEditing} type="date" onCh={onCh('businessDetails', 'openingDate')} />
                            <EditableRow label="משלח יד"    value={editData.businessDetails?.occupation}   isEditing={isEditing} onCh={onCh('businessDetails', 'occupation')} />

                            {isEmployerType && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                                    <EditableRow label="מעסיק עובדים?" value={editData.businessDetails?.employsWorkers} isEditing={isEditing} type="select" options={['yes', 'no']} onCh={onCh('businessDetails', 'employsWorkers')} />
                                    {editData.businessDetails?.employsWorkers === 'yes' && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-blue-600">תיק ניכויים נדרש?</span>
                                            <input
                                                type="checkbox"
                                                checked={editData.needsDeductionsFile}
                                                disabled={!isEditing}
                                                onChange={(e) => actions.updateField(null, 'needsDeductionsFile', e.target.checked)}
                                                className="w-5 h-5 accent-blue-600"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </Section>
                    </div>

                    {/* Column 2: authorities & payment */}
                    <div className="space-y-6">
                        <Section title="🛡️ סטטוס רשויות">
                            <div className="space-y-3">
                                <ToggleRow label="ביטוח לאומי" active={editData.isInsuranceActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isInsuranceActive', v)} />
                                {editData.isInsuranceActive && (
                                    <div className="pr-4 border-r-2 border-blue-100 space-y-3 mt-2">
                                        <EditableRow label="מקדמות ב''ל" value={editData.insuranceDetails?.insurancePrepayment} isEditing={isEditing} onCh={onCh('insuranceDetails', 'insurancePrepayment')} />
                                        <EditableRow label="שעות עבודה"  value={editData.insuranceDetails?.workHours}            isEditing={isEditing} onCh={onCh('insuranceDetails', 'workHours')} />
                                    </div>
                                )}

                                <ToggleRow label="מס הכנסה" active={editData.isIncomeTaxActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isIncomeTaxActive', v)} />
                                {editData.isIncomeTaxActive && (
                                    <div className="pr-4 border-r-2 border-green-100 space-y-3 mt-2">
                                        <EditableRow label="מקדמות מס" value={editData.incomeTaxDetails?.incomeTaxPrepayment} isEditing={isEditing} onCh={onCh('incomeTaxDetails', 'incomeTaxPrepayment')} />
                                        <EditableRow label="מחזור צפוי" value={editData.incomeTaxDetails?.annualTurnover}      isEditing={isEditing} onCh={onCh('incomeTaxDetails', 'annualTurnover')} />
                                        <EditableRow label="סוג ייצוג"  value={editData.incomeTaxDetails?.repType}             isEditing={isEditing} type="select" options={['ראשי', 'משני']} onCh={onCh('incomeTaxDetails', 'repType')} />
                                    </div>
                                )}

                                {isVatRelevant && (
                                    <ToggleRow label="מע''מ" active={editData.isVatActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isVatActive', v)} />
                                )}
                            </div>
                        </Section>

                        <Section title="💰 תשלומים למשרד">
                            <EditableRow label="פתיחת תיק (₪)"    value={editData.paymentDetails?.setupFee}   isEditing={isEditing} onCh={onCh('paymentDetails', 'setupFee')} />
                            <EditableRow label="ריטיינר חודשי (₪)" value={editData.paymentDetails?.monthlyFee} isEditing={isEditing} onCh={onCh('paymentDetails', 'monthlyFee')} />
                            <div className={`mt-4 p-3 rounded-xl flex justify-between items-center ${editData.paymentDetails?.directDebit ? 'bg-green-50 border border-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                                <span className="text-xs font-bold uppercase">הוראת קבע:</span>
                                {isEditing ? (
                                    <button onClick={() => actions.updateField('paymentDetails', 'directDebit', !editData.paymentDetails.directDebit)} className={`px-4 py-1 rounded-full text-[10px] font-black ${editData.paymentDetails?.directDebit ? 'bg-green-600 text-white' : 'bg-slate-300'}`}>
                                        {editData.paymentDetails?.directDebit ? 'פעיל' : 'כבוי'}
                                    </button>
                                ) : (
                                    <span className="text-sm font-black">{editData.paymentDetails?.directDebit ? 'פעיל ✓' : 'לא פעילה'}</span>
                                )}
                            </div>
                        </Section>
                    </div>

                    {/* Column 3: notes, description, tasks */}
                    <div className="space-y-6">
                        <Section title="📝 הערות">
                            {isEditing ? (
                                <textarea className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-32 outline-none focus:ring-2 focus:ring-blue-500" value={editData.comments || ''} onChange={(e) => actions.updateField(null, 'comments', e.target.value)} />
                            ) : (
                                <p className="text-sm text-slate-600 italic leading-relaxed">{editData.comments || 'אין הערות נוספות.'}</p>
                            )}
                        </Section>

                        <Section title="📄 תיאור פעילות">
                            {isEditing ? (
                                <textarea className="w-full p-4 bg-slate-50 border rounded-2xl text-sm h-32 outline-none focus:ring-2 focus:ring-blue-500" value={editData.businessDetails?.businessDescription || ''} onChange={(e) => actions.updateField('businessDetails', 'businessDescription', e.target.value)} />
                            ) : (
                                <p className="text-sm text-slate-600 leading-relaxed">{editData.businessDetails?.businessDescription || 'אין תיאור פעילות.'}</p>
                            )}
                        </Section>

                        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white">
                            <h3 className="text-xl font-black mb-6">משימות פתוחות</h3>
                            <div className="space-y-4">
                                {customer?.tasks?.filter(t => t.status !== 'completed').slice(0, 5).map(t => (
                                    <div key={t.id} className="flex justify-between items-center border-b border-white/10 pb-2">
                                        <span className="text-sm font-bold text-slate-300">{t.title}</span>
                                        <button
                                            onClick={() => actions.toggleTaskStatus(t.id, t.status)}
                                            className="text-[10px] font-bold text-blue-300 hover:text-white"
                                        >
                                            סמן כבוצע
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Section = ({ title, children }) => (
    <div className="bg-white p-7 rounded-[2.5rem] shadow-sm border border-slate-100">
        <h3 className="text-blue-600 font-black text-[10px] uppercase tracking-[0.2em] mb-6 border-b border-slate-50 pb-2">{title}</h3>
        {children}
    </div>
);

const EditableRow = ({ label, value, isEditing, onCh, type = "text", options = [] }) => (
    <div className="mb-5 last:mb-0">
        <label className="text-[10px] font-black text-slate-300 uppercase block mb-1">{label}</label>
        {isEditing ? (
            type === "select" ? (
                <select className="w-full p-2.5 bg-slate-50 border-b-2 border-blue-100 text-sm font-bold outline-none" value={value || ''} onChange={(e) => onCh(e.target.value)}>
                    <option value="">בחר...</option>
                    {options.map(o => <option key={o} value={o}>{o === 'yes' ? 'כן' : o === 'no' ? 'לא' : o}</option>)}
                </select>
            ) : (
                <input className="w-full p-2.5 bg-slate-50 border-b-2 border-blue-100 text-sm font-bold outline-none" value={value || ''} onChange={(e) => onCh(e.target.value)} type={type} />
            )
        ) : (
            <span className="text-sm font-black text-slate-800">{value || '---'}</span>
        )}
    </div>
);

const ToggleRow = ({ label, active, isEditing, onToggle }) => (
    <div className="flex justify-between items-center p-3 rounded-2xl hover:bg-slate-50 transition-all">
        <span className={`text-sm font-bold ${active ? 'text-slate-800' : 'text-slate-300'}`}>{label}</span>
        <input type="checkbox" checked={!!active} disabled={!isEditing} onChange={(e) => onToggle(e.target.checked)} className="w-6 h-6 cursor-pointer accent-blue-600" />
    </div>
);

export default CustomerCard;
