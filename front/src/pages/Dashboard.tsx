import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import type { PersistedTask, MoisheOpenTaskRow } from '../services/PersistenceAdapter';
import { PRIORITY_STYLES } from '../registries/CustomerRegistry';
import { OfficeTaskModal, type OfficeSubtaskEdit } from '../comps/OfficeTaskModal';
import { useModal } from '../contexts/ModalContext';
import { authService } from '../services/authService';

interface OfficeRow extends OfficeSubtaskEdit {
    taskId: string;
    completed: boolean;
}

export default function Dashboard() {
    const modal = useModal();
    const navigate = useNavigate();
    const isShmulik = authService.getCurrentUser() === 'שמוליק';
    const isMoishe = authService.getCurrentUser() === 'מוישי';
    const [activeCustomers, setActiveCustomers] = useState<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<number | null>(null);
    const [completedTasks, setCompletedTasks] = useState<number | null>(null);
    const [officeTasks, setOfficeTasks] = useState<PersistedTask[] | null>(null);
    const [waitingCustomers, setWaitingCustomers] = useState<{ id: string; name: string }[] | null>(null);
    const [myOpenTasks, setMyOpenTasks] = useState<MoisheOpenTaskRow[] | null>(null);
    const [showOpenOnly, setShowOpenOnly] = useState(true);
    const [showCreateOffice, setShowCreateOffice] = useState(false);
    const [editingSubtask, setEditingSubtask] = useState<OfficeSubtaskEdit | null>(null);

    const reloadOfficeTasks = useCallback(() => {
        PersistenceAdapter.fetchOfficeTasks().then(({ data }) => {
            setOfficeTasks(data ?? []);
        });
    }, []);

    useEffect(() => {
        PersistenceAdapter.fetchActiveCustomerCount().then(({ data, error }) => {
            if (error) console.error('[Dashboard] fetchActiveCustomerCount:', error);
            else setActiveCustomers(data ?? 0);
        });
        PersistenceAdapter.fetchCustomerTaskStats().then(({ data, error }) => {
            if (error) console.error('[Dashboard] fetchCustomerTaskStats:', error);
            else { setPendingTasks(data!.pending); setCompletedTasks(data!.completed); }
        });
        PersistenceAdapter.fetchOfficeTasks().then(({ data, error }) => {
            if (error) console.error('[Dashboard] fetchOfficeTasks:', error);
            else setOfficeTasks(data ?? []);
        });
        if (isShmulik) {
            PersistenceAdapter.fetchWaitingCustomers().then(({ data, error }) => {
                if (error) console.error('[Dashboard] fetchWaitingCustomers:', error);
                else setWaitingCustomers(data ?? []);
            });
        }
        if (isMoishe) {
            PersistenceAdapter.fetchMoisheOpenTasks().then(({ data, error }) => {
                if (error) console.error('[Dashboard] fetchMoisheOpenTasks:', error);
                else setMyOpenTasks(data ?? []);
            });
        }
    }, [isShmulik, isMoishe]);

    const handleSubtaskToggle = useCallback(async (taskId: string, subtaskId: string, completed: boolean) => {
        setOfficeTasks(prev => prev?.map(task =>
            task.id !== taskId ? task : {
                ...task,
                subTasks: task.subTasks?.map(s =>
                    s.id !== subtaskId ? s : { ...s, completed }
                ),
            }
        ) ?? null);
        const { error } = await PersistenceAdapter.updateSubtaskStatus(taskId, subtaskId, completed);
        if (error) reloadOfficeTasks();
    }, [reloadOfficeTasks]);

    const handleDeleteSubtask = useCallback(async (row: OfficeRow) => {
        const confirmed = await modal.confirm(`האם למחוק את המשימה "${row.title}"?\nפעולה זו לא ניתנת לביטול.`);
        if (!confirmed) return;
        setOfficeTasks(prev => prev?.map(task =>
            task.id !== row.taskId ? task : { ...task, subTasks: task.subTasks?.filter(s => s.id !== row.id) }
        ) ?? null);
        const { error } = await PersistenceAdapter.deleteSubtask(row.id);
        if (error) {
            await modal.alert('שגיאה במחיקת המשימה');
            reloadOfficeTasks();
        }
    }, [reloadOfficeTasks]);

    const visibleRows = useMemo<OfficeRow[] | null>(() => {
        if (!officeTasks) return null;
        const rows: OfficeRow[] = officeTasks.flatMap(task =>
            (task.subTasks ?? []).map(s => ({
                id: s.id,
                taskId: task.id,
                title: s.title,
                priority: s.priority ?? 'medium',
                comment: s.comment ?? '',
                completed: !!s.completed,
            }))
        );
        return showOpenOnly ? rows.filter(r => !r.completed) : rows;
    }, [officeTasks, showOpenOnly]);

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto" dir="rtl">
            <h1 className="text-3xl font-black text-slate-900 mb-6">לוח בקרה</h1>

            {/* ─── Stats ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-blue-500 shadow-sm transition-all duration-300 active:scale-105 active:shadow-lg active:bg-blue-50 hover:scale-105 hover:shadow-lg hover:bg-blue-50">
                    <span className="text-2xl">👥</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות פעילים</h3>
                    <p className="text-4xl font-black text-slate-900 mt-1">
                        {activeCustomers ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-amber-500 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-amber-50 active:scale-105 active:shadow-lg active:bg-amber-50">
                    <span className="text-2xl">⏳</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות בטיפול</h3>
                    <p className="text-4xl font-black text-amber-600 mt-1">
                        {pendingTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-emerald-500 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-emerald-50 active:scale-105 active:shadow-lg active:bg-emerald-50">
                    <span className="text-2xl">✅</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות שהושלמו</h3>
                    <p className="text-4xl font-black text-green-600 mt-1">
                        {completedTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
            </div>

            {/* ─── Waiting customers (שמוליק בלבד) ─── */}
            {isShmulik && (
                <div className="mt-8 bg-white rounded-2xl border border-orange-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-orange-100 bg-orange-50/60 rounded-t-2xl">
                        <h2 className="text-lg font-bold text-orange-900">לקוחות בהמתנה</h2>
                    </div>
                    {waitingCustomers === null ? (
                        <div className="p-6">
                            <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                        </div>
                    ) : waitingCustomers.length === 0 ? (
                        <p className="p-6 text-slate-400 text-sm italic">אין לקוחות בהמתנה כרגע</p>
                    ) : (
                        <div className="divide-y divide-orange-100">
                            {waitingCustomers.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => navigate(`/admin/customers/${c.id}`)}
                                    className="cursor-pointer flex items-center px-6 py-3 bg-orange-50/40 hover:bg-orange-50 transition-colors"
                                >
                                    <span className="text-sm font-bold text-orange-900">{c.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── משימות לטיפולי (מוישי בלבד) ─── */}
            {isMoishe && (
                <div className="mt-8 bg-white rounded-2xl border border-blue-200 shadow-sm">
                    <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/60 rounded-t-2xl">
                        <h2 className="text-lg font-bold text-blue-900">משימות לטיפולי</h2>
                    </div>
                    {myOpenTasks === null ? (
                        <div className="p-6">
                            <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                        </div>
                    ) : myOpenTasks.length === 0 ? (
                        <p className="p-6 text-slate-400 text-sm italic">אין משימות פתוחות לטיפולך כרגע</p>
                    ) : (
                        <div className="divide-y divide-blue-100">
                            {myOpenTasks.map(t => (
                                <div
                                    key={t.subtaskId}
                                    className="flex items-center justify-between gap-3 px-6 py-3 bg-blue-50/30 hover:bg-blue-50 transition-colors"
                                >
                                    <div
                                        onClick={() => navigate(`/admin/customers/${t.customerId}`)}
                                        className="cursor-pointer flex-1 min-w-0"
                                    >
                                        <span className="text-sm font-bold text-blue-900">{t.customerName}</span>
                                        <span className="text-xs text-slate-400 mr-2 truncate">{t.title}</span>
                                    </div>
                                    {t.kind === 'ltd_extra_case' && t.ltdPrefill && (
                                        <button
                                            onClick={() => navigate('/admin/customers/new', { state: t.ltdPrefill })}
                                            className="cursor-pointer shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition"
                                        >
                                            מעבר להקמת תיק לקוח
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Office tasks ─── */}
            <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm">

                {/* header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-linear-to-b from-white to-slate-50/60 rounded-t-2xl flex items-center gap-4 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-800 flex-1">משימות משרד</h2>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showOpenOnly}
                            onChange={e => setShowOpenOnly(e.target.checked)}
                            className="peer sr-only"
                        />
                        <span className="w-4 h-4 rounded border-2 border-slate-300
                                         peer-checked:border-blue-500 peer-checked:bg-blue-500
                                         transition-all duration-150 flex items-center justify-center
                                         text-transparent peer-checked:text-white text-[9px] font-black shrink-0">
                            ✓
                        </span>
                        <span className="text-xs text-slate-500 font-medium">הצג רק משימות פתוחות</span>
                    </label>
                    <button
                        onClick={() => setShowCreateOffice(true)}
                        className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1"
                    >
                        <span className="text-sm leading-none">+</span> משימה חדשה
                    </button>
                </div>

                {/* body */}
                {visibleRows === null ? (
                    <div className="p-6">
                        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </div>
                ) : visibleRows.length === 0 ? (
                    <p className="p-6 text-slate-400 text-sm italic">
                        {showOpenOnly ? 'אין משימות פתוחות כרגע' : 'אין משימות משרדיות כרגע'}
                    </p>
                ) : (
                    <div className="divide-y divide-slate-100 max-h-120 overflow-y-auto">
                        {visibleRows.map(row => {
                            const pr = PRIORITY_STYLES[row.priority ?? 'medium'];
                            return (
                                <div key={row.id} className="relative flex items-center gap-3 px-6 py-3 hover:bg-slate-50/40 transition-colors">

                                    {/* accent strip */}
                                    <div className="absolute inset-y-0 right-0 w-1 bg-slate-200 opacity-70" />

                                    {/* peer checkbox */}
                                    <label className="cursor-pointer flex items-center shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={row.completed}
                                            onChange={e => handleSubtaskToggle(row.taskId, row.id, e.target.checked)}
                                            className="peer sr-only"
                                        />
                                        <span className="w-5 h-5 rounded-full border-2 border-slate-300
                                                         peer-checked:border-blue-500 peer-checked:bg-blue-500
                                                         transition-all duration-200 flex items-center justify-center
                                                         text-transparent peer-checked:text-white text-[11px] font-black
                                                         hover:border-slate-400 shrink-0 select-none">
                                            ✓
                                        </span>
                                    </label>

                                    <div className="flex-1 min-w-0">
                                        <span className={`text-sm truncate block ${row.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                            {row.title}
                                        </span>
                                        {row.comment && (
                                            <div className="text-[11px] text-slate-400 truncate mt-0.5">{row.comment}</div>
                                        )}
                                    </div>

                                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${pr.bg} ${pr.text} ${pr.border}`}>
                                        {pr.label}
                                    </span>

                                    <button
                                        onClick={() => setEditingSubtask({ id: row.id, title: row.title, priority: row.priority, comment: row.comment })}
                                        title="עריכת משימה"
                                        className="cursor-pointer text-slate-300 hover:text-blue-600 text-sm font-bold px-1 shrink-0 transition-colors"
                                    >
                                        ✎
                                    </button>

                                    <button
                                        onClick={() => handleDeleteSubtask(row)}
                                        title="מחק משימה"
                                        className="cursor-pointer text-slate-300 hover:text-red-500 text-sm px-1 shrink-0 transition-colors"
                                    >
                                        🗑
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── Modal ─── */}
            {(showCreateOffice || editingSubtask) && (
                <OfficeTaskModal
                    subtaskToEdit={editingSubtask}
                    onClose={() => { setShowCreateOffice(false); setEditingSubtask(null); }}
                    onSaved={() => { setShowCreateOffice(false); setEditingSubtask(null); reloadOfficeTasks(); }}
                />
            )}
        </div>
    );
}
