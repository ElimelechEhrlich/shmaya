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
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — JS service, stable surface
import { CustomerService } from '../services/CustomerService.js';
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
            const result = await CustomerService.saveCustomer(editData, true, customerId);
            if (result.success) {
                setIsEditing(false);
                await reload();
            }
            return result;
        },
        [customerId, editData, reload]
    );

    // ── Task mutations (optimistic) ──

    const toggleTaskStatus = useCallback(
        async (taskId: string, currentStatus: 'pending' | 'completed'): Promise<void> => {
            // Compute cascade locally first.
            let cascadeResult: { status: 'pending' | 'completed'; subTasks: PersistedSubTask[] } | null = null;
            const apply = (t: PersistedTask): PersistedTask => {
                const res = cascadeOnParentToggle({ status: t.status, subTasks: t.subTasks });
                cascadeResult = res as typeof cascadeResult;
                return { ...t, status: res.status, subTasks: res.subTasks as PersistedSubTask[] };
            };
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, (t) => ({
                ...t,
                status: cascadeResult!.status,
                subTasks: cascadeResult!.subTasks,
            })));

            if (!cascadeResult) return;
            const { error } = await PersistenceAdapter.updateTask(taskId, {
                status: cascadeResult.status,
                subTasks: cascadeResult.subTasks,
            });
            if (error) {
                console.error('[useCustomer.toggleTaskStatus] persist failed:', error.message);
                await reload();
                return;
            }
            await LogService.recordTaskStatusChange(taskId, currentStatus, cascadeResult.status);
        },
        [reload]
    );

    const setSubtaskCompleted = useCallback(
        async (taskId: string, subtaskId: string, completed: boolean): Promise<void> => {
            let cascadeResult: { status: 'pending' | 'completed'; subTasks: PersistedSubTask[] } | null = null;
            let before: PersistedTask | null = null;
            const apply = (t: PersistedTask): PersistedTask => {
                before = t;
                const res = cascadeOnSubtaskSet(
                    { status: t.status, subTasks: t.subTasks },
                    subtaskId,
                    completed
                );
                cascadeResult = res as typeof cascadeResult;
                return { ...t, status: res.status, subTasks: res.subTasks as PersistedSubTask[] };
            };
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, (t) => ({
                ...t,
                status: cascadeResult!.status,
                subTasks: cascadeResult!.subTasks,
            })));

            if (!cascadeResult || !before) return;
            const { error } = await PersistenceAdapter.updateTask(taskId, {
                status: cascadeResult.status,
                subTasks: cascadeResult.subTasks,
            });
            if (error) {
                console.error('[useCustomer.setSubtaskCompleted] persist failed:', error.message);
                await reload();
                return;
            }
            await LogService.recordTaskChange(
                taskId,
                { subTasks: before.subTasks, status: before.status } as unknown as Record<string, unknown>,
                { subTasks: cascadeResult.subTasks, status: cascadeResult.status } as unknown as Record<string, unknown>
            );
        },
        [reload]
    );

    const toggleSubtask = useCallback(
        async (taskId: string, subtaskId: string): Promise<void> => {
            const existing = (editData ?? customer)?.tasks.find((t) => t.id === taskId);
            const sub = existing?.subTasks.find((s) => s.id === subtaskId);
            await setSubtaskCompleted(taskId, subtaskId, !sub?.completed);
        },
        [editData, customer, setSubtaskCompleted]
    );

    const updateSubtaskComment = useCallback(
        async (taskId: string, subtaskId: string, comment: string): Promise<void> => {
            let before: PersistedSubTask[] | null = null;
            let after: PersistedSubTask[] | null = null;
            const apply = (t: PersistedTask): PersistedTask => {
                before = t.subTasks;
                after = t.subTasks.map((s) => (s.id === subtaskId ? { ...s, comment } : s));
                return { ...t, subTasks: after };
            };
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, (t) => ({ ...t, subTasks: after! })));

            if (!after) return;
            const { error } = await PersistenceAdapter.updateTaskSubtasks(taskId, after);
            if (error) {
                console.error('[useCustomer.updateSubtaskComment] persist failed:', error.message);
                await reload();
                return;
            }
            await LogService.recordTaskChange(
                taskId,
                { subTasks: before } as unknown as Record<string, unknown>,
                { subTasks: after } as unknown as Record<string, unknown>
            );
        },
        [reload]
    );

    const updateTaskPriority = useCallback(
        async (taskId: string, priority: TaskPriority): Promise<void> => {
            let before: TaskPriority | undefined;
            const apply = (t: PersistedTask): PersistedTask => {
                before = t.priority;
                return { ...t, priority };
            };
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, (t) => ({ ...t, priority })));

            const { error } = await PersistenceAdapter.updateTaskPriority(taskId, priority);
            if (error) {
                console.error('[useCustomer.updateTaskPriority] persist failed:', error.message);
                await reload();
                return;
            }
            await LogService.recordTaskChange(
                taskId,
                { priority: before } as unknown as Record<string, unknown>,
                { priority } as unknown as Record<string, unknown>
            );
        },
        [reload]
    );

    const updateTask = useCallback(
        async (taskId: string, patch: Partial<PersistedTask>): Promise<void> => {
            const existing = (editData ?? customer)?.tasks.find((t) => t.id === taskId);
            // Optimistic merge
            const apply = (t: PersistedTask): PersistedTask => ({ ...t, ...patch });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            const { error } = await PersistenceAdapter.updateTask(taskId, patch);
            if (error) {
                console.error('[useCustomer.updateTask] persist failed:', error.message);
                await reload();
                return;
            }
            if (existing) {
                await LogService.recordTaskChange(
                    taskId,
                    existing as unknown as Record<string, unknown>,
                    { ...existing, ...patch } as unknown as Record<string, unknown>
                );
            }
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
        () => (tasks ? calculateWeightedProgress(tasks).percent : 0),
        [tasks]
    );

    const isFinalized = useMemo(
        () => (tasks ? isCustomerFinalized(tasks) : false),
        [tasks]
    );

    const visibleFields = useMemo(
        () => (editData ? listVisibleFields(editData) : []),
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
