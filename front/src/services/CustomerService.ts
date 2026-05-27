// src/services/CustomerService.ts

import { supabase } from '../supabaseClient';
import { PersistenceAdapter } from './PersistenceAdapter';
import { LogService } from './LogService';
import { TaskGeneratorService } from './TaskService';
import { planIdempotentSync } from '../registries/CustomerRegistry';
import { CustomerFormData } from '../types/customer';

// הגדרת מבנה התשובה הגנרי של השירות
export interface ServiceResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}

export const CustomerService = {
    /**
     * שמירה ועדכון לקוח במבנה מנורמל ומפוצל לטבלאות
     */
    saveCustomer: async (formData: CustomerFormData, isEdit: boolean = false, clientId: string | null = null): Promise<ServiceResponse> => {
        try {
            let customerId = clientId;
            let oldClientData: any = null;

            // א': שמירת/עדכון הליבה בטבלת הלקוחות הראשית (customers)
            const customerRow = {
                full_name: formData.customerDetails.fullName,
                identity_id: formData.customerDetails.identityId,
                phone_number: formData.customerDetails.phoneNumber,
                address: formData.customerDetails.address,
                email: formData.customerDetails.email,
                is_active: formData.isActive,
                comments: formData.comments
            };

            if (isEdit && customerId) {
                // שלב עריכה: שליפת המצב הישן לצורך לוג שינויים
                const { data: fetched, error: fetchErr } = await supabase
                    .from('customers')
                    .select('*, business_details(*), income_tax_cases(*), vat_cases(*), insurance_cases(*), payment_details(*)')
                    .eq('id', customerId)
                    .single();
                
                if (fetchErr) throw fetchErr;
                oldClientData = fetched;

                // עדכון טבלת אב
                const { error: updErr } = await supabase.from('customers').update(customerRow).eq('id', customerId);
                if (updErr) throw updErr;
            } else {
                // שלב יצירה: יצירת שורת אב חדשה וקבלת ה-UUID שלה
                const { data: inserted, error: insErr } = await supabase.from('customers').insert(customerRow).select('id').single();
                if (insErr) throw insErr;
                customerId = inserted.id;
            }

            if (!customerId) throw new Error('נכשלה הפקת מזהה לקוח ייחודי');

            // ב': שמירת/עדכון פרטי העסק (business_details)
            const businessRow = {
                customer_id: customerId,
                business_name: formData.businessDetails.businessName,
                business_id: formData.businessDetails.businessID,
                business_type: formData.businessDetails.businessType,
                opening_date: formData.businessDetails.openingDate,
                occupation: formData.businessDetails.occupation,
                business_description: formData.businessDetails.businessDescription,
                employs_workers: formData.businessDetails.employsWorkers,
                needs_deductions_file: formData.needsDeductionsFile,
                deductions_id: formData.businessDetails.deductionsId
            };
            const { error: busErr } = await supabase.from('business_details').upsert(businessRow);
            if (busErr) throw busErr;

            // ג': ניהול תיק מס הכנסה (income_tax_cases) - תלוי סטטוס אקטיבי
            if (formData.isIncomeTaxActive) {
                const itRow = {
                    customer_id: customerId,
                    rep_type: formData.incomeTaxDetails.repType,
                    income_tax_prepayment: formData.incomeTaxDetails.incomeTaxPrepayment,
                    annual_turnover: formData.incomeTaxDetails.annualTurnover,
                    is_new_case: formData.incomeTaxDetails.newItCase
                };
                const { error: itErr } = await supabase.from('income_tax_cases').upsert(itRow);
                if (itErr) throw itErr;
            } else if (isEdit) {
                await supabase.from('income_tax_cases').delete().eq('customer_id', customerId);
            }

            // ד': ניהול תיק מע"מ (vat_cases) - תלוי סטטוס אקטיבי
            if (formData.isVatActive) {
                const vatRow = {
                    customer_id: customerId,
                    is_new_case: formData.vatDetails.newVatCase
                };
                const { error: vatErr } = await supabase.from('vat_cases').upsert(vatRow);
                if (vatErr) throw vatErr;
            } else if (isEdit) {
                await supabase.from('vat_cases').delete().eq('customer_id', customerId);
            }

            // ה': ניהול תיק ביטוח לאומי (insurance_cases) - תלוי סטטוס אקטיבי
            if (formData.isInsuranceActive) {
                const insRow = {
                    customer_id: customerId,
                    insurance_prepayment: formData.insuranceDetails.insurancePrepayment,
                    work_hours: formData.insuranceDetails.workHours,
                    is_new_case: formData.insuranceDetails.newInsuranceCase
                };
                const { error: insErr } = await supabase.from('insurance_cases').upsert(insRow);
                if (insErr) throw insErr;
            } else if (isEdit) {
                await supabase.from('insurance_cases').delete().eq('customer_id', customerId);
            }

            // ו': שמירת פרטי פיננסים ותשלומים (payment_details)
            const paymentRow = {
                customer_id: customerId,
                setup_fee: Number(formData.paymentDetails.setupFee) || 0,
                monthly_fee: Number(formData.paymentDetails.monthlyFee) || 0,
                direct_debit: formData.paymentDetails.directDebit
            };
            const { error: payErr } = await supabase.from('payment_details').upsert(paymentRow);
            if (payErr) throw payErr;

            // ז': סנכרון המשימות האוטומטיות (הסבר מפורט בפונקציה למטה)
            await CustomerService.syncTasks(customerId, formData, isEdit);

            // ח': רישום פעולות ביומן המערכת (Log System)
            if (isEdit && oldClientData) {
                await LogService.recordCustomerChange(customerId, oldClientData, formData as any);
            } else {
                await LogService.recordCustomerCreate({ id: customerId, ...formData });
            }

            return { success: true, data: { id: customerId } };
        } catch (error: any) {
            console.error("Critical error in CustomerService.saveCustomer:", error);
            return { success: false, error: error.message || "שגיאה בתהליך השמירה המנורמלת" };
        }
    },

    /**
     * סנכרון משימות אדמפוטנטי מבוסס טבלאות מנורמלות (parent_tasks ו-sub_tasks)
     */
    syncTasks: async (customerId: string, clientForm: CustomerFormData, isEdit: boolean): Promise<void> => {
        // התאמת הנתונים עבור מחולל המשימות הדקלרטיבי
        const clientPayload = { id: customerId, ...clientForm };
        const generatedTasks = TaskGeneratorService.generateForCustomer(clientPayload as any);

if (!isEdit) {
    // לקוח חדש לחלוטין - יצירה ישירה ללא בדיקות מיזוג
    if (generatedTasks.length === 0) return;
    
    for (const t of generatedTasks) {
        // המרת הארגומנט כולו ל-any מונעת מ-TypeScript להשוות מבני ממשקים שונים
        await PersistenceAdapter.insertSingleTask({
            title: t.title,
            clientId: customerId,
            priority: (t.priority || 'medium') as 'low' | 'medium' | 'high',
            subTasks: t.subTasks.map((s: any) => ({ title: s.title }))
        } as any);
    }
    return;
}

        // במצב עריכה - שולפים את המשימות הקיימות כרגע ב-DB המנורמל
        const existingResult = await PersistenceAdapter.fetchTasksForCustomer(customerId);
        if (existingResult.error) throw new Error(existingResult.error.message);
        const existing = existingResult.data ?? [];

        // הפעלת תוכנית המיזוג האידמפוטנטית
        const plan = planIdempotentSync(generatedTasks as any, existing as any) as any;

        // 1. מחיקת משימות פתוחות שכבר לא רלוונטיות לפי חוקי העסק החדשים
        if (plan.toDeletePendingIds && plan.toDeletePendingIds.length > 0) {
            // מחיקת המשימות ב-Supabase (ה-sub_tasks יימחקו אוטומטית עקב ה-CASCADE)
            const { error: delErr } = await supabase
                .from('parent_tasks')
                .delete()
                .in('id', plan.toDeletePendingIds);
                
            if (delErr) throw delErr;
        }

        // 2. הוספת משימות אב ותתי משימות חדשים שנולדו בעקבות שינוי הרשויות
if (plan.toInsert && plan.toInsert.length > 0) {
    for (const t of plan.toInsert) {
        await PersistenceAdapter.insertSingleTask({
            title: t.title,
            clientId: customerId,
            priority: (t.priority || 'medium') as 'low' | 'medium' | 'high',
            subTasks: t.subTasks.map((s: any) => ({ title: s.title }))
        });
    }
}

        // 3. עדכון מערך תתי משימות קיים (שינוי כותרות או סינכרון פנימי)
        if (plan.toUpdate) {
            for (const u of plan.toUpdate) {
                const updateItem = u as { id: string; subTasks: any[] };
                
                // עדכון תתי משימות בטבלה המנורמלת
                for (const sub of updateItem.subTasks) {
                    await supabase
                        .from('sub_tasks')
                        .upsert({
                            parent_task_id: updateItem.id,
                            title: sub.title,
                            is_completed: sub.completed || false
                        });
                }
            }
        }
    },

    /** השבתה רכה: כיבוי הדגל הראשי ומחיקת תיקי הרשויות אקטיבית לשמירה על התלויות **/
    deactivateCustomer: async (clientId: string): Promise<ServiceResponse> => {
        try {
            // עדכון הסטטוס הראשי של הלקוח
            const { error: custErr } = await supabase
                .from('customers')
                .update({ is_active: false })
                .eq('id', clientId);
            if (custErr) throw custErr;

            // מחיקת כל תיקי הרשויות הפעילים (הנתונים יימחקו, הלקוח מוגדר כלא-פעיל ללא רשויות)
            await supabase.from('income_tax_cases').delete().eq('customer_id', clientId);
            await supabase.from('vat_cases').delete().eq('customer_id', clientId);
            await supabase.from('insurance_cases').delete().eq('customer_id', clientId);

            await LogService.recordCustomerChange(clientId, { isActive: true }, { isActive: false });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },

    /** הפעלה מחדש של הלקוח **/
    reactivateCustomer: async (clientId: string): Promise<ServiceResponse> => {
        const { error } = await supabase.from('customers').update({ is_active: true }).eq('id', clientId);
        if (error) return { success: false, error: error.message };
        
        await LogService.recordCustomerChange(clientId, { isActive: false }, { isActive: true });
        return { success: true };
    },

    /** מחיקה סופית (Hard Delete) מהמערכת **/
    deleteCustomer: async (clientId: string): Promise<ServiceResponse> => {
        try {
            // שלילת שם הלקוח ללוג לפני מחיקה
            const { data: client } = await supabase.from('customers').select('full_name').eq('id', clientId).single();
            const name = client?.full_name ?? clientId;

            // בזכות הגדרת ה-ON DELETE CASCADE שבנינו ב-Supabase, מחיקת שורת האב
            // -- תמחק אוטומטית את: business_details, רשויות, payment_details, משימות ותתי-משימות בבת אחת!
            const { error: delErr } = await supabase.from('customers').delete().eq('id', clientId);
            if (delErr) throw delErr;

            await LogService.recordAction('customer.delete', 'customer', clientId, { name });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    },
};