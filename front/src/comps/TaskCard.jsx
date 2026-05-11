import { useState } from 'react';

export default function  TaskCard ({ task, currentUser, onSubTaskToggle }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLocked = task.restrictedTo && currentUser !== task.restrictedTo;

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
              {sub.details && (
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
};