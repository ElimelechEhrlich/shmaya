// src/comps/CustomerCard.tsx
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCustomer } from '../hooks/useCustomer';
import {
    isEmployerType as registryIsEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
    PRIORITY_LEVELS,
    PRIORITY_STYLES,
    CATEGORY_STYLES,
    DEFAULT_CATEGORY_STYLE,
} from '../registries/CustomerRegistry';
import ProgressBar from './ProgressBar';

// הגדרת טיפוס קשיח לרמות הדחיפות המותרות במערכת
type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

interface SectionProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

interface EditableRowProps {
    label: string;
    value: any;
    isEditing: boolean;
    onCh: (value: string) => void;
    type?: "text" | "select" | "date";
    options?: string[];
}

interface ToggleRowProps {
    label: string;
    active: boolean | undefined;
    isEditing: boolean;
    onToggle: (checked: boolean) => void;
}

interface PriorityBadgeProps {
    priority: string | undefined;
    onChange: (priority: string) => void;
}

interface TaskBlockProps {
    task: any;
    onToggleStatus: () => void;
    onSubtaskSet: (subId: string, completed: boolean) => void;
    onSaveComment: (subId: string, comment: string) => void;
    onChangePriority: (priority: string) => void;
}

interface SubtaskRowProps {
    subtask: any;
    onSetCompleted: (completed: boolean) => void;
    onSaveComment: (comment: string) => void;
}

interface ConfirmModalProps {
    title: string;
    body: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const CustomerCard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const {
        customer,
        editData,
        loading,
        isEditing,
        progress,
        actions,
    } = useCustomer(id);

    const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

    const handleSave = async () => {
        const result = await actions.save();
        if (result.success) alert("הנתונים נשמרו וסונכרנו בהצלחה!");
        else alert("שגיאה בשמירה: " + result.error);
    };

    const handleDeactivate = async () => {
        if (!confirm('להעביר את הלקוח לסטטוס לא פעיל? פעולה זו תאפס את הרשויות הפעילות.')) return;
        const r = await actions.deactivate();
        if (!r.success) alert("שגיאה: " + r.error);
    };

    const handleReactivate = async () => {
        const r = await actions.reactivate();
        if (!r.success) alert("שגיאה: " + r.error);
    };

    const handleDelete = async () => {
        const r = await actions.remove();
        if (r.success) {
            alert('הלקוח נמחק.');
            navigate('/admin/customers');
        } else {
            alert("שגיאה במחיקה: " + r.error);
        }
    };

    if (loading || !editData) {
        return <div className="p-20 text-center font-bold text-slate-400">טוען נתונים...</div>;
    }

    const bType = editData.businessDetails?.businessType;
    const isEmployerType = registryIsEmployerType(editData);
    const isVatRelevant = isRepresentationAllowed(editData);
    const isInactive = editData.isActive === false;

    const onCh = (category: string, field: string) => (value: string) =>
        actions.updateField(category, field, value);

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">

                {/* Actions Bar */}
                <div className="flex justify-between items-center mb-6">
                    <button
                        onClick={() => navigate('/admin/customers')}
                        className="cursor-pointer text-slate-500 font-bold hover:text-slate-800 transition flex items-center gap-1.5"
                    >
                        <span>→</span> חזרה לרשימה
                    </button>
                    <div className="flex gap-3 items-center">
                        {!isEditing && (
                            <>
                                {isInactive ? (
                                    <button onClick={handleReactivate} className="cursor-pointer text-sm font-bold text-green-700 hover:text-green-900 px-3 py-2 rounded-lg transition">
                                        ↻ הפעל מחדש
                                    </button>
                                ) : (
                                    <button onClick={handleDeactivate} className="cursor-pointer text-sm font-bold text-amber-700 hover:text-amber-900 px-3 py-2 rounded-lg transition">
                                        ⏸ סמן כלא פעיל
                                    </button>
                                )}
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="cursor-pointer text-sm font-bold text-red-600 hover:text-red-800 px-3 py-2 rounded-lg transition"
                                >
                                    🗑 מחיקה
                                </button>
                            </>
                        )}
                        {isEditing && (
                            <button onClick={() => actions.setEditMode(false)} className="cursor-pointer text-red-500 underline font-bold px-4">ביטול</button>
                        )}
                        <button
                            onClick={isEditing ? handleSave : () => actions.setEditMode(true)}
                            className={`cursor-pointer px-8 py-2.5 rounded-xl font-black text-sm shadow-md transition ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        >
                            {isEditing ? '💾 שמור וסנכרן' : '✏️ עריכה'}
                        </button>
                    </div>
                </div>

                {/* Delete confirmation modal */}
                {confirmDelete && (
                    <ConfirmModal
                        title="מחיקת לקוח לצמיתות"
                        body={`האם למחוק את ${editData.customerDetails?.fullName || 'הלקוח'} ואת כל המשימות שלו? פעולה זו אינה הפיכה.`}
                        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}

                {/* Banner */}
                <div className={`card-base p-7 mb-6 relative overflow-hidden ${isInactive ? 'opacity-75' : ''}`}>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-600"></div>
                    <div className="flex justify-between items-start gap-8 mb-5">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 font-bold text-[11px] rounded-full border border-blue-100">{bType || 'ללא סיווג'}</span>
                                {isInactive && <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-500 font-bold text-[11px] rounded-full border border-slate-200">לא פעיל</span>}
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 leading-tight">{editData.customerDetails?.fullName}</h1>
                            <p className="text-slate-500 font-medium mt-1">{editData.businessDetails?.businessName}</p>
                        </div>
                        <div className="text-left flex-shrink-0">
                            <div className="text-5xl font-black text-slate-900 leading-none">{progress}<span className="text-2xl text-slate-400">%</span></div>
                            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">ביצוע משימות</div>
                        </div>
                    </div>
                    <ProgressBar percent={progress} size="lg" label={`${progress}% הושלם`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Column 1 */}
                    <div className="space-y-6">
                        <Section title="פרטים אישיים" icon="👤">
                            <EditableRow label="שם מלא" value={editData.customerDetails?.fullName} isEditing={isEditing} onCh={onCh('customerDetails', 'fullName')} />
                            <EditableRow label="תעודת זהות" value={editData.customerDetails?.identityId} isEditing={isEditing} onCh={onCh('customerDetails', 'identityId')} />
                            <EditableRow label="טלפון" value={editData.customerDetails?.phoneNumber} isEditing={isEditing} onCh={onCh('customerDetails', 'phoneNumber')} />
                            <EditableRow label="כתובת מגורים" value={editData.customerDetails?.address} isEditing={isEditing} onCh={onCh('customerDetails', 'address')} />
                            <EditableRow label="אימייל" value={editData.customerDetails?.email} isEditing={isEditing} onCh={onCh('customerDetails', 'email')} />
                        </Section>

                        <Section title="פרטי עסק" icon="🏢">
                            <EditableRow label="שם העסק" value={editData.businessDetails?.businessName} isEditing={isEditing} onCh={onCh('businessDetails', 'businessName')} />
                            <EditableRow label="מזהה עסק" value={editData.businessDetails?.businessID} isEditing={isEditing} onCh={onCh('businessDetails', 'businessID')} />
                            <EditableRow label="סוג עסק" value={editData.businessDetails?.businessType} isEditing={isEditing} type="select" options={BUSINESS_TYPE_OPTIONS} onCh={onCh('businessDetails', 'businessType')} />
                            <EditableRow label="תאריך פתיחה" value={editData.businessDetails?.openingDate} isEditing={isEditing} type="date" onCh={onCh('businessDetails', 'openingDate')} />
                            <EditableRow label="משלח יד" value={editData.businessDetails?.occupation} isEditing={isEditing} onCh={onCh('businessDetails', 'occupation')} />

                            {isEmployerType && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                                    <EditableRow label="מעסיק עובדים?" value={editData.businessDetails?.employsWorkers} isEditing={isEditing} type="select" options={['yes', 'no']} onCh={onCh('businessDetails', 'employsWorkers')} />
                                    {editData.businessDetails?.employsWorkers === 'yes' && (
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-blue-700">תיק ניכויים נדרש?</span>
                                            <input type="checkbox" checked={!!editData.needsDeductionsFile} disabled={!isEditing} onChange={(e) => actions.updateField(null, 'needsDeductionsFile', e.target.checked)} className={`w-5 h-5 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </Section>
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-6">
                        <Section title="סטטוס רשויות" icon="🛡️">
                            <div className="space-y-2">
                                <ToggleRow label="ביטוח לאומי" active={editData.isInsuranceActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isInsuranceActive', v)} />
                                {editData.isInsuranceActive && (
                                    <div className="pr-4 border-r-2 border-blue-100 space-y-3 mt-2 mb-3">
                                        <EditableRow label="מקדמות ב״ל" value={editData.insuranceDetails?.insurancePrepayment} isEditing={isEditing} onCh={onCh('insuranceDetails', 'insurancePrepayment')} />
                                        <EditableRow label="שעות עבודה" value={editData.insuranceDetails?.workHours} isEditing={isEditing} onCh={onCh('insuranceDetails', 'workHours')} />
                                    </div>
                                )}

                                <ToggleRow label="מס הכנסה" active={editData.isIncomeTaxActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isIncomeTaxActive', v)} />
                                {editData.isIncomeTaxActive && (
                                    <div className="pr-4 border-r-2 border-emerald-100 space-y-3 mt-2 mb-3">
                                        <EditableRow label="מקדמות מס" value={editData.incomeTaxDetails?.incomeTaxPrepayment} isEditing={isEditing} onCh={onCh('incomeTaxDetails', 'incomeTaxPrepayment')} />
                                        <EditableRow label="מחזור צפוי" value={editData.incomeTaxDetails?.annualTurnover} isEditing={isEditing} onCh={onCh('incomeTaxDetails', 'annualTurnover')} />
                                        <EditableRow label="סוג ייצוג" value={editData.incomeTaxDetails?.repType} isEditing={isEditing} type="select" options={['ראשי', 'משני']} onCh={onCh('incomeTaxDetails', 'repType')} />
                                    </div>
                                )}

                                {isVatRelevant && (
                                    <ToggleRow label="מע״מ" active={editData.isVatActive} isEditing={isEditing} onToggle={(v) => actions.updateField(null, 'isVatActive', v)} />
                                )}
                            </div>
                        </Section>

                        <Section title="תשלומים למשרד" icon="💰">
                            <EditableRow label="פתיחת תיק (₪)" value={editData.paymentDetails?.setupFee} isEditing={isEditing} onCh={onCh('paymentDetails', 'setupFee')} />
                            <EditableRow label="ריטיינר חודשי (₪)" value={editData.paymentDetails?.monthlyFee} isEditing={isEditing} onCh={onCh('paymentDetails', 'monthlyFee')} />
                            <div className={`mt-3 p-3 rounded-xl flex justify-between items-center border ${editData.paymentDetails?.directDebit ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                <span className="text-xs font-bold uppercase tracking-wide">הוראת קבע</span>
                                {isEditing ? (
                                    <button
                                        onClick={() => actions.updateField('paymentDetails', 'directDebit', !editData.paymentDetails?.directDebit)}
                                        className={`cursor-pointer px-4 py-1 rounded-full text-[10px] font-black transition ${editData.paymentDetails?.directDebit ? 'bg-green-600 text-white' : 'bg-slate-300 text-slate-700'}`}
                                    >
                                        {editData.paymentDetails?.directDebit ? 'הוקם' : 'לא הוקם'}
                                    </button>
                                ) : (
                                    <span className="text-sm font-bold">{editData.paymentDetails?.directDebit ? 'הוקם ✓' : 'לא הוקם'}</span>
                                )}
                            </div>
                        </Section>

                        <Section title="הערות" icon="📝">
                            {isEditing ? (
                                <textarea className="input-style h-28" value={editData.comments || ''} onChange={(e) => actions.updateField(null, 'comments', e.target.value)} />
                            ) : (
                                <p className="text-sm text-slate-600 italic leading-relaxed">{editData.comments || 'אין הערות נוספות.'}</p>
                            )}
                        </Section>
                    </div>

                    {/* Column 3: tasks */}
                    <div className="space-y-6">
                        <Section title="משימות" icon="📋">
                            {(!customer?.tasks || customer.tasks.length === 0) ? (
                                <p className="text-sm text-slate-400 italic text-center py-8">לא נוצרו משימות עדיין.</p>
                            ) : (
                                <div className="space-y-3">
                                    {/* החלף את המקטע של רנדור ה-TaskBlock בקוד הבא: */}
                                    {customer.tasks.map((task: any) => (
                                        <TaskBlock
                                            key={task.id}
                                            task={task}
                                            onToggleStatus={() => actions.toggleTaskStatus(task.id, task.status)}
                                            onSubtaskSet={(subId, completed) => actions.setSubtaskCompleted(task.id, subId, completed)}
                                            onSaveComment={(subId, comment) => actions.updateSubtaskComment(task.id, subId, comment)}
                                            // תיקון: המרה מפורשת של הסטרינג לטיפוס הדחיפות שהאקשן מצפה לקבל
                                            onChangePriority={(p: string) => actions.updateTaskPriority(task.id, p as any)}
                                        />
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
    <div className="card-base p-6">
        <h3 className="text-blue-700 font-black text-[11px] uppercase tracking-[0.2em] mb-5 border-b border-slate-100 pb-2 flex items-center gap-2">
            {icon && <span className="text-base">{icon}</span>}
            {title}
        </h3>
        {children}
    </div>
);

const EditableRow: React.FC<EditableRowProps> = ({ label, value, isEditing, onCh, type = "text", options = [] }) => (
    <div className="mb-4 last:mb-0">
        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wide">{label}</label>
        {isEditing ? (
            type === "select" ? (
                <select className="input-style cursor-pointer" value={value || ''} onChange={(e) => onCh(e.target.value)}>
                    <option value="">בחר...</option>
                    {options.map(o => <option key={o} value={o}>{o === 'yes' ? 'כן' : o === 'no' ? 'לא' : o}</option>)}
                </select>
            ) : (
                <input className="input-style" value={value || ''} onChange={(e) => onCh(e.target.value)} type={type} />
            )
        ) : (
            <span className="text-sm font-bold text-slate-800">{value || '---'}</span>
        )}
    </div>
);

const ToggleRow: React.FC<ToggleRowProps> = ({ label, active, isEditing, onToggle }) => (
    <div className={`flex justify-between items-center p-3 rounded-xl border transition ${active ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
        <span className={`text-sm font-bold ${active ? 'text-blue-700' : 'text-slate-500'}`}>{label}</span>
        <input
            type="checkbox"
            checked={!!active}
            disabled={!isEditing}
            onChange={(e) => onToggle(e.target.checked)}
            className={`w-5 h-5 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        />
    </div>
);

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, onChange }) => {
    // מניעת שגיאות מפתח - כפיית טיפוס ושימוש ב-Fallback בטוח
    const p = (priority && PRIORITY_STYLES[priority as PriorityLevel] ? priority : 'medium') as PriorityLevel;
    const style = PRIORITY_STYLES[p];

    return (
        <div className="relative">
            <select
                value={p}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className={`cursor-pointer ${style.bg} ${style.text} ${style.border} border px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider appearance-none pr-4`}
                style={{ backgroundImage: 'none' }}
                title={`עדיפות: ${style.label}`}
            >
                {PRIORITY_LEVELS.map((lv: string) => {
                    const levelKey = lv as PriorityLevel;
                    return (
                        <option key={lv} value={lv}>{PRIORITY_STYLES[levelKey]?.label || lv}</option>
                    );
                })}
            </select>
        </div>
    );
};

const TaskBlock: React.FC<TaskBlockProps> = ({ task, onToggleStatus, onSubtaskSet, onSaveComment, onChangePriority }) => {
    const [open, setOpen] = useState<boolean>(task.status !== 'completed');
    const subTasks = task.subTasks ?? [];
    const doneCount = subTasks.filter((s: any) => s.completed).length;
    const isCompleted = task.status === 'completed';

    // תיקון: מניעת קריסה במקרה ש-parentTaskId לא רשום בסטיילס
    const catStyle = task.parentTaskId && (CATEGORY_STYLES as any)[task.parentTaskId]
        ? (CATEGORY_STYLES as any)[task.parentTaskId]
        : DEFAULT_CATEGORY_STYLE;

    return (
        <div
            className={`border rounded-xl overflow-hidden transition border-r-4 ${catStyle.accent} ${isCompleted ? 'bg-green-50/40 border-green-200' : `${catStyle.bg} border-slate-200`}`}
        >
            <div className="p-3 flex items-center justify-between gap-2">
                <button
                    onClick={() => setOpen(!open)}
                    className="cursor-pointer flex items-center gap-2 flex-1 text-right hover:opacity-80 transition min-w-0"
                >
                    <span className="text-slate-400 text-xs flex-shrink-0">{open ? '▼' : '◀'}</span>
                    <span className="text-base flex-shrink-0">{catStyle.emoji}</span>
                    <span className={`text-sm font-bold truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</span>
                    {subTasks.length > 0 && (
                        <span className="text-[10px] text-slate-400 font-bold flex-shrink-0">({doneCount}/{subTasks.length})</span>
                    )}
                </button>
                <PriorityBadge priority={task.priority} onChange={onChangePriority} />
                <button
                    onClick={onToggleStatus}
                    className={`cursor-pointer px-3 py-1 rounded-full text-[10px] font-black transition flex-shrink-0 ${isCompleted ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-900/10 text-slate-700 hover:bg-blue-600 hover:text-white'}`}
                >
                    {isCompleted ? 'בוצע ✓' : 'סמן כבוצע'}
                </button>
            </div>
            {open && subTasks.length > 0 && (
                <div className="border-t border-slate-200/70 bg-white/60 p-2 space-y-1.5">
                    {subTasks.map((sub: any) => (
                        <SubtaskRow
                            key={sub.id}
                            subtask={sub}
                            onSetCompleted={(c) => onSubtaskSet(sub.id, c)}
                            onSaveComment={(comment) => onSaveComment(sub.id, comment)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const SubtaskRow: React.FC<SubtaskRowProps> = ({ subtask, onSetCompleted, onSaveComment }) => {
    const [editingComment, setEditingComment] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>(subtask.comment ?? '');

    const handleSaveComment = () => {
        setEditingComment(false);
        if (draft !== (subtask.comment ?? '')) onSaveComment(draft);
    };

    const hasComment = (subtask.comment ?? '').trim().length > 0;
    const hasDetails = subtask.details && Object.keys(subtask.details).length > 0;

    return (
        <div className={`rounded-lg border p-2 transition ${subtask.completed ? 'bg-green-50/60 border-green-200/70' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={!!subtask.completed}
                    onChange={(e) => onSetCompleted(e.target.checked)}
                    className="cursor-pointer w-4 h-4 accent-blue-600 flex-shrink-0"
                />
                <span className={`text-xs font-medium flex-1 min-w-0 ${subtask.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {subtask.title}
                </span>
                <button
                    onClick={() => setEditingComment(true)}
                    title="הוסף הערה"
                    className={`cursor-pointer text-xs px-1.5 py-0.5 rounded transition flex-shrink-0 ${hasComment ? 'text-blue-600 bg-blue-50' : 'text-slate-300 hover:text-slate-600'}`}
                >
                    ✎
                </button>
            </div>

            {hasDetails && (
                <div className="text-[10px] text-slate-400 pr-6 mt-1 italic">
                    {Object.entries(subtask.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                </div>
            )}

            {(editingComment || hasComment) && (
                <div className="pr-6 mt-2">
                    {editingComment ? (
                        <div className="flex items-center gap-1">
                            <input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={handleSaveComment}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveComment();
                                    if (e.key === 'Escape') { setDraft(subtask.comment ?? ''); setEditingComment(false); }
                                }}
                                placeholder="הערה..."
                                className="flex-1 text-xs p-1 border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                            />
                            <button onClick={handleSaveComment} className="cursor-pointer text-[10px] font-bold text-blue-600">שמור</button>
                        </div>
                    ) : (
                        <button onClick={() => setEditingComment(true)} className="cursor-pointer text-[11px] text-blue-600 italic hover:underline text-right block">
                            💬 {subtask.comment}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, body, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 border border-slate-200">
            <h3 className="text-lg font-black text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-600 mb-6">{body}</p>
            <div className="flex justify-end gap-3">
                <button onClick={onCancel} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition">
                    ביטול
                </button>
                <button onClick={onConfirm} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition">
                    מחק לצמיתות
                </button>
            </div>
        </div>
    </div>
);

export default CustomerCard;