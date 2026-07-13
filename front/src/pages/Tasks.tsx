// src/pages/Tasks.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { OFFICE_CUSTOMER_ID, PersistenceAdapter } from '../services/PersistenceAdapter';
import { authService } from '../services/authService';
import { CreateTaskModal } from '../comps/CreateTaskModal';
import CustomerAccordion from '../comps/CustomerAccordion';
import { type SubtaskViewRow } from '../comps/SubtaskRow';
import { AUTO_TASKS_CONFIG } from '../constants/taskRegistry';
import { translateError } from '../utils/translateError';
import { useModal } from '../contexts/ModalContext';

// re-export so any existing import from this module still works
export type { SubtaskViewRow } from '../comps/SubtaskRow';

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
    priorities: string[];
    search: string;
    showWaitingClients: boolean;
}

// שמוליק צריך לראות לקוחות בהמתנה כברירת מחדל; לכולם אחרים הם מוסתרים עד שמישהו מסמן אחרת.
const getDefaultFilters = (): TaskFilters => ({
    statuses: ['pending'],
    categories: [],
    clients: [],
    priorities: [],
    search: '',
    showWaitingClients: authService.getCurrentUser() === 'שמוליק',
});

interface MultiSelectProps {
    label: string;
    options: [string, string][];
    selected: string[];
    onChange: (selected: string[]) => void;
    searchable?: boolean;
}

export default function Tasks(): React.ReactElement {
    const modal = useModal();
    const [rows, setRows] = useState<SubtaskViewRow[]>([]);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTask, setEditingTask] = useState<SubtaskViewRow | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<TaskFilters>(getDefaultFilters);

    // ── Data loading ──────────────────────────────────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        const [subtasksResult, customersResult] = await Promise.all([
            PersistenceAdapter.fetchAllSubtasksView(),
            PersistenceAdapter.fetchAllCustomers(),
        ]);
        if (subtasksResult.error) {
            alert(`שגיאה בטעינת רשימת המשימות: ${translateError(subtasksResult.error.message)}`);
        } else if (subtasksResult.data) {
            const uniqueRows = subtasksResult.data.filter((row, index, self) =>
                index === self.findIndex(r => r.subtaskId === row.subtaskId)
            );
            setRows(uniqueRows);
        }
        setCustomers((customersResult.data as any[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Filter options ────────────────────────────────────────────────
    const categories = useMemo((): [string, string][] =>
        AUTO_TASKS_CONFIG.map(t => [t.id, t.title]),
    []);

    const clientOptions = useMemo((): [string, string][] => {
        const map = new Map<string, string>();
        for (const r of rows) {
            if (r.clientId) map.set(r.clientId, r.customerName || '—');
        }
        const list = Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'he'));
        if (rows.some(r => !r.clientId)) list.unshift([OFFICE_CUSTOMER_ID, '🏢 משימה משרדית כללית']);
        return list;
    }, [rows]);

    // ── Filtering ─────────────────────────────────────────────────────
    const filtered = useMemo(() => rows.filter(r => {
        if (!filters.showWaitingClients && r.customerIsWaiting) return false;
        if (filters.statuses.length && !filters.statuses.includes(r.completed ? 'completed' : 'pending')) return false;
        if (filters.categories.length && !filters.categories.includes(r.parentTaskId || '')) return false;
        if (filters.priorities.length && !filters.priorities.includes((r.priority || 'medium').toLowerCase())) return false;
        if (filters.clients.length && !filters.clients.includes(r.clientId ?? OFFICE_CUSTOMER_ID)) return false;
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

    // ── Grouping: office first, then A-Z by client name ───────────────
    const groupedByClient = useMemo(() => {
        const map = new Map<string, { clientName: string; rows: SubtaskViewRow[], comments: string }>();
        for (const row of filtered) {
            const key = row.clientId ?? OFFICE_CUSTOMER_ID;
            const name = row.clientId ? (row.customerName ?? '—') : '🏢 משימות משרדיות';
            if (!map.has(key)) map.set(key, { clientName: name, rows: [], comments: '' });
            map.get(key)!.rows.push(row);
            if (!map.get(key)!.comments && row.customerComments) {
                map.get(key)!.comments = row.customerComments;
            }
            
        }
        return Array.from(map.entries())
            .sort(([aId, { clientName: aName }], [bId, { clientName: bName }]) => {
                if (aId === OFFICE_CUSTOMER_ID) return -1;
                if (bId === OFFICE_CUSTOMER_ID) return 1;
                return aName.localeCompare(bName, 'he');
            })
            .map(([clientId, { clientName, rows: clientRows, comments }]) => ({
    clientId, 
    clientName, 
     comments,           
    rows: [...clientRows].sort((a, b) => {
        const order = ['ADMIN_SETUP', 'INSURANCE', 'INCOME_TAX', 'VAT', 'DIRECT_DEBIT', 'FINAL_APPROVAL'];
        const ai = order.indexOf(a.parentTaskId ?? '');
        const bi = order.indexOf(b.parentTaskId ?? '');
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
}));
    }, [filtered]);

    // ── Accordion controls ────────────────────────────────────────────
    const toggleAccordion = useCallback((clientId: string) => {
        setOpenAccordions(prev => {
            const next = new Set(prev);
            if (next.has(clientId)) next.delete(clientId);
            else next.add(clientId);
            return next;
        });
    }, []);

    const handleOpenAll = useCallback(() => {
        setOpenAccordions(new Set(groupedByClient.map(g => g.clientId)));
    }, [groupedByClient]);

    const handleCloseAll = useCallback(() => {
        setOpenAccordions(new Set());
    }, []);

    // Auto-open matching accordions when search is active
    useEffect(() => {
        if (!filters.search) return;
        setOpenAccordions(prev =>
            new Set([...prev, ...groupedByClient.map(g => g.clientId)])
        );
    }, [filters.search, groupedByClient]);

    // ── Row callbacks — stable refs, passed directly to CustomerAccordion ──
    const onRowToggle = useCallback(async (row: SubtaskViewRow, completed: boolean) => {
        if (row.customerIsWaiting) {
            alert('הלקוח במצב "בהמתנה" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.');
            return;
        }
        if (!authService.canApproveFinal(row.subtaskTitle)) {
            alert('אין לך הרשאה לשנות את הסטטוס של אישור ניהול סופי!');
            return;
        }
        setRows(prev => prev.map(r =>
            r.subtaskId === row.subtaskId ? { ...r, completed } : r
        ));
        const { error } = await PersistenceAdapter.updateSubtaskStatus(row.taskId, row.subtaskId!, completed);
        if (error) {
            alert(`שגיאה בסימון תת-המשימה: ${translateError(error.message)}`);
            load();
        }
    }, [load]);

    const onSaveTitle = useCallback(async (row: SubtaskViewRow, newTitle: string) => {
        const trimmed = newTitle.trim();
        if (!trimmed || trimmed === row.subtaskTitle) return;
        const prevTitle = row.subtaskTitle;
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, subtaskTitle: trimmed } : r
        ));
        const { error } = await PersistenceAdapter.updateSubtaskTitle(row.taskId, row.subtaskId!, trimmed);
        if (error) {
            alert(`שגיאה בשמירת שם תת-המשימה: ${translateError(error.message)}`);
            setRows(prev => prev.map(r =>
                r.taskId === row.taskId && r.subtaskId === row.subtaskId
                    ? { ...r, subtaskTitle: prevTitle } : r
            ));
        }
    }, []);

    const onEditClick = useCallback((row: SubtaskViewRow) => {
        setEditingTask(row);
    }, []);

    const onPriorityChange = useCallback(async (row: SubtaskViewRow, newPriority: string) => {
        const prevPriority = row.priority;
        setRows(prev => prev.map(r =>
            r.taskId === row.taskId && r.subtaskId === row.subtaskId
                ? { ...r, priority: newPriority as any } : r
        ));
        const { error } = await PersistenceAdapter.updateSubtaskPriority(row.subtaskId!, newPriority as any);
        if (error) {
            alert(`שגיאה בעדכון הדחיפות: ${translateError(error.message)}`);
            setRows(prev => prev.map(r =>
                r.taskId === row.taskId && r.subtaskId === row.subtaskId
                    ? { ...r, priority: prevPriority } : r
            ));
        }
    }, []);

    const onDeleteTask = useCallback(async (row: SubtaskViewRow) => {
        const taskTitle = row.parentTitle || row.subtaskTitle;
        const confirmed = await modal.confirm(`האם למחוק את המשימה "${taskTitle}"?\nפעולה זו לא ניתנת לביטול.`);
        if (!confirmed) return;
        setRows(prev => prev.filter(r => r.taskId !== row.taskId));
        const { error } = await PersistenceAdapter.deleteTask(row.taskId);
        if (error) {
            alert(`שגיאה במחיקת המשימה: ${translateError(error.message)}`);
            load();
        }
    }, [load]);

    const resetFilters = useCallback(() =>
        setFilters(getDefaultFilters()),
    []);

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="p-4 md:p-6 min-h-screen" dir="rtl">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">משימות</h1>
                        <p className="text-sm text-slate-500 mt-1">מבט לפי לקוח</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition"
                    >
                        <span className="text-lg leading-none">+</span> משימה חדשה
                    </button>
                </div>

                {/* Filter bar */}
                <div className="card-base p-4 mb-4">
                    <button
                        className="md:hidden w-full flex justify-between items-center
                                   p-3 bg-white rounded-xl border border-slate-200 mb-2"
                        onClick={() => setShowFilters(p => !p)}
                    >
                        <span className="font-medium text-slate-600">סינון</span>
                        <span>{showFilters ? '▴' : '▾'}</span>
                    </button>
                    <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <input
                            type="text"
                            placeholder="🔍 חיפוש..."
                            value={filters.search}
                            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                            className="input-style"
                        />
                        <MultiSelect
                            label="סטטוס"
                            options={[['pending', 'פתוחות'], ['completed', 'הושלמו']]}
                            selected={filters.statuses}
                            onChange={s => setFilters(f => ({ ...f, statuses: s }))}
                        />
                        <MultiSelect
                            label="קטגוריה"
                            options={categories}
                            selected={filters.categories}
                            onChange={s => setFilters(f => ({ ...f, categories: s }))}
                            searchable
                        />
                        <MultiSelect
                            label="לקוח"
                            options={clientOptions}
                            selected={filters.clients}
                            onChange={s => setFilters(f => ({ ...f, clients: s }))}
                            searchable
                        />
                        <MultiSelect
                            label="דחיפות"
                            options={[['low', 'נמוכה'], ['medium', 'בינונית'], ['high', 'גבוהה'], ['critical', 'קריטית']]}
                            selected={filters.priorities}
                            onChange={s => setFilters(f => ({ ...f, priorities: s }))}
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer mt-3 w-fit">
                        <input
                            type="checkbox"
                            checked={filters.showWaitingClients}
                            onChange={e => setFilters(f => ({ ...f, showWaitingClients: e.target.checked }))}
                            className="w-4 h-4 cursor-pointer accent-orange-600"
                        />
                        <span className="text-xs font-bold text-slate-600">הצג גם לקוחות בהמתנה</span>
                    </label>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">
                            מציג {filtered.length} משימות ב-{groupedByClient.length} לקוחות
                        </span>
                        <button onClick={resetFilters} className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold transition">
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                {/* Open / Close all */}
                {!loading && groupedByClient.length > 0 && (
                    <div className="flex justify-end gap-4 mb-3">
                        <button onClick={handleOpenAll} className="cursor-pointer text-xs text-slate-500 hover:text-slate-900 font-bold transition">
                            פתח הכל ▴
                        </button>
                        <button onClick={handleCloseAll} className="cursor-pointer text-xs text-slate-500 hover:text-slate-900 font-bold transition">
                            סגור הכל ▾
                        </button>
                    </div>
                )}

                {/* Content */}
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="card-base h-16 animate-pulse bg-slate-100 rounded-2xl" />
                        ))}
                    </div>
                ) : groupedByClient.length === 0 ? (
                    <div className="card-base p-12 text-center text-slate-400 italic">
                        לא נמצאו משימות תואמות.
                    </div>
                ) : (
                    groupedByClient.map(({ clientId, clientName, rows: clientRows, comments }) => (
                        <CustomerAccordion
                            key={clientId}
                            clientId={clientId}
                            clientName={clientName}
                            rows={clientRows}
                            isOpen={openAccordions.has(clientId)}
                            onToggle={toggleAccordion}
                            onRowToggle={onRowToggle}
                            onSaveTitle={onSaveTitle}
                            onEditClick={onEditClick}
                            onPriorityChange={onPriorityChange}
                            onDelete={onDeleteTask}
                            comments={comments}
                        />
                    ))
                )}

            </div>

            {(showCreate || editingTask) && (
                <CreateTaskModal
                    customers={customers}
                    taskToEdit={editingTask}
                    onClose={() => { setShowCreate(false); setEditingTask(null); }}
                    onCreated={() => { setShowCreate(false); setEditingTask(null); load(); }}
                />
            )}
        </div>
    );
}

// ── MultiSelect ───────────────────────────────────────────────────────

const MultiSelect: React.FC<MultiSelectProps> = React.memo(({ label, options, selected, onChange, searchable }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const summary = selected.length === 0
        ? 'הכל'
        : selected.length === 1
            ? (options.find(([v]) => v === selected[0])?.[1] ?? selected[0])
            : `${selected.length} נבחרו`;

    const toggle = (val: string) => {
        if (selected.includes(val)) onChange(selected.filter(v => v !== val));
        else onChange([...selected, val]);
    };

    const visibleOptions = searchable && query
        ? options.filter(([, lbl]) => lbl.toLowerCase().includes(query.toLowerCase()))
        : options;

    const handleClose = () => { setOpen(false); setQuery(''); };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="cursor-pointer w-full input-style text-right flex justify-between items-center"
            >
                <span className="text-xs text-slate-400 font-bold">{label}: </span>
                <span className="text-sm font-medium truncate mx-1">{summary}</span>
                <span className="text-slate-400 text-xs">▾</span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={handleClose} />
                    <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl">
                        <div className="sticky top-0 bg-white">
                            {searchable && (
                                <div className="p-2 border-b border-slate-100">
                                    <input
                                        type="text"
                                        autoFocus
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="חפש..."
                                        className="input-style text-sm"
                                        onClick={e => e.stopPropagation()}
                                    />
                                </div>
                            )}
                            <div className="flex justify-between p-2 border-b border-slate-100">
                                <button type="button" onClick={() => onChange(visibleOptions.map(([v]) => v))} className="cursor-pointer text-[11px] text-blue-600 font-bold hover:underline">בחר הכל</button>
                                <button type="button" onClick={() => onChange([])} className="cursor-pointer text-[11px] text-slate-500 font-bold hover:underline">נקה</button>
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {visibleOptions.map(([val, lbl]) => (
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
                            {visibleOptions.length === 0 && (
                                <div className="p-4 text-center text-xs text-slate-400 italic">אין תוצאות</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});
