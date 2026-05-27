// src/hooks/useCustomer.ts
//
// Owns the customer-detail screen's entire data layer. Components built on
// this hook should not need any local useState/useEffect for customer or
// task data.
//
// Performance model:
//   Every mutation updates local state SYNCHRONOUSLY (optimistic), then fires
//   the DB write + log entry in the background. We do NOT reload after each
//   mutation — the UI stays responsive and the optimistic state is the
//   visible truth until the next explicit reload.
//
//   On DB error we log to console and call reload() to resync.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    PersistenceAdapter,
    type CustomerWithTasks,
    type PersistedTask,
    type PersistedSubTask,
    type TaskPriority,
} from '../services/PersistenceAdapter';
import { LogService } from '../services/LogService';
import { CustomerService } from '../services/CustomerService';
import {
    applyBusinessRules,
    calculateWeightedProgress,
    isCustomerFinalized,
    listVisibleFields,
    cascadeOnParentToggle,
    cascadeOnSubtaskSet,
    type Customer,
} from '../registries/CustomerRegistry';

export interface UseCustomerActions {
    updateField: (category: string | null, field: string, value: unknown) => void;
    setEditMode: (editing: boolean) => void;
    save: () => Promise<{ success: boolean; error?: string }>;
    toggleTaskStatus: (taskId: string, currentStatus: 'pending' | 'completed') => Promise<void>;
    updateTask: (taskId: string, patch: Partial<PersistedTask>) => Promise<void>;
    setSubtaskCompleted: (taskId: string, subtaskId: string, completed: boolean) => Promise<void>;
    toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
    updateSubtaskComment: (taskId: string, subtaskId: string, comment: string) => Promise<void>;
    updateTaskPriority: (taskId: string, priority: TaskPriority) => Promise<void>;
    deactivate: () => Promise<{ success: boolean; error?: string }>;
    reactivate: () => Promise<{ success: boolean; error?: string }>;
    remove: () => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<void>;
}

export interface UseCustomerResult {
    customer: CustomerWithTasks | null;
    editData: CustomerWithTasks | null;
    loading: boolean;
    isEditing: boolean;
    progress: number;
    isFinalized: boolean;
    visibleFields: string[];
    actions: UseCustomerActions;
}

// Updater that touches a single task inside the tasks array, preserving order.
function withTaskUpdated(
    state: CustomerWithTasks | null,
    taskId: string,
    transform: (t: PersistedTask) => PersistedTask
): CustomerWithTasks | null {
    if (!state) return state;
    return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === taskId ? transform(t) : t)),
    };
}

export function useCustomer(customerId: string | undefined): UseCustomerResult {
    const [customer, setCustomer] = useState<CustomerWithTasks | null>(null);
    const [editData, setEditData] = useState<CustomerWithTasks | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [isEditing, setIsEditing] = useState<boolean>(false);

    const reload = useCallback(async () => {
        if (!customerId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchCustomerWithTasks(customerId);
        if (!error && data) {
            setCustomer(data);
            setEditData(data);
        }
        setLoading(false);
    }, [customerId]);

    useEffect(() => {
        reload();
    }, [reload]);

    const updateField = useCallback(
        (category: string | null, field: string, value: unknown) => {
            setEditData((prev) => {
                if (!prev) return prev;
                const next: Record<string, unknown> = { ...prev };
                if (category) {
                    const prevCategory =
                        (prev as unknown as Record<string, Record<string, unknown> | undefined>)[category]
                        ?? {};
                    next[category] = { ...prevCategory, [field]: value };
                } else {
                    next[field] = value;
                }
                const normalized = applyBusinessRules(next as unknown as Customer);
                return { ...(normalized as unknown as CustomerWithTasks), tasks: prev.tasks };
            });
        },
        []
    );

    const setEditMode = useCallback(
        (editing: boolean) => {
            setIsEditing(editing);
            if (!editing && customer) setEditData(customer);
        },
        [customer]
    );

    const save = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId || !editData) return { success: false, error: 'No data to save' };
            
            const isCurrentlyActive = customer?.isActive;
            const hasAnyAuthority = !!(editData.isIncomeTaxActive || editData.isVatActive || editData.isInsuranceActive);
            let updatedData = { ...editData };

            if (isCurrentlyActive && !hasAnyAuthority) {
                const shouldDeactivate = window.confirm(
                    '❓ שים לב: כיבית את כל הרשויות בטיפול עבור לקוח זה.\nהאם ברצונך לשמור את השינויים ולהפוך את הלקוח ל"לא פעיל" באופן אוטומטי?'
                );
                if (!shouldDeactivate) {
                    return { success: false, error: 'השמירה בבוטלה על ידי המשתמש.' };
                }
                updatedData = {
                    ...updatedData,
                    isActive: false
                };
            }

            // הפרדת מערך ה-tasks מהאובייקט כדי לשלוח מבנה נקי התואם ל-CustomerFormData של השירות
            const { tasks: _, ...cleanFormData } = updatedData as any;

            const result = await CustomerService.saveCustomer(cleanFormData, true, customerId);
            if (result.success) {
                setIsEditing(false);
                await reload();
            }
            return result;
        },
        [customerId, editData, customer, reload]
    );

    // ── Task mutations (Optimistic & Normalised Flow) ──

    const toggleTaskStatus = useCallback(
        async (taskId: string, currentStatus: 'pending' | 'completed'): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const res = cascadeOnParentToggle({ status: targetTask.status, subTasks: targetTask.subTasks as any });
            const nextStatus = res.status as 'pending' | 'completed';
            const nextSubTasks = res.subTasks as any[];

            const apply = (t: PersistedTask): PersistedTask => ({ ...t, status: nextStatus, subTasks: nextSubTasks });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            // עדכון מפוצל ומנורמל: משנים את סטטוס האב, ומעדכנים את כל הבנים בבת אחת
            const { error: parentErr } = await PersistenceAdapter.updateTaskStatus(taskId, nextStatus);
            const { error: subErr } = await PersistenceAdapter.updateTaskSubtasks(taskId, nextSubTasks);

            if (parentErr || subErr) {
                console.error('[useCustomer.toggleTaskStatus] persist failed');
                await reload();
                return;
            }
            await LogService.recordTaskStatusChange(taskId, currentStatus, nextStatus);
        },
        [editData, customer, reload]
    );

    const setSubtaskCompleted = useCallback(
        async (taskId: string, subtaskId: string, completed: boolean): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const beforeStatus = targetTask.status;
            const beforeSubTasks = targetTask.subTasks || [];

            const res = cascadeOnSubtaskSet(
                { status: beforeStatus, subTasks: beforeSubTasks as any },
                subtaskId,
                completed
            );
            const nextStatus = res.status as 'pending' | 'completed';
            const nextSubTasks = res.subTasks as any[];

            const apply = (t: PersistedTask): PersistedTask => ({ ...t, status: nextStatus, subTasks: nextSubTasks });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            // פניה ישירה לעמודת הסטטוס הבודדת בטבלת sub_tasks
            const { error: subErr } = await PersistenceAdapter.updateSubtaskStatus(taskId, subtaskId, completed);
            // אם שינוי הבן גרם לשינוי סטטוס האב (למשל כולם הושלמו), נעדכן גם את האב בטבלה שלו
            if (beforeStatus !== nextStatus) {
                await PersistenceAdapter.updateTaskStatus(taskId, nextStatus);
            }

            if (subErr) {
                console.error('[useCustomer.setSubtaskCompleted] persist failed:', subErr.message);
                await reload();
                return;
            }
            
            await LogService.recordTaskChange(
                taskId,
                { subTasks: beforeSubTasks, status: beforeStatus } as unknown as Record<string, unknown>,
                { subTasks: nextSubTasks, status: nextStatus } as unknown as Record<string, unknown>
            );
        },
        [editData, customer, reload]
    );

    const toggleSubtask = useCallback(
        async (taskId: string, subtaskId: string): Promise<void> => {
            const existing = (editData ?? customer)?.tasks.find((t) => t.id === taskId);
            const sub = existing?.subTasks?.find((s) => s.id === subtaskId);
            await setSubtaskCompleted(taskId, subtaskId, !sub?.completed);
        },
        [editData, customer, setSubtaskCompleted]
    );

    const updateSubtaskComment = useCallback(
        async (taskId: string, subtaskId: string, comment: string): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const beforeSubTasks = targetTask.subTasks || [];
            const nextSubTasks = beforeSubTasks.map((s) => (s.id === subtaskId ? { ...s, comment } : s));

            const apply = (t: PersistedTask): PersistedTask => ({ ...t, subTasks: nextSubTasks });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            // מוטציה ממוקדת: משתמשים בפונקציה הטרנזקציונלית החדשה ב-Adapter שמזריקה הערה ישירות לשורה הנכונה
            const { error } = await PersistenceAdapter.updateSubtask(subtaskId, taskId, {
                title: beforeSubTasks.find(s => s.id === subtaskId)?.title || '',
                priority: targetTask.priority,
                comment: comment
            });

            if (error) {
                console.error('[useCustomer.updateSubtaskComment] persist failed:', error.message);
                await reload();
                return;
            }
            await LogService.recordTaskChange(
                taskId,
                { subTasks: beforeSubTasks } as unknown as Record<string, unknown>,
                { subTasks: nextSubTasks } as unknown as Record<string, unknown>
            );
        },
        [editData, customer, reload]
    );

    const updateTaskPriority = useCallback(
        async (taskId: string, priority: TaskPriority): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const beforePriority = targetTask.priority;

            const apply = (t: PersistedTask): PersistedTask => ({ ...t, priority });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            const { error } = await PersistenceAdapter.updateTaskPriority(taskId, priority);
            if (error) {
                console.error('[useCustomer.updateTaskPriority] persist failed:', error.message);
                await reload();
                return;
            }

            await LogService.recordTaskChange(
                taskId,
                { priority: beforePriority } as unknown as Record<string, unknown>,
                { priority } as unknown as Record<string, unknown>
            );
        },
        [editData, customer, reload]
    );

    const updateTask = useCallback(
        async (taskId: string, patch: Partial<PersistedTask>): Promise<void> => {
            const existing = (editData ?? customer)?.tasks.find((t) => t.id === taskId);
            if (!existing) return;

            const apply = (t: PersistedTask): PersistedTask => ({ ...t, ...patch });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            const { error } = await PersistenceAdapter.updateTask(taskId, patch);
            if (error) {
                console.error('[useCustomer.updateTask] persist failed:', error.message);
                await reload();
                return;
            }

            await LogService.recordTaskChange(
                taskId,
                existing as unknown as Record<string, unknown>,
                { ...existing, ...patch } as unknown as Record<string, unknown>
            );
        },
        [editData, customer, reload]
    );

    const deactivate = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId) return { success: false, error: 'No customer loaded' };
            const r = await CustomerService.deactivateCustomer(customerId);
            if (r.success) await reload();
            return r;
        },
        [customerId, reload]
    );

    const reactivate = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId) return { success: false, error: 'No customer loaded' };
            const r = await CustomerService.reactivateCustomer(customerId);
            if (r.success) await reload();
            return r;
        },
        [customerId, reload]
    );

    const remove = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId) return { success: false, error: 'No customer loaded' };
            return await CustomerService.deleteCustomer(customerId);
        },
        [customerId]
    );

    const tasks = editData?.tasks;

    const progress = useMemo(
        () => (tasks && tasks.length > 0 ? calculateWeightedProgress(tasks as any).percent : 0),
        [tasks]
    );

    const isFinalized = useMemo(
        () => (tasks && tasks.length > 0 ? isCustomerFinalized(tasks as any) : false),
        [tasks]
    );

    const visibleFields = useMemo(
        () => (editData ? listVisibleFields(editData as any) : []),
        [editData]
    );

    return {
        customer,
        editData,
        loading,
        isEditing,
        progress,
        isFinalized,
        visibleFields,
        actions: {
            updateField,
            setEditMode,
            save,
            toggleTaskStatus,
            updateTask,
            setSubtaskCompleted,
            toggleSubtask,
            updateSubtaskComment,
            updateTaskPriority,
            deactivate,
            reactivate,
            remove,
            reload,
        },
    };
}