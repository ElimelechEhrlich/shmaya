// Create task modal component (Transactional & Fixed UI Layout)
// ──────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { OFFICE_CUSTOMER_ID, PersistenceAdapter } from '../services/PersistenceAdapter';
import { authService } from '../services/authService';
import { PRIORITY_LEVELS, PRIORITY_STYLES } from '../registries/CustomerRegistry';

interface CustomerOption {
    id: string;
    customerDetails?: { fullName?: string };
    [key: string]: any;
}

export interface CreateTaskModalProps {
    customers: CustomerOption[];
    taskToEdit: {
        taskId: string;
        subtaskId: string | null;
        subtaskTitle: string;
        parentTaskId: string | null;
        parentTitle: string | null;
        clientId: string | null;
        customerName: string | null;
        completed: boolean;
        priority: 'low' | 'medium' | 'high' | 'critical';
        comment?: string | null;
        taskStatus?: 'pending' | 'completed';
    } | null;
    onClose: () => void;
    onCreated: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ customers, taskToEdit, onClose, onCreated }) => {
    const [title, setTitle] = useState<string>(taskToEdit ? taskToEdit.subtaskTitle : '');
    const [isOffice, setIsOffice] = useState<boolean>(taskToEdit ? !taskToEdit.clientId : false);
    const [clientId, setClientId] = useState<string>(taskToEdit?.clientId || '');
    const [priority, setPriority] = useState<string>(taskToEdit?.priority || 'medium');
    const [isCompleted, setIsCompleted] = useState<boolean>(taskToEdit ? taskToEdit.completed : false);
    const [comment, setComment] = useState<string>(taskToEdit?.comment || '');
    const [siblingSubtasks, setSiblingSubtasks] = useState<any[]>([]);
    const [saving, setSaving] = useState<boolean>(false);
    const [err, setErr] = useState<string>('');

    useEffect(() => {
        if (taskToEdit && taskToEdit.clientId && taskToEdit.taskId) {
            PersistenceAdapter.fetchTasksForCustomer(taskToEdit.clientId).then(({ data }) => {
                const currentTask = (data || []).find((t: any) => t.id === taskToEdit.taskId);
                if (currentTask && currentTask.subTasks) {
                    const siblings = (currentTask.subTasks as any[]).filter(s => s.id !== taskToEdit.subtaskId);
                    setSiblingSubtasks(siblings);
                }
            });
        }
    }, [taskToEdit]);

    const originalComment = useMemo(() => {
        if (taskToEdit?.comment) return taskToEdit.comment;
        if (!isOffice && clientId) {
            const selectedCust = customers.find(c => c.id === clientId);
            return selectedCust?.comments || '';
        }
        return '';
    }, [taskToEdit, isOffice, clientId, customers]);

// בתוך handleSubmit בקומפוננטה CreateTaskModal (בתחתית Tasks.tsx)

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr('');
    if (!title.trim()) { setErr('כותרת חובה'); return; }
    if (!isOffice && !clientId) { setErr('בחר לקוח או סמן משימה משרדית'); return; }

    // ✨ בדיקת חסימה משופרת: אם המשתמש מנסה להשאיר או לסמן את המשימה כ"בוצע"
    // והטקסט של המשימה מכיל "אישור ניהול סופי" - נחסום את ה-Submit של הטופס!
    const isTryingToApprove = isCompleted && title.toLowerCase().includes("אישור ניהול סופי");
    
    if (isTryingToApprove && !authService.canApproveFinal(title)) {
        setErr('אין לך הרשאה לסמן את המשימה הזו כבוצע!');
        return;
    }

    setSaving(true);
    // ... המשך פקודות ה-try/catch של ה-PersistenceAdapter שלך כרגיל ...

        try {
            if (taskToEdit) {
                const subtaskResult = await PersistenceAdapter.updateSubtask(
                    taskToEdit.subtaskId || '',
                    taskToEdit.taskId,
                    {
                        title: title.trim(),
                        priority: priority,
                        comment: comment.trim()
                    }
                );
                if (subtaskResult.error) throw new Error(subtaskResult.error.message);

                if (taskToEdit.subtaskId) {
                    const statusResult = await PersistenceAdapter.updateSubtaskStatus(taskToEdit.taskId, taskToEdit.subtaskId, isCompleted);
                    if (statusResult.error) throw new Error(statusResult.error.message);
                } else {
                    const parentStatusResult = await PersistenceAdapter.updateTaskStatus(taskToEdit.taskId, isCompleted ? 'completed' : 'pending');
                    if (parentStatusResult.error) throw new Error(parentStatusResult.error.message);
                }
            } else {
                const insertResult = await PersistenceAdapter.insertSingleTask({
                    title: title.trim(),
                    clientId: isOffice ? OFFICE_CUSTOMER_ID : clientId,
                    subTasks: []
                } as any);
                
                if (insertResult.error) throw insertResult.error;
            }

            setSaving(false);
            onCreated();
        } catch (error: any) {
            console.error('Error in CreateTaskModal handleSubmit:', error);
            setErr(error.message || 'שגיאה בשמירת הנתונים במערכת');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xl font-black text-slate-900">
                            {taskToEdit ? 'עריכת משימה' : 'משימה חדשה'}
                        </h3>
                        <button type="button" onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700 text-xl">×</button>
                    </div>

                    <div className="p-6 space-y-5">
                        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

                        {taskToEdit && (
                            <div className={`flex items-center justify-between p-3.5 rounded-xl border transition ${isCompleted ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                <div className="flex flex-col">
                                    <span className="text-xs font-black uppercase tracking-wide">סטטוס משימה</span>
                                    <span className="text-xs text-slate-400 mt-0.5">{isCompleted ? 'המשימה מסומנת כהושלמה' : 'המשימה ממתינה לטיפול'}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsCompleted(!isCompleted)}
                                    className={`cursor-pointer px-4 py-1.5 rounded-xl text-xs font-black transition ${isCompleted ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}`}
                                >
                                    {isCompleted ? '✓ בוצע' : 'סמן כבוצע'}
                                </button>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">שם המשימה *</label>
                            <input
                                value={title}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                                className="input-style"
                                placeholder="הקלד את כותרת המשימה..."
                                required
                            />
                        </div>

                        {originalComment && (
                            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
                                <label className="text-[10px] font-black text-blue-700 uppercase block mb-1 tracking-wide">📋 נתוני ליבה קבועים (מהקמת הלקוח):</label>
                                <p className="text-xs text-slate-600 font-medium whitespace-pre-wrap leading-relaxed">
                                    {originalComment}
                                </p>
                            </div>
                        )}

                        {taskToEdit && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">הערות ועדכונים למשימה זו</label>
                                <textarea
                                    value={comment}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                                    className="input-style h-20 resize-none py-2"
                                    placeholder="הוסף הערה פנימית, סטטוס התקדמות או דגשים..."
                                />
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">משוייך אל</label>
                            {taskToEdit ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-semibold text-slate-700">
                                    {taskToEdit.clientId ? `🏢 לקוח: ${taskToEdit.customerName}` : '🏢 משימה משרדית כללית'}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                                        <input
                                            type="checkbox"
                                            checked={isOffice}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                setIsOffice(e.target.checked);
                                                if (e.target.checked) setClientId('');
                                            }}
                                            className="cursor-pointer w-5 h-5 accent-blue-600"
                                        />
                                        <span className="text-sm font-bold text-slate-700">Mishrad - משימה משרדית כללית</span>
                                    </label>

                                    {!isOffice && (
                                        <select
                                            value={clientId}
                                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setClientId(e.target.value)}
                                            className="input-style cursor-pointer"
                                            required={!isOffice}
                                        >
                                            <option value="">בחר לקוח...</option>
                                            {customers.map((c: any) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.customerDetails?.fullName || c.full_name || '—'}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">רמת עדיפות</label>
                            <div className="flex gap-2">
                                {PRIORITY_LEVELS.map((p: any) => {
                                    const style = PRIORITY_STYLES[p as 'low' | 'medium' | 'high'] || PRIORITY_STYLES['medium'];
                                    const selected = priority === p;
                                    return (
                                        <button
                                            type="button"
                                            key={p}
                                            onClick={() => setPriority(p)}
                                            className={`cursor-pointer flex-1 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition border ${selected ? `${style?.bg || ''} ${style?.text || ''} ${style?.border || ''}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {style?.label || p}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {taskToEdit && siblingSubtasks.length > 0 && (
                            <div className="pt-3 border-t border-slate-100">
                                <label className="text-[10px] font-bold text-slate-400 block mb-2">תתי-משימות נוספים תחת קטגוריית: ({taskToEdit.parentTitle})</label>
                                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                                    {siblingSubtasks.map((s: any) => (
                                        <div key={s.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2 opacity-70">
                                            <span className={`text-xs ${s.completed ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                                                • {s.title}
                                            </span>
                                            {s.completed && <span className="text-[10px] text-green-600 font-bold">✓ הושלם</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                        <button type="button" onClick={onClose} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition">ביטול</button>
                        <button type="submit" disabled={saving} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition">
                            {saving ? 'שומר...' : 'שמור שינויים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
