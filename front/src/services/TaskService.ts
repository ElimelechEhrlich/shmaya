// src/services/TaskService.ts
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

// הגדרת המבנה של נתוני הלקוח
export interface CustomerData {
    id?: string;
    businessType?: string;
    isIncomeTaxActive?: boolean;
    isVatActive?: boolean;
    isInsuranceActive?: boolean;
    [key: string]: any; // תמיכה בשדות דינמיים נוספים של הלקוח
}

// הגדרת המבנה של תת-משימה מיוצרת
export interface GeneratedSubTask {
    id: string;
    title: string;
    completed: boolean;
    details: Record<string, any>;
    comment: string;
    priority: 'low' | 'medium' | 'high' | 'critical'
}

// הגדרת המבנה של משימה ראשית מיוצרת
export interface GeneratedTask {
    id: string;
    parentTaskId: string;
    title: string;
    restrictedTo: string[] | null;
    subTasks: GeneratedSubTask[];
}

export class TaskGeneratorService {
    /**
     * Generates tasks for a customer.
     */
    static generateForCustomer(customerData: CustomerData): GeneratedTask[] {
        return AUTO_TASKS_CONFIG
            .filter((parentTask: any) => {
                // תיקון: המרה ל-any של customerData כדי להתאים לחתימת הפונקציה ב-Registry
                const registryDecision = shouldEmitServiceParent(parentTask.id, customerData as any);
                if (registryDecision !== null) return registryDecision;
                return !parentTask.condition || parentTask.condition(customerData);
            })
            .map((parentTask: any): GeneratedTask => ({
                id: crypto.randomUUID(),
                parentTaskId: parentTask.id,
                title: parentTask.title,
                restrictedTo: parentTask.restrictedTo || null,
                subTasks: parentTask.subTasks
                    .filter((sub: any) => {
                        if (sub.condition) return sub.condition(customerData);
                        if (isSubtaskBusinessTypeGated(parentTask.id, sub.id)) {
                            // תיקון: המרה ל-any של customerData גם כאן
                            return isSubtaskForcedByBusinessType(parentTask.id, sub.id, customerData as any);
                        }
                        return true;
                    })
                    .map((sub: any): GeneratedSubTask => ({
                        id: sub.id,
                        title: sub.title,
                        completed: false,
                        details: sub.getDetails ? sub.getDetails(customerData) : {},
                        comment: '',
                        priority: sub.priority || 'medium', // יורש עדיפות מתת-המשימה, או מהמשימה האב, או ברירת מחדל
                    })),
            }));
    }

    /** Parent-id-anchored finalization probe (Hebrew-substring fallback for legacy rows). */
    static isCustomerFinalized(tasks: any[]): boolean {
        return isCustomerFinalized(tasks);
    }

    /** Returns 0–100 percent. Subtask-weighted via Registry.calculateWeightedProgress. */
    static calculateProgress(tasks: any[]): number {
        return calculateWeightedProgress(tasks as any).percent;
    }
}