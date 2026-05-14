// src/hooks/useCustomer.ts
//
// The unified data hook for the customer detail screen. Owns:
//   - fetch + cache of the customer + joined tasks
//   - edit-mode state, edit-data working copy
//   - business-rule cascade on every field update (via Registry)
//   - save + task-sync orchestration (delegates to CustomerService)
//   - task status & arbitrary task updates, with automatic LogService entries
//   - derived UI helpers: subtask-weighted progress, finalized status,
//     visible-field list
//
// CustomerCard.jsx is the primary consumer. Components using this hook should
// not need any local useState/useEffect for customer or task data.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    PersistenceAdapter,
    type CustomerWithTasks,
    type PersistedTask,
} from '../services/PersistenceAdapter';
import { LogService } from '../services/LogService';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — CustomerService is JS without types; the imported shape is
// stable per its file-level contract.
import { CustomerService } from '../services/CustomerService.js';
import {
    applyBusinessRules,
    calculateWeightedProgress,
    isCustomerFinalized,
    listVisibleFields,
    type Customer,
} from '../registries/CustomerRegistry';

export interface UseCustomerActions {
    /** Update one form field. Routed through Registry.applyBusinessRules so the
     *  cross-field cascade (e.g. זעיר → isVatActive=false) is always enforced. */
    updateField: (category: string | null, field: string, value: unknown) => void;

    /** Enter/exit edit mode. Exiting reverts unsaved changes back to the
     *  last fetched server state. */
    setEditMode: (editing: boolean) => void;

    /** Persist editData, re-sync tasks, log the diff. Re-fetches on success. */
    save: () => Promise<{ success: boolean; error?: string }>;

    /** Toggle a task between pending↔completed. Logs the change. */
    toggleTaskStatus: (taskId: string, currentStatus: 'pending' | 'completed') => Promise<void>;

    /** Update arbitrary task fields (e.g. subtask completion). Logs the diff. */
    updateTask: (taskId: string, patch: Partial<PersistedTask>) => Promise<void>;

    /** Force a re-fetch from the DB. */
    reload: () => Promise<void>;
}

export interface UseCustomerResult {
    customer: CustomerWithTasks | null;
    editData: CustomerWithTasks | null;
    loading: boolean;
    isEditing: boolean;
    /** 0–100. Subtask-weighted per Registry.calculateWeightedProgress. */
    progress: number;
    /** True when a FINAL_APPROVAL task is completed for this customer. */
    isFinalized: boolean;
    /** Field dot-paths the UI should render for the current state. */
    visibleFields: string[];
    actions: UseCustomerActions;
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
                // Preserve the joined tasks array — applyBusinessRules doesn't touch it,
                // but the cast through Customer loses the type.
                return { ...(normalized as unknown as CustomerWithTasks), tasks: prev.tasks };
            });
        },
        []
    );

    const setEditMode = useCallback(
        (editing: boolean) => {
            setIsEditing(editing);
            if (!editing && customer) {
                setEditData(customer);
            }
        },
        [customer]
    );

    const save = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId || !editData) {
                return { success: false, error: 'No data to save' };
            }
            const result = await CustomerService.saveCustomer(editData, true, customerId);
            if (result.success) {
                setIsEditing(false);
                await reload();
            }
            return result;
        },
        [customerId, editData, reload]
    );

    const toggleTaskStatus = useCallback(
        async (taskId: string, currentStatus: 'pending' | 'completed'): Promise<void> => {
            const newStatus: 'pending' | 'completed' =
                currentStatus === 'completed' ? 'pending' : 'completed';
            const { error } = await PersistenceAdapter.updateTaskStatus(taskId, newStatus);
            if (error) return;
            await LogService.recordTaskStatusChange(taskId, currentStatus, newStatus);
            await reload();
        },
        [reload]
    );

    const updateTask = useCallback(
        async (taskId: string, patch: Partial<PersistedTask>): Promise<void> => {
            const existing = editData?.tasks.find((t) => t.id === taskId);
            const { error } = await PersistenceAdapter.updateTask(taskId, patch);
            if (error) return;
            if (existing) {
                const after = { ...existing, ...patch };
                await LogService.recordTaskChange(
                    taskId,
                    existing as unknown as Record<string, unknown>,
                    after as unknown as Record<string, unknown>
                );
            }
            await reload();
        },
        [editData, reload]
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
            reload,
        },
    };
}
