// src/comps/TaskCard.tsx
import React, { useState } from 'react';

// הגדרת המבנה של תת-משימה
interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  details?: Record<string, any>;
  comment?: string;
}

// הגדרת המבנה של משימת אב
interface Task {
  id: string;
  title: string;
  restrictedTo?: string | null;
  subTasks: SubTask[];
  status?: string;
  priority?: string;
}

// הגדרת הפרופס של הקומפוננטה
interface TaskCardProps {
  task: Task;
  currentUser: string;
  onSubTaskToggle: (taskId: string, subTaskId: string) => void;
}

export default function TaskCard({ 
  task, 
  currentUser, 
  onSubTaskToggle 
}: TaskCardProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  
  // הגנה קלה: המרה לבוליאני מוחלט כדי למנוע ערכי undefined בהשוואה
  const isLocked = !!task.restrictedTo && currentUser !== task.restrictedTo;

  return (
    <div className={`w-full border rounded-xl mb-4 overflow-hidden shadow-sm ${isLocked ? 'opacity-50' : 'bg-white'}`}>
      {/* כותרת משימת האב */}
      <div 
        className="p-4 bg-slate-900 text-white flex justify-between items-center cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <h3 className="font-bold">{task.title}</h3>
          <p className="text-xs text-slate-400">
            {task.subTasks.filter(st => st.completed).length} / {task.subTasks.length} הושלמו
          </p>
        </div>
        <span>{isOpen ? '▲' : '▼'}</span>
      </div>

      {/* רשימת תתי-משימות */}
      {isOpen && (
        <div className="p-4 bg-slate-50 space-y-3">
          {task.subTasks.map(sub => (
            <div key={sub.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  disabled={isLocked}
                  checked={sub.completed}
                  onChange={() => onSubTaskToggle(task.id, sub.id)}
                  className="w-5 h-5 accent-blue-600"
                />
                <span className={sub.completed ? 'line-through text-slate-400' : 'text-slate-800'}>
                  {sub.title}
                </span>
              </div>
              
              {/* פרטים ספציפיים לתת-משימה */}
              {sub.details && Object.keys(sub.details).length > 0 && (
                <div className="text-[10px] text-slate-500 bg-slate-100 p-1 rounded">
                  {Object.entries(sub.details).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                </div>
              )}
            </div>
          ))}
          
          {isLocked && (
            <p className="text-xs text-amber-600 font-bold mt-2 text-center italic">
              🔒 משימה זו חסומה לאישור של {task.restrictedTo} בלבד
            </p>
          )}
        </div>
      )}
    </div>
  );
}