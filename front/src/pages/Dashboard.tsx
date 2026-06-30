import React, { useState, useEffect } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import type { PersistedTask } from '../services/PersistenceAdapter';
import { PRIORITY_STYLES } from '../registries/CustomerRegistry';

export default function Dashboard() {
    const [activeCustomers, setActiveCustomers] = useState<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<number | null>(null);
    const [completedTasks, setCompletedTasks] = useState<number | null>(null);
    const [officeTasks, setOfficeTasks] = useState<PersistedTask[] | null>(null);

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
    }, []);

    const handleSubtaskToggle = (taskId: string, subtaskId: string, completed: boolean) => {
        setOfficeTasks(prev => prev?.map(task =>
            task.id !== taskId ? task : {
                ...task,
                subTasks: task.subTasks?.map(s =>
                    s.id !== subtaskId ? s : { ...s, completed }
                ),
            }
        ) ?? null);
        PersistenceAdapter.updateSubtaskStatus(taskId, subtaskId, completed);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto" dir="rtl">
            <h1 className="text-3xl font-black text-slate-900 mb-6">לוח בקרה</h1>
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

            <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">משימות משרד</h2>
                </div>
                {officeTasks === null ? (
                    <div className="p-6">
                        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
                    </div>
                ) : officeTasks.length === 0 ? (
                    <p className="p-6 text-slate-400 text-sm">אין משימות משרדיות כרגע</p>
                ) : (
                    <div className="divide-y divide-slate-100 max-h-120 overflow-y-auto">
                        {officeTasks.map(task => (
                            <div key={task.id} className="px-6 py-4">
                                <p className="font-semibold text-slate-800 mb-2">{task.title}</p>
                                <ul className="space-y-2">
                                    {(task.subTasks ?? []).map(sub => {
                                        const pr = PRIORITY_STYLES[sub.priority ?? 'medium'];
                                        return (
                                            <li key={sub.id} className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={!!sub.completed}
                                                    onChange={e => handleSubtaskToggle(task.id, sub.id, e.target.checked)}
                                                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                                                />
                                                <span className={`text-sm ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                    {sub.title}
                                                </span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full border ${pr.bg} ${pr.text} ${pr.border}`}>
                                                    {pr.label}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
