// src/services/CustomerService.js
//
// Customer-level orchestration: save flows (create/edit) + task sync. All DB
// access is delegated to PersistenceAdapter; all observable state changes are
// logged via LogService. This file contains NO Supabase calls.

import { PersistenceAdapter } from './PersistenceAdapter.ts';
import { LogService } from './LogService.ts';
import { TaskGeneratorService } from './TaskService.js';

export const CustomerService = {
    /**
     * Persists a customer (insert or update) and synchronizes its task list.
     * Returns `{ success, data, error }` with `data` being the saved row.
     *
     * Logging:
     *   - insert  → LogService.recordCustomerCreate(savedClient)
     *   - update  → LogService.recordCustomerChange(id, oldClient, savedClient)
     *     (diff is computed inside LogService; no-op if nothing changed.)
     */
    saveCustomer: async (formData, isEdit = false, clientId = null) => {
        try {
            let savedClient;
            let oldClient = null;

            if (isEdit && clientId) {
                // Capture the prior state for diff logging.
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
                // Strip joined tasks array — task changes are logged separately.
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
     * Deletes all *pending* tasks for the customer (preserving completed ones
     * as historical record — audit §4) and re-inserts a fresh task batch
     * generated from the current customer state. Each new row carries a
     * `parentTaskId` keyed to AUTO_TASKS_CONFIG.
     */
    syncTasks: async (client, isEdit) => {
        if (isEdit) {
            const del = await PersistenceAdapter.deletePendingTasksForCustomer(client.id);
            if (del.error) throw new Error(del.error.message);
        }

        const generatedTasks = TaskGeneratorService.generateForCustomer(client);
        if (generatedTasks.length === 0) return;

        const tasksToSave = generatedTasks.map(t => ({
            clientId: client.id,
            parentTaskId: t.parentTaskId,
            title: t.title,
            status: 'pending',
            restrictedTo: t.restrictedTo || null,
            subTasks: t.subTasks,
        }));

        const ins = await PersistenceAdapter.insertTasks(tasksToSave);
        if (ins.error) throw new Error(ins.error.message);
    },
};
