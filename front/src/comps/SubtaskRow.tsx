// src/comps/SubtaskRow.tsx
import React, { useState } from 'react';
import PriorityBadge from './PriorityBadge';

export interface SubtaskViewRow {
    taskId: string;
    subtaskId: string | null;
    subtaskTitle: string;
    parentTaskId: string | null;
    parentTitle: string | null;
    clientId: string | null;
    customerName: string | null;
    completed: boolean;
    priority: 'low' | 'medium' | 'high' | 'critical';
    comment?: string | null;
    taskStatus?: 'pending' | 'completed';
}

interface SubtaskRowProps {
    row: SubtaskViewRow;
    onToggle: (row: SubtaskViewRow, completed: boolean) => void;
    onSaveTitle: (row: SubtaskViewRow, title: string) => void;
    onEditClick: (row: SubtaskViewRow) => void;
    onPriorityChange: (row: SubtaskViewRow, priority: string) => void;
}

const SubtaskRow: React.FC<SubtaskRowProps> = React.memo(({
    row,
    onToggle,
    onSaveTitle,
    onEditClick,
    onPriorityChange,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(row.subtaskTitle);

    const handleSave = () => {
        setEditing(false);
        onSaveTitle(row, draft);
    };

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 transition ${
                row.completed ? 'bg-green-50/40' : 'hover:bg-slate-50/60'
            }`}
        >
            {/* Checkbox */}
            <input
                type="checkbox"
                checked={row.completed}
                onChange={(e) => onToggle(row, e.target.checked)}
                className="cursor-pointer w-5 h-5 accent-blue-600 shrink-0"
            />

            {/* Title area */}
            <div className="flex-1 min-w-0">
                {editing ? (
                    <div className="flex items-center gap-2">
                        <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave();
                                if (e.key === 'Escape') { setDraft(row.subtaskTitle); setEditing(false); }
                            }}
                            className="input-style flex-1 text-sm"
                        />
                        <button
                            type="button"
                            onClick={handleSave}
                            title="שמור"
                            className="cursor-pointer text-green-600 hover:text-green-800 text-lg"
                        >
                            💾
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className={`text-sm font-medium truncate ${
                                row.completed ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                        >
                            {row.subtaskTitle}
                        </span>
                        {row.parentTitle && row.parentTitle !== row.subtaskTitle && (
                            <span className="text-[10px] text-slate-400 shrink-0">
                                · {row.parentTitle}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => onEditClick(row)}
                            title="עריכת משימה מלאה"
                            className="cursor-pointer text-slate-300 hover:text-blue-600 text-sm font-bold px-1 shrink-0"
                        >
                            ✎
                        </button>
                    </div>
                )}
                {row.comment && (
                    <div className="text-[11px] text-blue-600 italic mt-0.5">💬 {row.comment}</div>
                )}
            </div>

            {/* Priority */}
            <div className="shrink-0">
                <PriorityBadge priority={row.priority} onChange={(priority) => onPriorityChange(row, priority)} />
            </div>
        </div>
    );
});

SubtaskRow.displayName = 'SubtaskRow';
export default SubtaskRow;
