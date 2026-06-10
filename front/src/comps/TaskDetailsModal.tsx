// src/comps/TaskDetailsModal.tsx
import React from 'react';

interface TaskDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any; // אובייקט המשימה הכולל את נתוני הלקוח והרשויות
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ isOpen, onClose, task }) => {
    if (!isOpen || !task) return null;

    // שליפת תתי-האובייקטים מתוך המשימה/לקוח
    const customer = task.customer || task; 
    const business = customer?.business_details?.[0] || customer?.businessDetails || {};
    const incomeTax = customer?.income_tax_cases?.[0] || customer?.incomeTaxDetails || {};
    const vat = customer?.vat_cases?.[0] || customer?.vatDetails || {};
    const insurance = customer?.insurance_cases?.[0] || customer?.insuranceDetails || {};
    const payment = customer?.payment_details?.[0] || customer?.paymentDetails || {};

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
                    <div>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                            {task.parentTitle || task.title || 'פרטי משימה'}
                        </span>
                        <h3 className="text-xl font-black text-slate-900 mt-1.5">
                            תיק לקוח: {customer.customerName || customer.full_name || 'לא ידוע'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-black text-lg transition">✕</button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    
                    {/* 1. פרטי ליבה ועסק */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div>
                            <span className="text-xs text-slate-400 block">ח״פ / ת.ז לקוח</span>
                            <span className="text-sm font-bold text-slate-800">{customer.identity_id || customer.identityId || '—'}</span>
                        </div>
                        <div>
                            <span className="text-xs text-slate-400 block">שם העסק</span>
                            <span className="text-sm font-bold text-slate-800">{business.business_name || business.businessName || '—'}</span>
                        </div>
                        <div>
                            <span className="text-xs text-slate-400 block">סוג עסק</span>
                            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-xs inline-block mt-0.5">
                                {business.business_type || business.businessType || '—'}
                            </span>
                        </div>
                        <div>
                            <span className="text-xs text-slate-400 block">משלח יד</span>
                            <span className="text-sm font-bold text-slate-800">{business.occupation || '—'}</span>
                        </div>
                    </div>

                    {/* 2. נתוני רשויות מותנים (מוצגים רק אם רלוונטי למשימה הנוכחית) */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">נתוני רשויות ותלויות</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* מס הכנסה */}
                            <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                                <span className="text-xs font-bold text-slate-700 block border-b border-slate-100 pb-1">💼 מס הכנסה</span>
                                <div className="text-xs text-slate-600 space-y-1">
                                    <p>סוג ייצוג: <strong className="text-slate-800">{incomeTax.rep_type || incomeTax.repType || '—'}</strong></p>
                                    <p>מקדמות: <strong className="text-slate-800">{incomeTax.income_tax_prepayment || incomeTax.incomeTaxPrepayment || '—'} ₪</strong></p>
                                    <p>מחזור שנתי צפוי: <strong className="text-slate-800">{incomeTax.annual_turnover || incomeTax.annualTurnover || '—'} ₪</strong></p>
                                </div>
                            </div>

                            {/* ביטוח לאומי */}
                            <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                                <span className="text-xs font-bold text-slate-700 block border-b border-slate-100 pb-1">🛡️ ביטוח לאומי</span>
                                <div className="text-xs text-slate-600 space-y-1">
                                    <p>מקדמות: <strong className="text-slate-800">{insurance.insurance_prepayment || insurance.insurancePrepayment || '—'} ₪</strong></p>
                                    <p>שעות עבודה: <strong className="text-slate-800">{insurance.work_hours || insurance.workHours || '—'}</strong></p>
                                </div>
                            </div>
                        </div>

                        {/* תנאי עובדים / ניכויים */}
                        {business.employs_workers === 'yes' && (
                            <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                                <div className="text-xs text-amber-900">
                                    <p className="font-bold">👥 העסק מעסיק עובדים שכירים</p>
                                    <p className="text-slate-500 mt-0.5">נדרש מעקב שוטף ודיווח תיק ניכויים</p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${customer.needs_deductions_file || customer.needsDeductionsFile ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                                    {customer.needs_deductions_file || customer.needsDeductionsFile ? '✓ נדרש תיק ניכויים' : 'ללא תיק ניכויים'}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* 3. פיננסים והערות */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">הערות ופיננסים</h4>
                        <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <span className="font-bold block text-slate-700 mb-1">📝 הערות הקמה:</span>
                            <p className="italic text-slate-600 whitespace-pre-wrap">{customer.comments || 'אין הערות מיוחדות לתיק זה'}</p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end rounded-b-2xl">
                    <button onClick={onClose} className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-xl text-sm font-bold transition shadow-sm">
                        סגור חלון
                    </button>
                </div>
            </div>
        </div>
    );
};