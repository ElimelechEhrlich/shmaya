import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const TaskManager = ({ tasks, onTaskUpdate }) => {
    const [expandedTaskId, setExpandedTaskId] = useState(null);
    const [editingDetails, setEditingDetails] = useState({});

    const toggleTask = (taskId, currentStatus) => {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        updateTaskInDB(taskId, { status: newStatus });
    };

    const updateTaskInDB = async (taskId, updates) => {
        const { error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', taskId);

        if (!error) onTaskUpdate(); // רענון הנתונים ב"אבא"
    };

    return (
        <div className="space-y-4">
            {tasks?.map(task => (
                <div key={task.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                    {/* שורת המשימה הראשית */}
                    <div className={`p-4 flex items-center justify-between cursor-pointer ${task.status === 'completed' ? 'bg-green-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3 flex-1" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}>
                            <span className="text-xl">{expandedTaskId === task.id ? '▼' : '◀'}</span>
                            <span className={`font-bold ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {task.title}
                            </span>
                        </div>
                        
                        <button 
                            onClick={() => toggleTask(task.id, task.status)}
                            className={`px-4 py-1 rounded-full text-xs font-bold transition-all ${
                                task.status === 'completed' ? 'bg-green-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white'
                            }`}
                        >
                            {task.status === 'completed' ? 'בוצע ✓' : 'סמן כבוצע'}
                        </button>
                    </div>

                    {/* תוכן מורחב (Details) */}
                    {expandedTaskId === task.id && (
                        <div className="p-4 bg-gray-50 border-t space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">פרטי משימה / הערות:</label>
                                <textarea 
                                    className="w-full p-3 border rounded-lg text-sm"
                                    rows="3"
                                    defaultValue={JSON.stringify(task.details, null, 2)}
                                    onChange={(e) => setEditingDetails({ ...editingDetails, [task.id]: e.target.value })}
                                />
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400 text-left">משימה נוצרה: {new Date(task.created_at).toLocaleDateString('he-IL')}</span>
                                <button 
                                    onClick={() => {
                                        try {
                                            const jsonDetails = JSON.parse(editingDetails[task.id]);
                                            updateTaskInDB(task.id, { details: jsonDetails });
                                            alert("נשמר בהצלחה");
                                        } catch (e) {
                                            alert("שגיאה: הפורמט חייב להיות JSON תקין");
                                        }
                                    }}
                                    className="bg-gray-800 text-white px-4 py-1 rounded text-xs hover:bg-black"
                                >
                                    שמור שינויים במשימה
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default TaskManager;