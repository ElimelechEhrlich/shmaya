// src/services/CustomerService.ts

import { PersistenceAdapter, SubTaskPriority } from './PersistenceAdapter';
import { TaskGeneratorService } from './TaskService';
import { planIdempotentSync } from '../registries/CustomerRegistry';
import { CustomerFormData } from '../types/customer';
import type { Customer } from '../registries/CustomerRegistry';

export interface ServiceResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

function formDataToCustomer(formData: CustomerFormData): Partial<Customer> {
    return {
        customerDetails: {
            fullName: formData.customerDetails.fullName,
            identityId: formData.customerDetails.identityId,
            phoneNumber: formData.customerDetails.phoneNumber,
            address: formData.customerDetails.address,
            email: formData.customerDetails.email,
        },
        businessDetails: {
            businessName: formData.businessDetails.businessName,
            businessID: formData.businessDetails.businessID,
            businessType: formData.businessDetails.businessType as any,
            openingDate: formData.businessDetails.openingDate,
            occupation: formData.businessDetails.occupation,
            businessDescription: formData.businessDetails.businessDescription,
            employsWorkers: formData.businessDetails.employsWorkers as any,
            deductionsId: formData.businessDetails.deductionsId,
        },
        insuranceDetails: {
            insurancePrepayment: formData.insuranceDetails.insurancePrepayment,
            workHours: formData.insuranceDetails.workHours,
            newInsuranceCase: formData.insuranceDetails.newInsuranceCase,
            insuranceId: (formData.insuranceDetails as any).insuranceId || '',
            insuranceStatus: (formData.insuranceDetails as any).insuranceStatus || '',
        },
        incomeTaxDetails: {
            repType: formData.incomeTaxDetails.repType as any,
            incomeTaxPrepayment: formData.incomeTaxDetails.incomeTaxPrepayment,
            annualTurnover: formData.incomeTaxDetails.annualTurnover,
            newItCase: formData.incomeTaxDetails.newItCase,
            needsIncomeTaxDirectDebit: formData.incomeTaxDetails.needsIncomeTaxDirectDebit,
        },
        vatDetails: {
            newVatCase: formData.vatDetails.newVatCase,
        },
        paymentDetails: {
            setupFee: formData.paymentDetails.setupFee,
            monthlyFee: formData.paymentDetails.monthlyFee,
            directDebit: formData.paymentDetails.directDebit,
            setupFeePaid: formData.paymentDetails.setupFeePaid,
        },
        isInsuranceActive: formData.isInsuranceActive,
        isIncomeTaxActive: formData.isIncomeTaxActive,
        isVatActive: formData.isVatActive,
        needsDeductionsFile: formData.needsDeductionsFile,
        comments: formData.comments,
        isActive: formData.isActive,
    };
}

export const CustomerService = {
    saveCustomer: async (formData: CustomerFormData, isEdit: boolean = false, clientId: string | null = null): Promise<ServiceResponse> => {
        try {
            if (formData.businessDetails?.isNewBusiness && !formData.businessDetails?.openingDate) {
    return { success: false, error: 'עסק חדש מחייב תאריך פתיחת עסק' };
            }
            const customerPayload = formDataToCustomer(formData);
            let customerId = clientId;
            if (isEdit && customerId) {
                // Run customer update and existing-task fetch in parallel — they touch separate tables
                const [updateResult, existingTasksResult] = await Promise.all([
                    PersistenceAdapter.updateCustomer(customerId, customerPayload),
                    PersistenceAdapter.fetchTasksForCustomer(customerId),
                ]);
                if (updateResult.error) throw new Error(updateResult.error.message);
                if (existingTasksResult.error) throw new Error(existingTasksResult.error.message);
                await CustomerService.syncTasksWithExisting(customerId, formData, existingTasksResult.data ?? []);
            } else {
                const { data, error } = await PersistenceAdapter.insertCustomer(customerPayload);
                if (error) throw new Error(error.message);
                customerId = data?.id ?? null;
                if (!customerId) throw new Error('נכשלה הפקת מזהה לקוח ייחודי');
                await CustomerService.syncTasks(customerId, formData, false);
            }

            return { success: true, data: { id: customerId } };
        } catch (error: any) {
            console.error('Critical error in CustomerService.saveCustomer:', error);
            return { success: false, error: error.message || 'שגיאה בתהליך השמירה' };
        }
    },

    syncTasks: async (customerId: string, clientForm: CustomerFormData, isEdit: boolean): Promise<void> => {
        const clientPayload = { id: customerId, ...clientForm };
        const generatedTasks = TaskGeneratorService.generateForCustomer(clientPayload as any);

        if (!isEdit) {
            if (generatedTasks.length === 0) return;
            await Promise.all(generatedTasks.map((t: any) => PersistenceAdapter.insertSingleTask({
                title: t.title,
                clientId: customerId,
                registryKey: t.parentTaskId ?? null,
                subTasks: t.subTasks.map((s: any) => ({
                    title: s.title,
                    priority: (s.priority || 'medium') as SubTaskPriority,
                    comment: s.comment || ''
                }))
            } as any)));
            return;
        }

        const existingResult = await PersistenceAdapter.fetchTasksForCustomer(customerId);
        if (existingResult.error) throw new Error(existingResult.error.message);
        await CustomerService.syncTasksWithExisting(customerId, clientForm, existingResult.data ?? []);
    },

    syncTasksWithExisting: async (customerId: string, clientForm: CustomerFormData, existing: any[]): Promise<void> => {
        const clientPayload = { id: customerId, ...clientForm };
        const generatedTasks = TaskGeneratorService.generateForCustomer(clientPayload as any);
        const plan = planIdempotentSync(generatedTasks as any, existing as any) as any;

        const ops: Promise<any>[] = [];

        if (plan.toDeletePendingIds?.length > 0) {
            ops.push(PersistenceAdapter.deleteTasksByIds(plan.toDeletePendingIds).then(r => {
                if (r.error) throw new Error(r.error.message);
            }));
        }

        if (plan.toInsert?.length > 0) {
            ops.push(...plan.toInsert.map((t: any) => PersistenceAdapter.insertSingleTask({
                title: t.title,
                clientId: customerId,
                registryKey: t.parentTaskId ?? null,
                subTasks: t.subTasks.map((s: any) => ({
                    title: s.title,
                    priority: (s.priority || 'medium') as SubTaskPriority,
                    comment: s.comment || ''
                }))
            } as any)));
        }

        if (plan.toUpdate?.length > 0) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validUpdates = plan.toUpdate.filter((t: any) => t.id && uuidRegex.test(t.id)); ops.push(...validUpdates.map((t: any) =>
                PersistenceAdapter.updateTaskSubtasks(t.id, t.subTasks).then(r => {
                    if (r.error) throw new Error(r.error.message);
                })
            ));

        }

        if (ops.length > 0) await Promise.all(ops);
    },

    deactivateCustomer: async (clientId: string): Promise<ServiceResponse> => {
        try {
            const { error } = await PersistenceAdapter.updateCustomer(clientId, {
                isActive: false,
                isInsuranceActive: false,
                isIncomeTaxActive: false,
                isVatActive: false,
            });
            if (error) throw new Error(error.message);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    reactivateCustomer: async (clientId: string): Promise<ServiceResponse> => {
        const { error } = await PersistenceAdapter.updateCustomer(clientId, { isActive: true });
        if (error) return { success: false, error: error.message };
        return { success: true };
    },

    deleteCustomer: async (clientId: string): Promise<ServiceResponse> => {
        try {
            const { error } = await PersistenceAdapter.deleteCustomer(clientId);
            if (error) throw new Error(error.message);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },
};
