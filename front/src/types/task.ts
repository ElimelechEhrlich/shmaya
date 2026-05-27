// --- טיפוסי משימות ---
export interface SubtaskViewRow {
    taskId: string;    //    -- ה-id של ה-parent_task
    subtaskId: string;   //  -- ה-id של ה-sub_task
    subtaskTitle: string;  
    parentTitle: string;   
    clientId: string | null;
    customerName?: string;
    priority: 'low' | 'medium' | 'high';
    completed: boolean;
    comment: string;
    taskStatus: 'pending' | 'completed';
}

export interface ModalSubTask {
    id: string;
    title: string;
    completed: boolean;
    comment: string;
}