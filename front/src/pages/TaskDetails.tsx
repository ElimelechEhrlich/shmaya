// src/pages/TaskDetails.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
    OFFICE_CUSTOMER_ID,
    PersistedSubTask,
    PersistedTaskWithCustomer,
    PersistenceAdapter,
} from '../services/PersistenceAdapter';
import {
    calculateWeightedProgress,
    cascadeOnSubtaskSet,
} from '../registries/CustomerRegistry';
import PriorityBadge from '../comps/PriorityBadge';
import { authService } from '../services/authService';
import ProgressBar from '../comps/ProgressBar';
import { translateError } from '../utils/translateError';

export default function TaskDetails(): React.ReactElement {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [task, setTask] = useState<PersistedTaskWithCustomer | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

    const loadTask = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setErrorMsg(null);
        setNotFound(false);
        const { data, error } = await PersistenceAdapter.fetchTaskById(id);
        if (error) {
            setErrorMsg(error.message);
        } else if (!data) {
            setNotFound(true);
        } else {
            setTask(data);
            const drafts: Record<string, string> = {};
            for (const s of data.subTasks ?? []) {
                drafts[s.id] = s.comment ?? '';
            }
            setCommentDrafts(drafts);
        }
        setLoading(false);
    }, [id]);

    useEffect(() => { loadTask(); }, [loadTask]);

    // known: fast double-click can race (second closure captures stale task state). acceptable for this UI.
    const handleToggleSubtask = useCallback(async (subtaskId: string, currentCompleted: boolean) => {
        if (!task) return;
        const newCompleted = !currentCompleted;

        const sub = (task.subTasks ?? []).find(s => s.id === subtaskId);
        if (newCompleted && sub && !authService.canApproveFinal(sub.title)) {
            alert('אין לך הרשאה לשנות את הסטטוס של אישור ניהול סופי!');
            return;
        }

        const cascaded = cascadeOnSubtaskSet(
            { status: task.status, subTasks: task.subTasks ?? [] },
            subtaskId,
            newCompleted
        );
        setTask({ ...task, status: cascaded.status, subTasks: cascaded.subTasks as any });

        const { error } = await PersistenceAdapter.updateSubtaskStatus(task.id, subtaskId, newCompleted);
        if (error) { alert(`שגיאה בסימון תת-המשימה: ${translateError(error.message)}`); console.error(error.message); loadTask(); return; }

        if (cascaded.status !== task.status) {
            const { error: pe } = await PersistenceAdapter.updateTaskStatus(task.id, cascaded.status);
            if (pe) { alert(`שגיאה בעדכון סטטוס המשימה: ${translateError(pe.message)}`); console.error(pe.message); loadTask(); }
        }
    }, [task, loadTask]);

    const handlePriorityChange = useCallback(async (subtaskId: string, priority: string) => {
        if (!task) return;
        const sub = (task.subTasks ?? []).find(s => s.id === subtaskId);
        if (!sub) return;

        setTask({
            ...task,
            subTasks: (task.subTasks ?? []).map(s =>
                s.id === subtaskId ? { ...s, priority: priority as any } : s
            ),
        });

        const { error } = await PersistenceAdapter.updateSubtask(subtaskId, task.id, {
            title: sub.title,
            priority,
            comment: commentDrafts[subtaskId] ?? sub.comment ?? '',
        });
        if (error) { alert(`שגיאה בעדכון הדחיפות: ${translateError(error.message)}`); console.error(error.message); loadTask(); }
    }, [task, commentDrafts, loadTask]);

    const handleCommentBlur = useCallback(async (subtaskId: string) => {
        if (!task) return;
        const sub = (task.subTasks ?? []).find(s => s.id === subtaskId);
        if (!sub) return;
        const draft = commentDrafts[subtaskId] ?? '';
        if (draft === (sub.comment ?? '')) return;
        const { error } = await PersistenceAdapter.updateSubtask(subtaskId, task.id, {
            title: sub.title,
            priority: sub.priority,
            comment: draft,
        });
        if (error) { alert(`שגיאה בשמירת ההערה: ${translateError(error.message)}`); console.error(error.message); loadTask(); }
    }, [task, commentDrafts, loadTask]);

    // ── Loading ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="p-6 min-h-screen" dir="rtl">
                <div className="max-w-3xl mx-auto space-y-4">
                    <div className="h-8 w-40 bg-slate-200 rounded-xl animate-pulse" />
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
                        <div className="h-5 w-24 bg-slate-100 rounded animate-pulse" />
                        <div className="h-7 w-72 bg-slate-100 rounded animate-pulse" />
                        <div className="h-3 w-full bg-slate-100 rounded-full animate-pulse mt-4" />
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ── Not found / error ─────────────────────────────────────────────
    if (notFound || errorMsg || !task) {
        return (
            <div className="p-6 min-h-screen flex flex-col items-center justify-center" dir="rtl">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md w-full text-center space-y-4">
                    <span className="text-5xl">{errorMsg ? '⚠️' : '🔍'}</span>
                    <h2 className="text-xl font-black text-slate-900">
                        {errorMsg ? 'שגיאה בטעינה' : 'המשימה לא נמצאה'}
                    </h2>
                    <p className="text-sm text-slate-500">
                        {errorMsg ?? 'ייתכן שהמשימה נמחקה או שהקישור שגוי.'}
                    </p>
                    <Link
                        to="/admin/tasks"
                        className="inline-block bg-slate-900 text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-slate-800 transition"
                    >
                        חזרה לרשימת המשימות
                    </Link>
                </div>
            </div>
        );
    }

    // ── Content ───────────────────────────────────────────────────────
    const progress = calculateWeightedProgress([task as any]);
    const isOfficeTask = !task.customerId || task.customerId === OFFICE_CUSTOMER_ID;
    const doneCount = (task.subTasks ?? []).filter(s => s.completed).length;
    const totalCount = (task.subTasks ?? []).length;

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-3xl mx-auto space-y-5">

                {/* Breadcrumb / back */}
                <div className="flex items-center gap-3 text-sm">
                    <button
                        type="button"
                        onClick={() => navigate('/admin/tasks')}
                        className="cursor-pointer text-slate-500 hover:text-slate-900 font-bold transition flex items-center gap-1"
                    >
                        ← חזרה למשימות
                    </button>
                    {!isOfficeTask && (
                        <>
                            <span className="text-slate-300">·</span>
                            <Link
                                to={`/admin/customers/${task.customerId}`}
                                className="text-blue-600 hover:text-blue-800 font-bold transition"
                            >
                                פתח תיק לקוח ↗
                            </Link>
                        </>
                    )}
                </div>

                {/* Header card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1.5">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full inline-block">
                                {isOfficeTask ? '🏢 משימה משרדית' : task.customerName}
                            </span>
                            <h1 className="text-2xl font-black text-slate-900">{task.title}</h1>
                        </div>
                        <span className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border ${
                            task.status === 'completed'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            {task.status === 'completed' ? '✓ הושלמה' : '⏳ בטיפול'}
                        </span>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs text-slate-500 font-medium mb-1.5">
                            <span>התקדמות</span>
                            <span>{doneCount} / {totalCount} תתי-משימות הושלמו</span>
                        </div>
                        <ProgressBar percent={progress.percent} size="md" />
                    </div>
                </div>

                {/* Subtasks list */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                        <h2 className="text-xs font-black text-slate-600 uppercase tracking-wider">תתי-משימות</h2>
                    </div>

                    {totalCount === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-400 italic">אין תתי-משימות למשימה זו.</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {(task.subTasks as PersistedSubTask[]).map(sub => {
                                return (
                                    <div
                                        key={sub.id}
                                        className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition ${sub.completed ? 'bg-green-50/40' : 'hover:bg-slate-50/60'}`}
                                    >
                                        {/* Checkbox + title */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={sub.completed}
                                                onChange={() => handleToggleSubtask(sub.id, sub.completed)}
                                                className="cursor-pointer w-5 h-5 accent-blue-600 shrink-0"
                                            />
                                            <span className={`text-sm font-medium truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                                {sub.title}
                                            </span>
                                        </div>

                                        {/* Priority + comment */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <PriorityBadge
                                                priority={sub.priority}
                                                onChange={(p) => handlePriorityChange(sub.id, p)}
                                            />
                                            <input
                                                type="text"
                                                value={commentDrafts[sub.id] ?? ''}
                                                placeholder="הערה..."
                                                onChange={e => setCommentDrafts(prev => ({ ...prev, [sub.id]: e.target.value }))}
                                                onBlur={() => handleCommentBlur(sub.id)}
                                                className="input-style text-xs py-1 px-2.5 w-40"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
