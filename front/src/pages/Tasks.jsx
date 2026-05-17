import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { PersistenceAdapter } from '../services/PersistenceAdapter.ts';
import { LogService } from '../services/LogService.ts';
import {
    PRIORITY_LEVELS,
    PRIORITY_STYLES,
    cascadeOnSubtaskSet,
} from '../registries/CustomerRegistry.ts';

/**
 * Cross-customer subtask browser.
 * Rows are individual subtasks (not parent categories). Filtering keys off
 * parent_task_id — never Hebrew title strings.
 */
export default function Tasks() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);

    const [filters, setFilters] = useState({
        statuses: [], // [] === all
        categories: [],
        clients: [],
        search: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        const [view, custList] = await Promise.all([
            PersistenceAdapter.fetchAllSubtasksView(),
            PersistenceAdapter.fetchAllCustomers(),
        ]);
        setRows(view.data ?? []);
        setCustomers(custList.data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const categories = useMemo(() => {
        const map = new Map();
        for (const r of rows) {
            if (r.parentTaskId && !map.has(r.parentTaskId)) {
                map.set(r.parentTaskId, r.parentTitle || r.parentTaskId);
            }
        }
        return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);

    const clientOptions = useMemo(() => {
        const set = new Map();
        for (const r of rows) {
            if (r.clientId) set.set(r.clientId, r.customerName || '—');
        }
        // Include office-wide bucket if any
        const hasOffice = rows.some(r => !r.clientId);
        const list = Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
        if (hasOffice) list.unshift(['__OFFICE__', '🏢 משימה משרדית כללית']);
        return list;
    }, [rows]);

    const filtered = useMemo(() => rows.filter(r => {
        const statusKey = r.completed ? 'completed' : 'pending';
        if (filters.statuses.length && !filters.statuses.includes(statusKey)) return false;
        if (filters.categories.length && !filters.categories.includes(r.parentTaskId)) return false;
        if (filters.clients.length) {
            const key = r.clientId ?? '__OFFICE__';
            if (!filters.clients.includes(key)) return false;
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            const haystack = `${r.subtaskTitle} ${r.parentTitle} ${r.customerName}`.toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    }), [rows, filters]);

    // ── row mutations ──

    const setSubtaskCompleted = useCallback(async (row, completed) => {
        // Local optimistic
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, completed }
                : r
        ));

        if (row.subtaskId === null) {
            // Parent-only task (no subtasks) — toggle the task status
            const next = completed ? 'completed' : 'pending';
            const { error } = await PersistenceAdapter.updateTaskStatus(row.taskId, next);
            if (error) { console.error(error.message); load(); return; }
            await LogService.recordTaskStatusChange(row.taskId, completed ? 'pending' : 'completed', next);
            return;
        }

        // Fetch task to compute cascade
        const customerTasks = await PersistenceAdapter.fetchTasksForCustomer(row.clientId);
        const task = (customerTasks.data ?? []).find(t => t.id === row.taskId);
        if (!task) { load(); return; }
        const cascade = cascadeOnSubtaskSet({ status: task.status, subTasks: task.subTasks }, row.subtaskId, completed);
        const { error } = await PersistenceAdapter.updateTask(row.taskId, {
            status: cascade.status,
            subTasks: cascade.subTasks,
        });
        if (error) { console.error(error.message); load(); return; }
        await LogService.recordTaskChange(row.taskId,
            { subTasks: task.subTasks, status: task.status },
            { subTasks: cascade.subTasks, status: cascade.status });

        // Reflect parent-status changes in other rows of the same task
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId ? { ...r, taskStatus: cascade.status } : r
        ));
    }, [load]);

    const saveTitle = useCallback(async (row, newTitle) => {
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === row.subtaskTitle) return;

        // Optimistic
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, subtaskTitle: trimmed }
                : r
        ));

        const { error } = row.subtaskId === null
            ? await PersistenceAdapter.updateTaskTitle(row.taskId, trimmed)
            : await PersistenceAdapter.updateSubtaskTitle(row.taskId, row.subtaskId, trimmed);
        if (error) { console.error(error.message); load(); return; }
        await LogService.recordTaskChange(row.taskId,
            { title: row.subtaskTitle },
            { title: trimmed });
    }, [load]);

    const resetFilters = () => setFilters({ statuses: [], categories: [], clients: [], search: '' });

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">משימות</h1>
                        <p className="text-sm text-slate-500 mt-1">כל המשימות במערכת, מבט תת-משימה</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition"
                    >
                        <span className="text-lg leading-none">+</span> משימה חדשה
                    </button>
                </div>

                {/* Filter bar */}
                <div className="card-base p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input
                            type="text"
                            placeholder="🔍 חיפוש..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
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
                <div className="card-base overflow-hidden">
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
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {showCreate && (
                <CreateTaskModal
                    customers={customers}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Multi-select dropdown with "Select all" / "Clear"
// ──────────────────────────────────────────────────────────────────

const MultiSelect = ({ label, options, selected, onChange }) => {
    const [open, setOpen] = useState(false);
    const summary = selected.length === 0
        ? 'הכל'
        : selected.length === 1
            ? (options.find(([v]) => v === selected[0])?.[1] ?? selected[0])
            : `${selected.length} נבחרו`;

    const toggle = (val) => {
        if (selected.includes(val)) onChange(selected.filter(v => v !== val));
        else onChange([...selected, val]);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="cursor-pointer w-full input-style text-right flex justify-between items-center"
            >
                <span className="text-xs text-slate-400 font-bold">{label}: </span>
                <span className="text-sm font-medium truncate">{summary}</span>
                <span className="text-slate-400 text-xs">▾</span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        <div className="flex justify-between p-2 border-b border-slate-100 sticky top-0 bg-white">
                            <button onClick={() => onChange(options.map(([v]) => v))} className="cursor-pointer text-[11px] text-blue-600 font-bold hover:underline">בחר הכל</button>
                            <button onClick={() => onChange([])} className="cursor-pointer text-[11px] text-slate-500 font-bold hover:underline">נקה</button>
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
// Single row — checkbox + inline-editable title + customer link
// ──────────────────────────────────────────────────────────────────

const SubtaskTableRow = ({ row, onToggle, onSaveTitle, onCustomerClick }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(row.subtaskTitle);

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
                    onChange={(e) => onToggle(e.target.checked)}
                    className="cursor-pointer w-5 h-5 accent-blue-600"
                />
            </td>
            <td className="p-3">
                {editing ? (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') { setDraft(row.subtaskTitle); setEditing(false); }
                            }}
                            className="input-style flex-1"
                        />
                        <button onClick={handleSave} title="שמור" className="cursor-pointer text-green-600 hover:text-green-800 text-lg">💾</button>
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
                            onClick={() => { setDraft(row.subtaskTitle); setEditing(true); }}
                            title="עריכה"
                            className="cursor-pointer text-slate-300 hover:text-blue-600 text-sm"
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
                    {row.parentTaskId || '—'}
                </span>
            </td>
            <td className="p-3">
                <span className={`${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border} border px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider`}>
                    {priorityStyle.label}
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
// Create-task modal — office-wide OR client-bound, with optional subtasks
// ──────────────────────────────────────────────────────────────────

const CreateTaskModal = ({ customers, onClose, onCreated }) => {
    const [title, setTitle] = useState('');
    const [isOffice, setIsOffice] = useState(false);
    const [clientId, setClientId] = useState('');
    const [priority, setPriority] = useState('medium');
    const [subTasks, setSubTasks] = useState([]);
    const [subDraft, setSubDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const addSubtask = () => {
        const t = subDraft.trim();
        if (!t) return;
        setSubTasks([...subTasks, { id: crypto.randomUUID(), title: t, completed: false, comment: '' }]);
        setSubDraft('');
    };

    const removeSubtask = (id) => setSubTasks(subTasks.filter(s => s.id !== id));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!title.trim()) { setErr('כותרת חובה'); return; }
        if (!isOffice && !clientId) { setErr('בחר לקוח או סמן משימה משרדית'); return; }
        setSaving(true);
        const taskData = {
            id: crypto.randomUUID(),
            clientId: isOffice ? null : clientId,
            parentTaskId: null,
            title: title.trim(),
            status: 'pending',
            restrictedTo: null,
            subTasks,
            priority,
        };
        const { error } = await PersistenceAdapter.insertSingleTask(taskData);
        if (error) {
            setErr(error.message);
            setSaving(false);
            return;
        }
        await LogService.recordAction('task.create', 'task', taskData.id, {
            title: taskData.title,
            isOfficeWide: isOffice,
            clientId: taskData.clientId,
            priority,
        });
        setSaving(false);
        onCreated();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xl font-black text-slate-900">משימה חדשה</h3>
                        <button type="button" onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700 text-xl">×</button>
                    </div>

                    <div className="p-6 space-y-4">
                        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">כותרת *</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="input-style"
                                placeholder="לדוגמה: בדיקת חשבונית..."
                                required
                            />
                        </div>

                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                            <input
                                type="checkbox"
                                checked={isOffice}
                                onChange={(e) => setIsOffice(e.target.checked)}
                                className="cursor-pointer w-5 h-5 accent-blue-600"
                            />
                            <span className="text-sm font-bold text-slate-700">🏢 משימה משרדית כללית (ללא לקוח)</span>
                        </label>

                        {!isOffice && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">לקוח *</label>
                                <select
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    className="input-style cursor-pointer"
                                    required={!isOffice}
                                >
                                    <option value="">בחר לקוח...</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.customerDetails?.fullName || '—'} {c.businessDetails?.businessName ? `(${c.businessDetails.businessName})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">עדיפות</label>
                            <div className="flex gap-2">
                                {PRIORITY_LEVELS.map(p => {
                                    const style = PRIORITY_STYLES[p];
                                    const selected = priority === p;
                                    return (
                                        <button
                                            type="button"
                                            key={p}
                                            onClick={() => setPriority(p)}
                                            className={`cursor-pointer flex-1 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition border ${selected ? `${style.bg} ${style.text} ${style.border}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {style.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">תתי-משימות (אופציונלי)</label>
                            <div className="flex gap-2 mb-2">
                                <input
                                    value={subDraft}
                                    onChange={(e) => setSubDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                                    placeholder="הקלד תת-משימה ולחץ Enter..."
                                    className="input-style flex-1"
                                />
                                <button
                                    type="button"
                                    onClick={addSubtask}
                                    className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 rounded-lg text-sm transition"
                                >
                                    הוסף
                                </button>
                            </div>
                            {subTasks.length > 0 && (
                                <div className="space-y-1.5">
                                    {subTasks.map(s => (
                                        <div key={s.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2">
                                            <span className="text-sm text-slate-700">• {s.title}</span>
                                            <button type="button" onClick={() => removeSubtask(s.id)} className="cursor-pointer text-red-500 hover:text-red-700 text-sm font-bold">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50">
                        <button type="button" onClick={onClose} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition">
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition"
                        >
                            {saving ? 'שומר...' : 'צור משימה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
