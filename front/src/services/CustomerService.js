// src/services/CustomerService.js
//
// Customer-level orchestration. All DB access goes through PersistenceAdapter;
// all observable state changes are logged via LogService.
//
// syncTasks is now idempotent: on edit, existing tasks are preserved (status,
// subtask completion, comments). Re-runs never duplicate or wipe progress.

import { PersistenceAdapter } from './PersistenceAdapter.ts';
import { LogService } from './LogService.ts';
import { TaskGeneratorService } from './TaskService.js';
import { planIdempotentSync } from '../registries/CustomerRegistry.ts';

export const CustomerService = {
    saveCustomer: async (formData, isEdit = false, clientId = null) => {
        try {
            let savedClient;
            let oldClient = null;

            if (isEdit && clientId) {
                const fetched = await PersistenceAdapter.fetchCustomerWithTasks(clientId);
                if (fetched.error) throw new Error(fetched.error.message);
                oldClient = fetched.data;

                const result = await PersistenceAdapter.updateCustomer(clientId, formData);
                if (result.error) throw new Error(result.error.message);
                savedClient = result.data;
            } else {
                const result = await PersistenceAdapter.insertCustomer(formData);
                if (result.error) throw new Error(result.error.message);
                savedClient = result.data;
            }

            if (!savedClient) throw new Error('Persistence returned no row');

            await CustomerService.syncTasks(savedClient, isEdit);

            if (isEdit && oldClient) {
                const { tasks: _oldTasks, ...oldBare } = oldClient;
                const { tasks: _newTasks, ...newBare } = savedClient;
                await LogService.recordCustomerChange(savedClient.id, oldBare, newBare);
            } else {
                await LogService.recordCustomerCreate(savedClient);
            }

            return { success: true, data: savedClient };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Idempotent: on edit, regenerates the catalog and merges with existing
     * tasks via Registry.planIdempotentSync. Preserves completion state and
     * subtask comments. Only pending tasks whose parent_task_id is no longer
     * generated are deleted.
     */
    syncTasks: async (client, isEdit) => {
        const generatedTasks = TaskGeneratorService.generateForCustomer(client);

        if (!isEdit) {
            // First-time creation — straight insert.
            if (generatedTasks.length === 0) return;
            const rows = generatedTasks.map(t => ({
                clientId: client.id,
                parentTaskId: t.parentTaskId,
                title: t.title,
                status: 'pending',
                restrictedTo: t.restrictedTo || null,
                subTasks: t.subTasks,
                priority: t.priority || 'medium',
            }));
            const ins = await PersistenceAdapter.insertTasks(rows);
            if (ins.error) throw new Error(ins.error.message);
            return;
        }

        // Edit flow — merge against existing rows.
        const existingResult = await PersistenceAdapter.fetchTasksForCustomer(client.id);
        if (existingResult.error) throw new Error(existingResult.error.message);
        const existing = existingResult.data ?? [];

        const plan = planIdempotentSync(generatedTasks, existing);

        if (plan.toDeletePendingIds.length > 0) {
            const del = await PersistenceAdapter.deleteTasksByIds(plan.toDeletePendingIds);
            if (del.error) throw new Error(del.error.message);
        }

        if (plan.toInsert.length > 0) {
            const rows = plan.toInsert.map(t => ({
                clientId: client.id,
                parentTaskId: t.parentTaskId,
                title: t.title,
                status: 'pending',
                restrictedTo: t.restrictedTo || null,
                subTasks: t.subTasks,
                priority: t.priority || 'medium',
            }));
            const ins = await PersistenceAdapter.insertTasks(rows);
            if (ins.error) throw new Error(ins.error.message);
        }

        for (const u of plan.toUpdate) {
            const upd = await PersistenceAdapter.updateTaskSubtasks(u.id, u.subTasks);
            if (upd.error) throw new Error(upd.error.message);
        }
    },

    /** Soft-deactivate: keep the row, clear active services, log the action. */
    deactivateCustomer: async (clientId) => {
        const fetched = await PersistenceAdapter.fetchCustomerWithTasks(clientId);
        if (fetched.error || !fetched.data) return { success: false, error: fetched.error?.message };
        const before = fetched.data;
        const patch = {
            isActive: false,
            isInsuranceActive: false,
            isIncomeTaxActive: false,
            isVatActive: false,
        };
        const result = await PersistenceAdapter.updateCustomer(clientId, patch);
        if (result.error) return { success: false, error: result.error.message };
        await LogService.recordCustomerChange(clientId, { isActive: before.isActive ?? true }, { isActive: false });
        return { success: true };
    },

    reactivateCustomer: async (clientId) => {
        const result = await PersistenceAdapter.updateCustomer(clientId, { isActive: true });
        if (result.error) return { success: false, error: result.error.message };
        await LogService.recordCustomerChange(clientId, { isActive: false }, { isActive: true });
        return { success: true };
    },

    /** Hard delete: removes tasks (FK first) then the customer row. */
    deleteCustomer: async (clientId) => {
        const fetched = await PersistenceAdapter.fetchCustomerWithTasks(clientId);
        const name = fetched.data?.customerDetails?.fullName ?? clientId;
        const result = await PersistenceAdapter.deleteCustomer(clientId);
        if (result.error) return { success: false, error: result.error.message };
        await LogService.recordAction('customer.delete', 'customer', clientId, { name });
        return { success: true };
    },
};
