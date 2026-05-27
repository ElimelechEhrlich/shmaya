// src/pages/Tasks.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { LogService } from '../services/LogService';
import {
    PRIORITY_LEVELS,
    PRIORITY_STYLES,
} from '../registries/CustomerRegistry';

// הגדרת המבנה של שורת תת-משימה במערכת (מתוך ה-Subtasks View המנורמל)
interface SubtaskViewRow {
    taskId: string;
    subtaskId: string | null;
    subtaskTitle: string;
    parentTaskId: string | null;
    parentTitle: string | null;
    clientId: string | null;
    customerName: string | null;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    comment?: string | null;
    taskStatus?: 'pending' | 'completed';
}

interface CustomerOption {
    id: string;
    customerDetails?: { fullName?: string };
    businessDetails?: { businessName?: string };
    [key: string]: any;
}

interface TaskFilters {
    statuses: string[];
    categories: string[];
    clients: string[];
    search: string;
}

interface MultiSelectProps {
    label: string;
    options: [string, string][];
    selected: string[];
    onChange: (selected: string[]) => void;
}

interface SubtaskTableRowProps {
    row: SubtaskViewRow;
    onToggle: (completed: boolean) => void;
    onSaveTitle: (title: string) => void;
    onCustomerClick: () => void;
    onEditClick: () => void;
}

interface CreateTaskModalProps {
    customers: CustomerOption[];
    taskToEdit: SubtaskViewRow | null;
    onClose: () => void;
    onCreated: () => void;
}

export default function Tasks(): React.ReactElement {
    const navigate = useNavigate();
    const [rows, setRows] = useState<SubtaskViewRow[]>([]);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [editingTask, setEditingTask] = useState<SubtaskViewRow | null>(null);
    const [showCreate, setShowCreate] = useState<boolean>(false);

    const [filters, setFilters] = useState<TaskFilters>({
        statuses: [],
        categories: [],
        clients: [],
        search: '',
    });

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        const [view, custList] = await Promise.all([
            PersistenceAdapter.fetchAllSubtasksView(),
            PersistenceAdapter.fetchAllCustomers(),
        ]);
        setRows((view.data as SubtaskViewRow[]) ?? []);
        // המרה לטיפוס המתאים כדי למנוע קריסה בקומפוננטת המודאל
        setCustomers((custList.data as any[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const categories = useMemo((): [string, string][] => {
        const map = new Map<string, string>();
        for (const r of rows) {
            if (r.taskId && !map.has(r.taskId)) {
                map.set(r.taskId, r.parentTitle || r.taskId);
            }
        }
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const clientOptions = useMemo((): [string, string][] => {
        const set = new Map<string, string>();
        for (const r of rows) {
            if (r.clientId) set.set(r.clientId, r.customerName || '—');
        }
        const hasOffice = rows.some(r => !r.clientId);
        const list = Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
        if (hasOffice) list.unshift(['__OFFICE__', '🏢 משימה משרדית כללית']);
        return list;
    }, [rows]);

    const filtered = useMemo(() => rows.filter(r => {
        const statusKey = r.completed ? 'completed' : 'pending';
        if (filters.statuses.length && !filters.statuses.includes(statusKey)) return false;
        if (filters.categories.length && r.taskId && !filters.categories.includes(r.taskId)) return false;
        if (filters.clients.length) {
            const key = r.clientId ?? '__OFFICE__';
            if (!filters.clients.includes(key)) return false;
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            const haystack = `${r.subtaskTitle || ''} ${r.parentTitle || ''} ${r.customerName || ''}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    }), [rows, filters]);

    // הפעלת שינוי הסטטוס ישירות מול הטבלה הנקייה ב-Adapter
    const setSubtaskCompleted = useCallback(async (row: SubtaskViewRow, completed: boolean): Promise<void> => {
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, completed }
                : r
        ));

        if (row.subtaskId === null) {
            const next = completed ? 'completed' : 'pending';
            const { error } = await PersistenceAdapter.updateTaskStatus(row.taskId, next);
            if (error) { console.error(error.message); load(); return; }
            await LogService.recordTaskStatusChange(row.taskId, completed ? 'pending' : 'completed', next);
            return;
        }

        // עדכון סטטוס תת המשימה בטבלה המנורמלת sub_tasks
        const { error } = await PersistenceAdapter.updateSubtaskStatus(row.taskId, row.subtaskId, completed);
        if (error) { console.error(error.message); load(); return; }

        await LogService.recordAction('subtask.toggle', 'task', row.taskId, { subtaskId: row.subtaskId, completed });
    }, [load]);

    // שמירת כותרת מהירה ישירות מהשורה בטבלה
    const saveTitle = useCallback(async (row: SubtaskViewRow, newTitle: string): Promise<void> => {
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === row.subtaskTitle) return;

        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, subtaskTitle: trimmed }
                : r
        ));

        const { error } = row.subtaskId === null
            ? await PersistenceAdapter.updateTaskTitle(row.taskId, trimmed)
            : await PersistenceAdapter.updateSubtaskTitle(row.taskId, row.subtaskId, trimmed);
            
        if (error) { console.error(error.message); load(); return; }
        await LogService.recordTaskChange(row.taskId, { title: row.subtaskTitle }, { title: trimmed });
    }, [load]);

    const resetFilters = (): void => setFilters({ statuses: [], categories: [], clients: [], search: '' });

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">Missions</h1>
                        <h1 className="text-3xl font-black text-slate-900">משימות</h1>
                        <p className="text-sm text-slate-500 mt-1">כל המשימות במערכת, מבט תת-משימה מנורמל</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition"
                    >
                        <span className="text-lg leading-none">+</span> משימה חדשה
                    </button>
                </div>

                {/* Filter bar */}
                <div className="card-base p-4 mb-6 bg-white rounded-2xl border shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input
                            type="text"
                            placeholder="🔍 חיפוש..."
                            value={filters.search}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, search: e.target.value })}
                            className="input-style"
                        />
                        <MultiSelect
                            label="סטטוס"
                            options={[['pending', 'פתוחות'], ['completed', 'הושלמו']]}
                            selected={filters.statuses}
                            onChange={(s) => setFilters({ ...filters, statuses: s })}
                        />
                        <MultiSelect
                            label="קטגוריה"
                            options={categories}
                            selected={filters.categories}
                            onChange={(s) => setFilters({ ...filters, categories: s })}
                        />
                        <MultiSelect
                            label="לקוח"
                            options={clientOptions}
                            selected={filters.clients}
                            onChange={(s) => setFilters({ ...filters, clients: s })}
                        />
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">מציג {filtered.length} מתוך {rows.length} משימות</span>
                        <button onClick={resetFilters} className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold transition">
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="card-base overflow-hidden bg-white rounded-2xl border shadow-sm">
                    {loading ? (
                        <div className="p-12 text-center font-bold text-slate-400">טוען...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 italic">לא נמצאו משימות תואמות.</div>
                    ) : (
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-12 text-center">✓</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">משימה</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">לקוח</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">קטגוריה</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">עדיפות</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((row) => (
                                    <SubtaskTableRow
                                        key={`${row.taskId}-${row.subtaskId ?? 'parent'}`}
                                        row={row}
                                        onToggle={(c) => setSubtaskCompleted(row, c)}
                                        onSaveTitle={(t) => saveTitle(row, t)}
                                        onCustomerClick={() => row.clientId && navigate(`/admin/customers/${row.clientId}`)}
                                        onEditClick={() => setEditingTask(row)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {(showCreate || editingTask) && (
                <CreateTaskModal
                    customers={customers}
                    taskToEdit={editingTask}
                    onClose={() => { setShowCreate(false); setEditingTask(null); }}
                    onCreated={() => { setShowCreate(false); setEditingTask(null); load(); }} />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Multi-select dropdown
// ──────────────────────────────────────────────────────────────────

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
    const [open, setOpen] = useState<boolean>(false);
    const summary = selected.length === 0
        ? 'הכל'
        : selected.length === 1
            ? (options.find(([v]) => v === selected[0])?.[1] ?? selected[0])
            : `${selected.length} נבחרו`;

    const toggle = (val: string) => {
        if (selected.includes(val)) onChange(selected.filter(v => v !== val));
        else onChange([...selected, val]);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="cursor-pointer w-full input-style text-right flex justify-between items-center bg-white border rounded-xl p-2.5 text-sm"
            >
                <span className="text-xs text-slate-400 font-bold">{label}: </span>
                <span className="text-sm font-medium truncate mx-1">{summary}</span>
                <span className="text-slate-400 text-xs">▾</span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        <div className="flex justify-between p-2 border-b border-slate-100 sticky top-0 bg-white">
                            <button type="button" onClick={() => onChange(options.map(([v]) => v))} className="cursor-pointer text-[11px] text-blue-600 font-bold hover:underline">בחר הכל</button>
                            <button type="button" onClick={() => onChange([])} className="cursor-pointer text-[11px] text-slate-500 font-bold hover:underline">נקה</button>
                        </div>
                        {options.map(([val, lbl]) => (
                            <label key={val} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(val)}
                                    onChange={() => toggle(val)}
                                    className="cursor-pointer accent-blue-600 w-4 h-4"
                                />
                                <span className="text-sm text-slate-700">{lbl}</span>
                            </label>
                        ))}
                        {options.length === 0 && (
                            <div className="p-4 text-center text-xs text-slate-400 italic">אין אפשרויות</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────
// Single row component
// ──────────────────────────────────────────────────────────────────

const SubtaskTableRow: React.FC<SubtaskTableRowProps> = ({ 
    row, 
    onToggle, 
    onSaveTitle, 
    onCustomerClick,
    onEditClick
}) => {
    const [editing, setEditing] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>(row.subtaskTitle);

    const handleSave = () => {
        setEditing(false);
        onSaveTitle(draft);
    };

    const priorityStyle = PRIORITY_STYLES[row.priority || 'medium'];

    return (
        <tr className={`transition ${row.completed ? 'bg-green-50/40' : 'hover:bg-slate-50'}`}>
            <td className="p-3 text-center">
                <input
                    type="checkbox"
                    checked={row.completed}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onToggle(e.target.checked)}
                    className="cursor-pointer w-5 h-5 accent-blue-600"
                />
            </td>
            <td className="p-3">
                {editing ? (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={draft}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') { setDraft(row.subtaskTitle); setEditing(false); }
                            }}
                            className="input-style flex-1"
                        />
                        <button type="button" onClick={handleSave} title="שמור" className="cursor-pointer text-green-600 hover:text-green-800 text-lg">💾</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${row.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {row.subtaskTitle}
                        </span>
                        {row.subtaskId && row.parentTitle !== row.subtaskTitle && (
                            <span className="text-[10px] text-slate-400">· {row.parentTitle}</span>
                        )}
                        <button
                            type="button"
                            onClick={onEditClick}
                            title="עריכת משימה מלאה"
                            className="cursor-pointer text-slate-300 hover:text-blue-600 text-sm font-bold px-1"
                        >
                            ✎
                        </button>
                    </div>
                )}
                {row.comment && (
                    <div className="text-[11px] text-blue-600 italic mt-1">💬 {row.comment}</div>
                )}
            </td>
            <td className="p-3">
                {row.clientId ? (
                    <button
                        type="button"
                        onClick={onCustomerClick}
                        title="פתח כרטיס לקוח"
                        className="cursor-pointer text-sm font-medium text-slate-700 hover:text-blue-700 hover:underline transition flex items-center gap-1"
                    >
                        {row.customerName || '—'} <span className="text-[10px] opacity-50">↗</span>
                    </button>
                ) : (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">🏢 משרד</span>
                )}
            </td>
            <td className="p-3">
                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-mono">
                    {row.parentTitle || '—'}
                </span>
            </td>
            <td className="p-3">
                <span className={`${priorityStyle?.bg || 'bg-slate-50'} ${priorityStyle?.text || 'text-slate-600'} ${priorityStyle?.border || 'border-slate-200'} border px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider`}>
                    {priorityStyle?.label || 'רגיל'}
                </span>
            </td>
            <td className="p-3 text-left">
                {row.taskStatus === 'completed' && row.subtaskId !== null && (
                    <span className="text-[10px] text-green-700 font-bold">משימת אב הושלמה</span>
                )}
            </td>
        </tr>
    );
};

// ──────────────────────────────────────────────────────────────────
// Create task modal component (Transactional & Fixed UI Layout)
// ──────────────────────────────────────────────────────────────────

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ customers, taskToEdit, onClose, onCreated }) => {
    const [title, setTitle] = useState<string>(taskToEdit ? taskToEdit.subtaskTitle : '');
    const [isOffice, setIsOffice] = useState<boolean>(taskToEdit ? !taskToEdit.clientId : false);
    const [clientId, setClientId] = useState<string>(taskToEdit?.clientId || '');
    const [priority, setPriority] = useState<string>(taskToEdit?.priority || 'medium');
    const [comment, setComment] = useState<string>(taskToEdit?.comment || '');
    
    const [siblingSubtasks, setSiblingSubtasks] = useState<any[]>([]);
    const [saving, setSaving] = useState<boolean>(false);
    const [err, setErr] = useState<string>('');

    // אפקט שליפת משימות אחיות מתוך ה-Database המנורמל החדש
    useEffect(() => {
        if (taskToEdit && taskToEdit.clientId) {
            PersistenceAdapter.fetchTasksForCustomer(taskToEdit.clientId).then(({ data }) => {
                const currentTask = (data || []).find((t: any) => t.id === taskToEdit.taskId);
                if (currentTask && currentTask.subTasks) {
                    const siblings = (currentTask.subTasks as any[]).filter(s => s.id !== taskToEdit.subtaskId);
                    setSiblingSubtasks(siblings);
                }
            });
        }
    }, [taskToEdit]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErr('');
        if (!title.trim()) { setErr('כותרת חובה'); return; }
        if (!isOffice && !clientId) { setErr('בחר לקוח או סמן משימה משרדית'); return; }
        setSaving(true);

        let result;

        if (taskToEdit) {
            // קריאה ישירה לפונקציית העדכון האטומית והמנורמלת ב-Adapter
            result = await PersistenceAdapter.updateSubtask(
                taskToEdit.subtaskId || '',
                taskToEdit.taskId,
                {
                    title: title.trim(),
                    priority: priority,
                    comment: comment.trim()
                }
            );
        } else {
            // מצב יצירת משימה מנורמלת חדשה לחלוטין
            result = await PersistenceAdapter.insertSingleTask({
                title: title.trim(),
                clientId: isOffice ? null : clientId,
                priority: priority as any,
                subTasks: []
            });
        }

        setSaving(false);

        if (result.error) {
            setErr(result.error.message || 'שגיאה בשמירת המידע');
            return;
        }

        await LogService.recordAction(
            taskToEdit ? 'task.update' : 'task.create',
            'task',
            taskToEdit ? taskToEdit.taskId : '',
            { title: title.trim(), clientId: isOffice ? null : clientId, priority }
        );

        onCreated();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xl font-black text-slate-900">
                            {taskToEdit ? 'עריכת תת-משימה' : 'משימה חדשה'}
                        </h3>
                        <button type="button" onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700 text-xl">×</button>
                    </div>

                    <div className="p-6 space-y-4">
                        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

                        {/* שם תת-משימה */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">שם תת-המשימה *</label>
                            <input
                                value={title}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                                className="input-style"
                                placeholder="הקלד את כותרת המשימה..."
                                required
                            />
                        </div>

                        {/* שדה הערות מובנה בטבלה */}
                        {taskToEdit && taskToEdit.subtaskId !== null && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">הערות ועדכונים לתת-משימה זו</label>
                                <textarea
                                    value={comment}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                                    className="input-style h-20 resize-none py-2"
                                    placeholder="הוסף הערה פנימית, סטטוס התקדמות או דגשים לשורה זו..."
                                />
                            </div>
                        )}

                        {/* שיוך לקוח / משרד */}
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
                                        <span className="text-sm font-bold text-slate-700">משימה משרדית כללית (ללא לקוח)</span>
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
                                                    {c.full_name || '—'}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* רמת עדיפות */}
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

                        {/* תצוגת משימות אחיות מאותו אבא */}
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
                            {saving ? 'שומר...' : taskToEdit ? 'שמור שינויים' : 'צור משימה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};