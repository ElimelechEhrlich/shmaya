// src/services/TaskService.js
//
// Thin generation facade over taskRegistry.AUTO_TASKS_CONFIG. Cross-cutting
// progress, finalization, and parent/subtask gating decisions are owned by
// CustomerRegistry; this file just orchestrates the catalog walk.

import { AUTO_TASKS_CONFIG } from '../constants/taskRegistry';
import {
    calculateWeightedProgress,
    isCustomerFinalized,
    shouldEmitServiceParent,
    isSubtaskForcedByBusinessType,
    isSubtaskBusinessTypeGated,
} from '../registries/CustomerRegistry';

export class TaskGeneratorService {
    /**
     * Generates tasks for a customer.
     *
     * Parent gating:
     *   - If the parent is a service-owned id (returns non-null from
     *     shouldEmitServiceParent), the Registry's decision is final.
     *   - Otherwise the entry's own `condition` lambda decides (non-service
     *     parents: ADMIN_SETUP, DIRECT_DEBIT, FINAL_APPROVAL).
     *
     * Subtask gating:
     *   - If the subtask has its own `condition`, it's used.
     *   - Else if the subtask appears in any BUSINESS_TYPES.forcedSubtasks list
     *     (isSubtaskBusinessTypeGated), it's emitted only when the current
     *     customer's business type forces it.
     *   - Otherwise the subtask is emitted whenever its parent fires.
     */
    static generateForCustomer(customerData) {
        return AUTO_TASKS_CONFIG
            .filter(parentTask => {
                const registryDecision = shouldEmitServiceParent(parentTask.id, customerData);
                if (registryDecision !== null) return registryDecision;
                return !parentTask.condition || parentTask.condition(customerData);
            })
            .map(parentTask => ({
                id: crypto.randomUUID(),
                parentTaskId: parentTask.id,
                title: parentTask.title,
                restrictedTo: parentTask.restrictedTo || null,
                subTasks: parentTask.subTasks
                    .filter(sub => {
                        if (sub.condition) return sub.condition(customerData);
                        if (isSubtaskBusinessTypeGated(parentTask.id, sub.id)) {
                            return isSubtaskForcedByBusinessType(parentTask.id, sub.id, customerData);
                        }
                        return true;
                    })
                    .map(sub => ({
                        id: sub.id,
                        title: sub.title,
                        completed: false,
                        details: sub.getDetails ? sub.getDetails(customerData) : {},
                    })),
            }));
    }

    /** Parent-id-anchored finalization probe (Hebrew-substring fallback for legacy rows). */
    static isCustomerFinalized(tasks) {
        return isCustomerFinalized(tasks);
    }

    /** Returns 0–100 percent. Subtask-weighted via Registry.calculateWeightedProgress. */
    static calculateProgress(tasks) {
        return calculateWeightedProgress(tasks).percent;
    }
}
