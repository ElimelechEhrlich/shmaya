import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import type { PersistedTask, PersistedSubTask } from '../services/PersistenceAdapter';
import { PRIORITY_STYLES } from '../registries/CustomerRegistry';
import { CATEGORY_ACCENT_COLORS } from '../constants/taskRegistry';
import { CreateTaskModal } from '../comps/CreateTaskModal';
import { useModal } from '../contexts/ModalContext';

function buildTaskToEdit(task: PersistedTask, sub: PersistedSubTask) {
    return {
        taskId: task.id,
        subtaskId: sub.id,
        subtaskTitle: sub.title,
        parentTaskId: task.parentTaskId,
        parentTitle: task.title,
        clientId: null as string | null,   // null → modal shows "משימה משרדית כללית"
        customerName: null as string | null,
        completed: !!sub.completed,
        priority: (sub.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical',
        comment: sub.comment ?? '',
    };
}

export default function Dashboard() {
    const modal = useModal();
    const [activeCustomers, setActiveCustomers] = useState<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<number | null>(null);
    const [completedTasks, setCompletedTasks] = useState<number | null>(null);
    const [officeTasks, setOfficeTasks] = useState<PersistedTask[] | null>(null);
    const [customers, setCustomers] = useState<any[]>([]);
    const [showOpenOnly, setShowOpenOnly] = useState(true);
    const [showCreateOffice, setShowCreateOffice] = useState(false);
    const [editingOfficeTask, setEditingOfficeTask] = useState<ReturnType<typeof buildTaskToEdit> | null>(null);

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
        PersistenceAdapter.fetchAllCustomers().then(({ data }) => {
            setCustomers((data as any[]) ?? []);
        });
    }, []);

    const handleSubtaskToggle = useCallback((taskId: string, subtaskId: string, completed: boolean) => {
        setOfficeTasks(prev => prev?.map(task =>
            task.id !== taskId ? task : {
                ...task,
                subTasks: task.subTasks?.map(s =>
                    s.id !== subtaskId ? s : { ...s, completed }
                ),
            }
        ) ?? null);
        PersistenceAdapter.updateSubtaskStatus(taskId, subtaskId, completed);
    }, []);

    const handleDeleteOfficeTask = useCallback(async (task: PersistedTask) => {
        const confirmed = await modal.confirm(`האם למחוק את המשימה "${task.title}"?\nפעולה זו לא ניתנת לביטול.`);
        if (!confirmed) return;
        setOfficeTasks(prev => prev?.filter(t => t.id !== task.id) ?? null);
        const { error } = await PersistenceAdapter.deleteTask(task.id);
        if (error) {
            await modal.alert('שגיאה במחיקת המשימה');
            reloadOfficeTasks();
        }
    }, [reloadOfficeTasks]);

    const visibleTasks = useMemo(() => {
        if (!officeTasks) return null;
        if (!showOpenOnly) return officeTasks;
        return officeTasks
            .map(task => ({
                ...task,
                subTasks: (task.subTasks ?? []).filter(s => !s.completed),
            }))
            .filter(task => task.subTasks.length > 0);
    }, [officeTasks, showOpenOnly]);

    return (
        <div className="p-6 max-w-7xl mx-auto" dir="rtl">
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
                {visibleTasks === null ? (
                    <div className="p-6">
                        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </div>
                ) : visibleTasks.length === 0 ? (
                    <p className="p-6 text-slate-400 text-sm italic">
                        {showOpenOnly ? 'אין משימות פתוחות כרגע' : 'אין משימות משרדיות כרגע'}
                    </p>
                ) : (
                    <div className="divide-y divide-slate-100 max-h-120 overflow-y-auto">
                        {visibleTasks.map(task => {
                            const accentBg = CATEGORY_ACCENT_COLORS[task.parentTaskId || ''] ?? 'bg-slate-200';
                            return (
                                <div key={task.id} className="relative px-6 py-4 hover:bg-slate-50/40 transition-colors">

                                    {/* category accent strip */}
                                    <div className={`absolute inset-y-0 right-0 w-1 ${accentBg} opacity-70`} />

                                    {/* task header row */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <p className="font-semibold text-slate-700 text-sm flex-1">{task.title}</p>
                                        {task.parentTaskId === null && (
                                            <button
                                                onClick={() => handleDeleteOfficeTask(task)}
                                                title="מחק משימה ידנית"
                                                className="cursor-pointer text-slate-300 hover:text-red-500 text-sm px-1 shrink-0 transition-colors"
                                            >
                                                🗑
                                            </button>
                                        )}
                                    </div>

                                    {/* subtask rows */}
                                    <ul className="space-y-1.5">
                                        {(task.subTasks ?? []).map(sub => {
                                            const pr = PRIORITY_STYLES[sub.priority ?? 'medium'];
                                            return (
                                                <li key={sub.id} className="flex items-center gap-3 hover:bg-slate-100/60 -mx-2 px-2 py-1.5 rounded-lg transition-colors">

                                                    {/* peer checkbox */}
                                                    <label className="cursor-pointer flex items-center shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!sub.completed}
                                                            onChange={e => handleSubtaskToggle(task.id, sub.id, e.target.checked)}
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

                                                    <span className={`text-sm flex-1 min-w-0 truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                        {sub.title}
                                                    </span>

                                                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${pr.bg} ${pr.text} ${pr.border}`}>
                                                        {pr.label}
                                                    </span>

                                                    <button
                                                        onClick={() => setEditingOfficeTask(buildTaskToEdit(task, sub))}
                                                        title="עריכת משימה"
                                                        className="cursor-pointer text-slate-300 hover:text-blue-600 text-sm font-bold px-1 shrink-0 transition-colors"
                                                    >
                                                        ✎
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── Modals ─── */}
            {(showCreateOffice || editingOfficeTask) && (
                <CreateTaskModal
                    customers={customers}
                    taskToEdit={editingOfficeTask}
                    defaultIsOffice={true}
                    onClose={() => { setShowCreateOffice(false); setEditingOfficeTask(null); }}
                    onCreated={() => { setShowCreateOffice(false); setEditingOfficeTask(null); reloadOfficeTasks(); }}
                />
            )}
        </div>
    );
}
