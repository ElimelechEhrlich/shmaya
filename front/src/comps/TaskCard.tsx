// src/comps/TaskCard.tsx
import React, { useState } from 'react';
import { TaskDetailsModal } from './TaskDetailsModal';
import { getChainPosition } from '../registries/CustomerRegistry';

// הגדרת המבנה של תת-משימה
interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  details?: Record<string, any>;
  comment?: string;
  restrictedTo?: string | null;
  dependsOn?: string | null;
  registryKey?: string | null;
}

// הגדרת המבנה של משימת אב
interface Task {
  id: string;
  title: string;
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
  onSubTaskToggle,
}: TaskCardProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const isLocked = false;

  return (
    <>
      <div className={`w-full overflow-hidden rounded-lg border border-slate-200 shadow-sm ${isLocked ? 'opacity-50' : 'bg-white'}`}>
        {/* כותרת משימת האב */}
        <div
          className="flex cursor-pointer items-center justify-between bg-slate-900 p-2.5 text-white"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="הצג נתוני הקמת תיק לקוח"
              onClick={(e) => {
                e.stopPropagation();
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-1 text-[10px] text-blue-400 transition hover:bg-slate-700"
            >
              📂 פרטי התיק
            </button>

            <div>
              <h3 className="text-sm font-bold">{task.title}</h3>
              <p className="text-[10px] text-slate-400">
                {task.subTasks.filter((st) => st.completed).length} / {task.subTasks.length} הושלמו
              </p>
            </div>
          </div>
          <span>{isOpen ? '▲' : '▼'}</span>
        </div>

        {/* רשימת תתי-משימות */}
        {isOpen && (
          <div className="space-y-1.5 bg-slate-50 p-2">
            {task.subTasks.map((sub) => {
              const dependency = sub.dependsOn
                ? task.subTasks.find((s) => s.registryKey === sub.dependsOn)
                : undefined;
              const isBlockedByDependency = !!dependency && !dependency.completed;
              const isSubLocked = !!sub.restrictedTo && currentUser !== sub.restrictedTo;
              const isSubDisabled = isLocked || isBlockedByDependency || (isSubLocked && !sub.completed);
              const chainPosition = getChainPosition(task.subTasks, sub);
              const detailsText = sub.details && Object.keys(sub.details).length > 0
                ? Object.entries(sub.details)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' | ')
                : null;

              return (
                <div
                  key={sub.id}
                  className={`flex min-h-[3rem] flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 ${sub.completed ? 'bg-green-50/60' : 'bg-white'}`}
                >
                  <div className="flex items-start gap-2">
                    <label
                      className={`mt-0.5 flex shrink-0 items-center ${isSubDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      title={isBlockedByDependency ? 'יש להשלים קודם את תת-המשימה הקודמת בשרשרת' : isSubLocked ? `מוגבל ל-${sub.restrictedTo}` : undefined}
                    >
                      <input
                        type="checkbox"
                        disabled={isSubDisabled}
                        checked={sub.completed}
                        onChange={() => onSubTaskToggle(task.id, sub.id)}
                        className="peer sr-only"
                      />
                      <span className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition-all duration-200 ${isSubDisabled ? 'opacity-50' : 'hover:border-slate-400'}`}>
                        {chainPosition?.hasPrev && <span className="absolute -top-3 right-1/2 w-px h-3 translate-x-1/2 bg-slate-300" />}
                        {chainPosition?.hasNext && <span className="absolute -bottom-3 right-1/2 w-px h-3 translate-x-1/2 bg-slate-300" />}
                        <span className="peer-checked:hidden text-[10px] font-black text-slate-400">
                          {chainPosition ? chainPosition.position : ''}
                        </span>
                        <span className="hidden text-[11px] font-black text-white peer-checked:inline">✓</span>
                      </span>
                    </label>

                    <span className={`text-sm leading-5 ${sub.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {sub.title}
                    </span>
                  </div>

                  {detailsText && (
                    <div className="w-full rounded-md bg-slate-100 px-2 py-1 text-[10px] leading-4 text-slate-600">
                      {detailsText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaskDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        task={task}
      />
    </>
  );
}