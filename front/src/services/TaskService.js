// services/TaskService.js
import { AUTO_TASKS_CONFIG } from '../constants/taskRegistry';

export class TaskGeneratorService {
    // פונקציה לייצור משימות
    static generateForCustomer(customerData) {
        return AUTO_TASKS_CONFIG
            .filter(parentTask => !parentTask.condition || parentTask.condition(customerData))
            .map(parentTask => ({
                id: crypto.randomUUID(),
                title: parentTask.title,
                restrictedTo: parentTask.restrictedTo || null,
                subTasks: parentTask.subTasks
                    .filter(sub => !sub.condition || sub.condition(customerData))
                    .map(sub => ({
                        id: sub.id,
                        title: sub.title,
                        completed: false,
                        details: sub.getDetails ? sub.getDetails(customerData) : {}
                    }))
            }));
    }

    /**
     * בודק האם לקוח סיים את תהליך הניהול הסופי
     * @param {Array} tasks - רשימת המשימות של הלקוח
     */
    static isCustomerFinalized(tasks) {
        if (!tasks || tasks.length === 0) return false;
        
        // some מחזיר true אם לפחות איבר אחד עונה על התנאי
        return tasks.some(t => 
            (t.title.includes("אישור ניהול סופי") || t.title.includes("פתיחת תיק סופית")) 
            && t.status === 'completed'
        );
    }

    /**
     * מחשב אחוז התקדמות כללי ללקוח
     * @param {Array} tasks - רשימת המשימות של הלקוח
     */
    static calculateProgress(tasks) {
        if (!tasks || tasks.length === 0) return 0;
        
        const completed = tasks.filter(t => t.status === 'completed').length;
        return Math.round((completed / tasks.length) * 100);
    }
} // סגירת ה-Class