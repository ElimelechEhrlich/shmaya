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
import { authService } from '../services/authService.js';
import {
    PersistenceAdapter,
    type CustomerWithTasks,
    type PersistedTask,
    type PersistedSubTask,
    type SubTaskPriority,
} from '../services/PersistenceAdapter';
import { LogService } from '../services/LogService';
import { CustomerService } from '../services/CustomerService';
import {
    applyBusinessRules,
    calculateWeightedProgress,
    isCustomerFinalized,
    cascadeOnSubtaskSet,
    type Customer,
} from '../registries/CustomerRegistry';
import { translateError } from '../utils/translateError';
import { useNavigate } from 'react-router';
import { useModal } from '../contexts/ModalContext';
import { handleLtdCustomerFlow } from '../utils/handleLtdCustomerFlow';

export interface UseCustomerActions {
    updateField: (category: string | null, field: string, value: unknown) => void;
    setEditMode: (editing: boolean) => void;
    save: () => Promise<{ success: boolean; error?: string }>;
    toggleTaskStatus: (parentTaskId: string, currentStatus: 'pending' | 'completed') => Promise<void>;
    setSubtaskCompleted: (taskId: string, subtaskId: string, completed: boolean) => Promise<void>;
    updateSubTaskPriority: (taskId: string, subtaskId: string, priority: SubTaskPriority) => Promise<void>;
    deactivate: () => Promise<{ success: boolean; error?: string }>;
    reactivate: () => Promise<{ success: boolean; error?: string }>;
    remove: () => Promise<{ success: boolean; error?: string }>;
    reload: () => Promise<void>;
    uploadFile: (
        field: 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl',
        fileType: 'id_photo' | 'bank_approval' | 'agreement',
        file: File
    ) => Promise<{ success: boolean; error?: string }>;
    getFileDownloadUrl: (path: string) => Promise<{ success: boolean; url?: string; error?: string }>;
    removeFile: (
        field: 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl',
        path: string
    ) => Promise<{ success: boolean; error?: string }>;
}

export interface UseCustomerResult {
    customer: CustomerWithTasks | null;
    editData: CustomerWithTasks | null;
    loading: boolean;
    isEditing: boolean;
    progress: number;
    isFinalized: boolean;
    actions: UseCustomerActions;
}

function withTaskUpdated(
    state: CustomerWithTasks | null,
    taskId: string,
    transform: (t: PersistedTask) => PersistedTask
): CustomerWithTasks | null {
    if (!state) return state;
    return {
        ...state,
        // השוואה נקייה ומדויקת לפי ה-id של ישות האב המיוצגת במערך
        tasks: state.tasks.map((t) => (t.id === taskId ? transform(t) : t)),
    };
}

export function useCustomer(customerId: string | undefined): UseCustomerResult {
    const [customer, setCustomer] = useState<CustomerWithTasks | null>(null);
    const [editData, setEditData] = useState<CustomerWithTasks | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const navigate = useNavigate();
    const modal = useModal();

    const reload = useCallback(async () => {
        if (!customerId) { setLoading(false); return; }
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchCustomerWithTasks(customerId);
        if (!error && data) { setCustomer(data); setEditData(data); }
        setLoading(false);
    }, [customerId]);

    useEffect(() => {
        if (!customerId) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        PersistenceAdapter.fetchCustomerWithTasks(customerId).then(({ data, error }) => {
            if (cancelled) return;
            if (!error && data) { setCustomer(data); setEditData(data); }
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [customerId]);

    const updateField = useCallback(
        (category: string | null, field: string, value: unknown) => {
            setEditData((prev) => {
                if (!prev) return prev;
                const next: Record<string, unknown> = { ...prev };
                if (category) {
                    const prevCategory =
                        (prev as unknown as Record<string, Record<string, unknown> | undefined>)[category] ?? {};
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
                const shouldDeactivate = await modal.confirm(
                    'שים לב: כיבית את כל הרשויות בטיפול עבור לקוח זה.\nהאם ברצונך לשמור את השינויים ולהפוך את הלקוח ל"לא פעיל" באופן אוטומטי?'
                );
                if (!shouldDeactivate) {
                    setEditData(customer);
                    setIsEditing(false);
                    return { success: false, error: 'CANCELLED' };
                }
                updatedData = { ...updatedData, isActive: false };
            }

            const { tasks: _, ...cleanFormData } = updatedData as any;
            const prevInsurance = customer?.isInsuranceActive;
const prevIncomeTax = customer?.isIncomeTaxActive;
const prevVat = customer?.isVatActive;
const customerName = editData.customerDetails?.fullName ?? '';
            const result = await CustomerService.saveCustomer(cleanFormData, true, customerId);
            if (result.success) {
                if (prevInsurance !== editData.isInsuranceActive)
    await PersistenceAdapter.insertLog(authService.getCurrentUser() ?? 'unknown',
        editData.isInsuranceActive ? 'הפעלת ביטוח לאומי' : 'כיבוי ביטוח לאומי',
        'customer', customerId, customerName);
if (prevIncomeTax !== editData.isIncomeTaxActive)
    await PersistenceAdapter.insertLog(authService.getCurrentUser() ?? 'unknown',
        editData.isIncomeTaxActive ? 'הפעלת מס הכנסה' : 'כיבוי מס הכנסה',
        'customer', customerId, customerName);
if (prevVat !== editData.isVatActive)
    await PersistenceAdapter.insertLog(authService.getCurrentUser() ?? 'unknown',
        editData.isVatActive ? 'הפעלת מע"מ' : 'כיבוי מע"מ',
        'customer', customerId, customerName);
                setIsEditing(false);
                await reload();
                const wasLtd = customer?.businessDetails?.businessType === 'חברה בע"מ';
const isNowLtd = editData?.businessDetails?.businessType === 'חברה בע"מ';

if (!wasLtd && isNowLtd && editData) {
    await handleLtdCustomerFlow(
        customerId,
        editData.customerDetails,
        modal,
        navigate
    );
}
                
            }
            return result;
        },
        [customerId, editData, customer, reload]
    );

    // ── ✨ סעיף 2: עדכון גורף אטומי עבור אב המשימה (Cascade Parent Toggle) ──
    const toggleTaskStatus = useCallback(
        async (parentTaskId: string, currentStatus: 'pending' | 'completed'): Promise<void> => {
            if (!customerId) return;
            const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
            const isCompletedBoolean = nextStatus === 'completed';

            if (isCompletedBoolean) {
                const targetTask = (customer ?? editData)?.tasks.find(t => t.id === parentTaskId);
                if (targetTask?.subTasks?.some(s => !authService.canApproveFinal(s.title))) {
                    alert("הפעולה נחסמה: המשימה מכילה 'אישור ניהול סופי' ואין לך הרשאה לאשר אותו!");
                    return;
                }
            }

            // 1. עדכון אופטימי מהיר ומיידי בסטייט המקומי (למניעת כל איטיות ברינדור)
            const applyCascade = (t: PersistedTask): PersistedTask => ({
                ...t,
                status: nextStatus,
                subTasks: (t.subTasks || []).map((st) => ({ ...st, completed: isCompletedBoolean }))
            });

            setCustomer((s) => withTaskUpdated(s, parentTaskId, applyCascade));
            setEditData((s) => withTaskUpdated(s, parentTaskId, applyCascade));

            // 2. עדכון גורף ישיר ב-Supabase רק עבור תתי-המשימות של הלקוח המשויכות לאותו אב
            const { error } = await PersistenceAdapter.updateSubtasksStatusByParent(
                customerId,
                parentTaskId,
                isCompletedBoolean
            );

            if (error) {
                alert(`שגיאה בעדכון סטטוס המשימה: ${translateError(error.message)}`);
                console.error('[useCustomer.toggleTaskStatus] Cascade update failed:', error.message);
                await reload();
                return;
            }

            await LogService.recordTaskStatusChange(parentTaskId, currentStatus, nextStatus);
        },
        [customerId, reload, customer, editData]
    );

    const setSubtaskCompleted = useCallback(
        async (taskId: string, subtaskId: string, completed: boolean): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const beforeStatus = targetTask.status;
            const beforeSubTasks = targetTask.subTasks || [];

            const targetSub = beforeSubTasks.find(s => s.id === subtaskId);
            if (completed && targetSub && !authService.canApproveFinal(targetSub.title)) {
                alert("אין לך הרשאה לסמן 'אישור ניהול סופי' כבוצע!");
                return;
            }

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

            const { error: subErr } = await PersistenceAdapter.updateSubtaskStatus(taskId, subtaskId, completed);

            if (subErr) {
                alert(`שגיאה בסימון תת-המשימה: ${translateError(subErr.message)}`);
                console.error('[useCustomer.setSubtaskCompleted] persist failed:', subErr.message);
                await reload();
                return;
            }

            if (nextStatus !== beforeStatus) {
                const { error: statusErr } = await PersistenceAdapter.updateTaskStatus(taskId, nextStatus);
                if (statusErr) {
                    alert(`שגיאה בעדכון סטטוס המשימה: ${statusErr.message}`);
                    await reload();
                    return;
                }
            }

            await PersistenceAdapter.insertLog(
    authService.getCurrentUser() ?? 'unknown',
    completed ? 'ביצוע משימה' : 'ביטול ביצוע משימה',
    'task', taskId,
    `${targetSub.title} — ${customer?.customerDetails?.fullName ?? ''}`
);

            await LogService.recordTaskChange(
                taskId,
                { subTasks: beforeSubTasks, status: beforeStatus } as unknown as Record<string, unknown>,
                { subTasks: nextSubTasks, status: nextStatus } as unknown as Record<string, unknown>
            );
        },
        [editData, customer, reload]
    );

    

    

    // ✨ תיקון: עדכון רמת הדחיפות ישירות לתוך השדה הפנימי של תת המשימה
    const updateSubTaskPriority = useCallback(
        async (taskId: string, subtaskId: string, priority: SubTaskPriority): Promise<void> => {
            const targetTask = (editData ?? customer)?.tasks.find(t => t.id === taskId);
            if (!targetTask) return;

            const beforeSubTasks = targetTask.subTasks || [];
            const nextSubTasks = beforeSubTasks.map((s) => (s.id === subtaskId ? { ...s, priority } : s));

            // 1. עדכון אופטימי מהיר ב-State של React
            const apply = (t: PersistedTask): PersistedTask => ({ ...t, subTasks: nextSubTasks });
            setCustomer((s) => withTaskUpdated(s, taskId, apply));
            setEditData((s) => withTaskUpdated(s, taskId, apply));

            // 2. שמירה ברקע ב-Supabase עם שם הפונקציה המדויק (t קטנה!)
            const { error } = await PersistenceAdapter.updateSubtaskPriority(subtaskId, priority);

            if (error) {
                alert(`שגיאה בעדכון הדחיפות: ${translateError(error.message)}`);
                console.error('[useCustomer.updateSubTaskPriority] persist failed:', error.message);
                await reload(); // רענון מאולץ רק במקרה של שגיאת רשת
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

    

    const deactivate = useCallback(
        async (): Promise<{ success: boolean; error?: string }> => {
            if (!customerId) return { success: false, error: 'No customer loaded' };
            const r = await CustomerService.deactivateCustomer(customerId);
            if (r.success) await PersistenceAdapter.insertLog(
    authService.getCurrentUser() ?? 'unknown',
    'השבתת לקוח', 'customer', customerId,
    customer?.customerDetails?.fullName ?? ''
);
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
            const result = await CustomerService.deleteCustomer(customerId);
if (result.success) await PersistenceAdapter.insertLog(
    authService.getCurrentUser() ?? 'unknown',
    'מחיקת לקוח', 'customer', customerId,
    customer?.customerDetails?.fullName ?? ''
);
return result;
        },
        [customerId]
    );

    const uploadFile = useCallback(
        async (
            field: 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl',
            fileType: 'id_photo' | 'bank_approval' | 'agreement',
            file: File
        ): Promise<{ success: boolean; error?: string }> => {
            if (!customerId) return { success: false, error: 'No customer loaded' };
            const { data: path, error } = await PersistenceAdapter.uploadCustomerFile(customerId, file, fileType);
            if (error || !path) return { success: false, error: error?.message ?? 'שגיאה בהעלאת הקובץ' };
            updateField(null, field, path);
            return { success: true };
        },
        [customerId, updateField]
    );

    const getFileDownloadUrl = useCallback(
        async (path: string): Promise<{ success: boolean; url?: string; error?: string }> => {
            const { data: url, error } = await PersistenceAdapter.getSignedFileUrl(path);
            if (error || !url) return { success: false, error: error?.message ?? 'שגיאה בהפקת קישור להורדה' };
            return { success: true, url };
        },
        []
    );

    const removeFile = useCallback(
        async (
            field: 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl',
            path: string
        ): Promise<{ success: boolean; error?: string }> => {
            const { error } = await PersistenceAdapter.deleteCustomerFile(path);
            if (error) return { success: false, error: error.message ?? 'שגיאה במחיקת הקובץ' };
            updateField(null, field, null);
            return { success: true };
        },
        [updateField]
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

    const actions = {
        updateField,
        setEditMode,
        save,
        toggleTaskStatus,
        setSubtaskCompleted,
        updateSubTaskPriority, // ✨ הפניה לפונקציה המעודכנת
        deactivate,
        reactivate,
        remove,
        reload,
        uploadFile,
        getFileDownloadUrl,
        removeFile,
    };

    return {
        customer,
        editData,
        loading,
        isEditing,
        progress,
        isFinalized,
        actions,
    };
}
