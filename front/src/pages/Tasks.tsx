// src/pages/Tasks.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { OFFICE_CUSTOMER_ID, PersistenceAdapter } from '../services/PersistenceAdapter';
import { LogService } from '../services/LogService';
import {
    PRIORITY_LEVELS,
    PRIORITY_STYLES,
} from '../registries/CustomerRegistry';
import { authService } from '../services/authService';
import { CreateTaskModal, type CreateTaskModalProps } from '../comps/CreateTaskModal';
import { translateError } from '../utils/translateError';

// הגדרת המבנה של שורת תת-משימה במערכת (מתוך ה-Subtasks View המנורמל)
export interface SubtaskViewRow {
    taskId: string;
    subtaskId: string | null;
    subtaskTitle: string;
    parentTaskId: string | null;
    parentTitle: string | null;
    clientId: string | null;
    customerName: string | null;
    completed: boolean;
    priority: 'low' | 'medium' | 'high' | 'critical'; // שונה לכלול critical
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
    priorities: string[]; // 👈 הוספת סינון דחיפות מרובה
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
    onOpenPage: () => void;
    onPriorityChange: (priority: string) => void;
}


// ✨ משקולות לצורך מיון דחיפות פנימי (מהגבוה לנמוך)
const PRIORITY_WEIGHTS = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
};


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
        priorities: [], // 👈 איתחול מערך ריק
        search: '',
    });
    const [sortConfig, setSortConfig] = useState<{ sortBy: 'title' | 'priority' | null; direction: 'asc' | 'desc' | null }>({
        sortBy: null,
        direction: null
    });
    const load = useCallback(async () => {
        setLoading(true);
        const [subtasksResult, customersResult] = await Promise.all([
            PersistenceAdapter.fetchAllSubtasksView(),
            PersistenceAdapter.fetchAllCustomers(),
        ]);
        if (subtasksResult.error) {
            alert(`שגיאה בטעינת רשימת המשימות: ${translateError(subtasksResult.error.message)}`);
            console.error(subtasksResult.error.message);
        } else if (subtasksResult.data) {
            const uniqueRows = subtasksResult.data.filter((row, index, self) =>
                index === self.findIndex((r) => r.subtaskId === row.subtaskId)
            );
            setRows(uniqueRows);
        }
        setCustomers((customersResult.data as any[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const categories = useMemo((): [string, string][] => {
        const uniqueTitles = new Set<string>();
        for (const r of rows) {
            const title = r.parentTitle;
            if (title && title.trim() !== '') {
                uniqueTitles.add(title.trim());
            }
        }
        return Array.from(uniqueTitles)
            .sort((a, b) => a.localeCompare(b))
            .map(title => [title, title]);
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

    const handlePriorityChange = useCallback(async (row: SubtaskViewRow, newPriority: string) => {
        const prevPriority = row.priority;
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, priority: newPriority as any }
                : r
        ));
        const { error } = row.subtaskId === null
            ? await PersistenceAdapter.updateTaskStatus(row.taskId, row.taskStatus || 'pending')
            : await PersistenceAdapter.updateSubtaskPriority(row.subtaskId, newPriority as any);
        if (error) {
            alert(`שגיאה בעדכון הדחיפות: ${translateError(error.message)}`);
            console.error(error.message);
            setRows(prev => prev.map(r =>
                r.taskId === row.taskId && r.subtaskId === row.subtaskId
                    ? { ...r, priority: prevPriority }
                    : r
            ));
        }
    }, []);

    const filtered = useMemo(() => rows.filter(r => {
        const statusKey = r.completed ? 'completed' : 'pending';
        if (filters.statuses.length && !filters.statuses.includes(statusKey)) return false;
        if (filters.categories.length && !filters.categories.includes(r.parentTitle || '')) return false;
        const itemPriority = (r.priority || 'medium').toLowerCase();
        if (filters.priorities.length && !filters.priorities.includes(itemPriority)) return false;
        if (filters.clients.length) {
            if (!filters.clients.includes(r.clientId ?? '__OFFICE__')) return false;
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            if (
                !(r.subtaskTitle || '').toLowerCase().includes(q) &&
                !(r.parentTitle || '').toLowerCase().includes(q) &&
                !(r.customerName || '').toLowerCase().includes(q)
            ) return false;
        }
        return true;
    }), [rows, filters]);

    const sorted = useMemo(() => {
        if (!sortConfig.sortBy || !sortConfig.direction) return filtered;
        const { sortBy, direction } = sortConfig;
        const isAsc = direction === 'asc';
        return [...filtered].sort((a, b) => {
            if (sortBy === 'title') {
                return isAsc
                    ? (a.subtaskTitle || '').localeCompare(b.subtaskTitle || '')
                    : (b.subtaskTitle || '').localeCompare(a.subtaskTitle || '');
            }
            if (sortBy === 'priority') {
                const w: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
                const wA = w[(a.priority || 'medium').toLowerCase()] || 2;
                const wB = w[(b.priority || 'medium').toLowerCase()] || 2;
                return isAsc ? wA - wB : wB - wA;
            }
            return 0;
        });
    }, [filtered, sortConfig]);

// בתוך src/pages/Tasks.tsx

const setSubtaskCompleted = useCallback(async (row: SubtaskViewRow, completed: boolean): Promise<void> => {
    if (!authService.canApproveFinal(row.subtaskTitle)) {
        alert("אין לך הרשאה לשנות את הסטטוס של אישור ניהול סופי!");
        return;
    }

    setRows(prev => prev.map(r =>
        r.subtaskId === row.subtaskId ? { ...r, completed } : r
    ));

// שליחה ישירה לאדפטר - ה-subtaskId מובטח להיות UUID חוקי ותקין
    const { error } = await PersistenceAdapter.updateSubtaskStatus(row.taskId, row.subtaskId!, completed);
    
    if (error) {
        alert(`שגיאה בסימון תת-המשימה: ${translateError(error.message)}`);
        console.error(error.message);
        load(); // טעינה מחדש של המצב האמיתי במקרה של כישלון
    }
    
        // const prevCompleted = row.completed;
        //// setRows(prev => prev.map(r =>
        //     r.taskId === row.taskId && r.subtaskId === row.subtaskId ? { ...r, completed } : r
        // ));
}, [load]);

    // if (row.subtaskId === null) {
    //     const nextStatus = completed ? 'completed' : 'pending';
    //     const { error } = await PersistenceAdapter.updateTaskStatus(row.taskId, nextStatus);
    //     if (error) {
    //         console.error(error.message);
    //         setRows(prev => prev.map(r =>
    //             r.taskId === row.taskId && r.subtaskId === row.subtaskId ? { ...r, completed: prevCompleted } : r
    //         ));
    //         return;
    //     }
        // await LogService.recordTaskStatusChange(row.taskId, completed ? 'pending' : 'completed', nextStatus);
//     } else {
//         const { error } = await PersistenceAdapter.updateSubtaskStatus(row.taskId, row.subtaskId, completed);
//         if (error) {
//             console.error(error.message);
//             setRows(prev => prev.map(r =>
//                 r.taskId === row.taskId && r.subtaskId === row.subtaskId ? { ...r, completed: prevCompleted } : r
//             ));
//         }
//     }
// }, []);

    const saveTitle = useCallback(async (row: SubtaskViewRow, newTitle: string): Promise<void> => {
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === row.subtaskTitle) return;

        const prevTitle = row.subtaskTitle;
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, subtaskTitle: trimmed }
                : r
        ));

        const { error } = row.subtaskId === null
            ? await PersistenceAdapter.updateTaskTitle(row.taskId, trimmed)
            : await PersistenceAdapter.updateSubtaskTitle(row.taskId, row.subtaskId, trimmed);

        if (error) {
            alert(`שגיאה בשמירת שם תת-המשימה: ${translateError(error.message)}`);
            console.error(error.message);
            setRows(prev => prev.map(r =>
                r.taskId === row.taskId && r.subtaskId === row.subtaskId
                    ? { ...r, subtaskTitle: prevTitle }
                    : r
            ));
            return;
        }
        await LogService.recordTaskChange(row.taskId, { title: prevTitle }, { title: trimmed });
    }, []);

    const resetFilters = (): void => setFilters({ statuses: [], categories: [], clients: [], priorities: [], search: '' });
    const handleSort = (field: 'title' | 'priority') => {
        setSortConfig(prev => {
            if (prev.sortBy !== field) {
                return { sortBy: field, direction: 'asc' }; // לחיצה ראשונה: עולה
            }
            if (prev.direction === 'asc') {
                return { sortBy: field, direction: 'desc' }; // לחיצה שנייה: יורד
            }
            return { sortBy: null, direction: null }; // לחיצה שלישית: איפוס (ללא מיון)
        });
    };

    // פונקציית עזר קטנה שמחזירה את האייקון הנכון לפי מצב המיון הנוכחי של העמודה
    const getSortIcon = (field: 'title' | 'priority') => {
        if (sortConfig.sortBy !== field) return ' ⇅';
        if (sortConfig.direction === 'asc') return ' ↑';
        return ' ↓';
    };

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
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
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
                        {/* 👈 הזרקת ה-MultiSelect החדש של הדחיפות בדיוק לפי המבנה שלך */}
                        <MultiSelect
                            label="דחיפות"
                            options={[['low', 'נמוכה'], ['medium', 'בינונית'], ['high', 'גבוהה'], ['critical', 'קריטית']]}
                            selected={filters.priorities}
                            onChange={(s) => setFilters({ ...filters, priorities: s })}
                        />
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">מציג {sorted.length} מתוך {rows.length} משימות</span>
                        <button onClick={resetFilters} className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold transition">
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="card-base overflow-hidden bg-white rounded-2xl border shadow-sm">
                    {loading ? (
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>{[1,2,3,4,5,6].map(i => (
                                    <th key={i} className="p-3"><div className="h-3 bg-slate-200 rounded animate-pulse" /></th>
                                ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[1,2,3,4,5,6,7,8].map(i => (
                                    <tr key={i}>{[1,2,3,4,5,6].map(j => (
                                        <td key={j} className="p-3"><div className="h-5 bg-slate-100 rounded animate-pulse" /></td>
                                    ))}</tr>
                                ))}
                            </tbody>
                        </table>
                    ) : sorted.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 italic">לא נמצאו משימות תואמות.</div>
                    ) : (
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider w-12 text-center">✓</th>

                                    {/* עמודת משימה לחיצה למיון לפי תאריך/כותרת */}
                                    <th
                                        onClick={() => handleSort('title')}
                                        className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition select-none"
                                    >
                                        משימה <span className="text-blue-600 font-black">{getSortIcon('title')}</span>
                                    </th>

                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">לקוח</th>
                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider">קטגוריה</th>

                                    {/* עמודת עדיפות לחיצה למיון */}
                                    <th
                                        onClick={() => handleSort('priority')}
                                        className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition select-none"
                                    >
                                        עדיפות <span className="text-blue-600 font-black">{getSortIcon('priority')}</span>
                                    </th>

                                    <th className="p-3 text-xs font-bold text-slate-600 uppercase tracking-wider"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {sorted.map((row) => (
                                    <SubtaskTableRow
                                        key={`${row.taskId}-${row.subtaskId ?? 'parent'}`}
                                        row={row}
                                        onToggle={(c) => setSubtaskCompleted(row, c)}
                                        onSaveTitle={(t) => saveTitle(row, t)}
                                        onCustomerClick={() => row.clientId && navigate(`/admin/customers/${row.clientId}`)}
                                        onEditClick={() => setEditingTask(row)}
                                        onOpenPage={() => navigate(`/admin/tasks/${row.taskId}`)}
                                        onPriorityChange={(p) => handlePriorityChange(row, p)}
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

const MultiSelect: React.FC<MultiSelectProps> = React.memo(({ label, options, selected, onChange }) => {
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
});

// ──────────────────────────────────────────────────────────────────
// Single row component (Updated with explicit Priority Selector)
// ──────────────────────────────────────────────────────────────────

const SubtaskTableRow: React.FC<SubtaskTableRowProps> = React.memo(({
    row,
    onToggle,
    onSaveTitle,
    onCustomerClick,
    onEditClick,
    onOpenPage,
    onPriorityChange,
}) => {
    const [editing, setEditing] = useState<boolean>(false);
    const [draft, setDraft] = useState<string>(row.subtaskTitle);

    const handleSave = () => {
        setEditing(false);
        onSaveTitle(draft);
    };

    // ✨ שימוש ב-PRIORITY_STYLES מעודכן
    const currentPriority = row.priority || 'medium';
    const priorityStyle = PRIORITY_STYLES[currentPriority as 'low' | 'medium' | 'high' | 'critical'] || PRIORITY_STYLES['medium'];

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
                        <button
                            type="button"
                            onClick={onOpenPage}
                            title="פתח בדף נפרד"
                            className="cursor-pointer text-slate-300 hover:text-violet-600 text-sm px-1"
                        >
                            ⧉
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

            {/* ✨ הפיכת רמת הדחיפות לסלקטור לחיץ וערוך ישירות מתוך השורה (סעיף 1) */}
            <td className="p-3">
                <div className="relative inline-block">
                    <select
                        value={currentPriority}
                        onChange={(e) => onPriorityChange(e.target.value)}
                        className={`cursor-pointer text-center font-black uppercase text-[10px] tracking-wider px-2.5 py-0.5 rounded-full border transition appearance-none ${priorityStyle?.bg || 'bg-slate-50'} ${priorityStyle?.text || 'text-slate-600'} ${priorityStyle?.border || 'border-slate-200'}`}
                        style={{ backgroundImage: 'none' }}
                    >
                        {PRIORITY_LEVELS.map((lv: string) => (
                            <option key={lv} value={lv}>
                                {PRIORITY_STYLES[lv as 'low' | 'medium' | 'high' | 'critical']?.label || lv}
                            </option>
                        ))}
                    </select>
                </div>
            </td>

            <td className="p-3 text-left">
                {row.taskStatus === 'completed' && row.subtaskId !== null && (
                    <span className="text-[10px] text-green-700 font-bold">משימת אב הושלמה</span>
                )}
            </td>
        </tr>
    );
});

// ──────────────────────────────────────────────────────────────────
