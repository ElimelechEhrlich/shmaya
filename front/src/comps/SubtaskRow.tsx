// src/comps/SubtaskRow.tsx
import React, { useState } from 'react';
import PriorityBadge from './PriorityBadge';
import { CATEGORY_ACCENT_COLORS } from '../constants/taskRegistry';

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
    onDelete?: (row: SubtaskViewRow) => void;
}

const SubtaskRow: React.FC<SubtaskRowProps> = React.memo(({
    row,
    onToggle,
    onSaveTitle,
    onEditClick,
    onPriorityChange,
    onDelete,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(row.subtaskTitle);

    const handleSave = () => {
        setEditing(false);
        onSaveTitle(row, draft);
    };

    const accentBg = CATEGORY_ACCENT_COLORS[row.parentTaskId || ''] ?? 'bg-slate-200';

    return (
        <div className={`relative flex items-center gap-3 pr-6 pl-4 py-3 transition-colors duration-100 ${
            row.completed ? 'bg-green-50/40' : 'hover:bg-slate-50/70'
        }`}>

            {/* category accent strip — 3px on the right (RTL start) */}
            <div className={`absolute inset-y-0 right-0 w-0.75 ${accentBg} opacity-70`} />

            {/* Styled checkbox — peer pattern */}
            <label className="cursor-pointer flex items-center shrink-0">
                <input
                    type="checkbox"
                    checked={row.completed}
                    onChange={(e) => onToggle(row, e.target.checked)}
                    className="peer sr-only"
                />
                <span className="w-5 h-5 rounded-full border-2 border-slate-300
                                 peer-checked:border-blue-500 peer-checked:bg-blue-500
                                 transition-all duration-200 flex items-center justify-center
                                 text-transparent peer-checked:text-white text-[11px] font-black
                                 hover:border-slate-400 shrink-0 select-none">
                    ✓
                </span>
            </label>

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
                        <span className={`text-sm font-medium truncate ${
                            row.completed ? 'line-through text-slate-400' : 'text-slate-800'
                        }`}>
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
                        {onDelete && !row.parentTaskId && (
                            <button
                                type="button"
                                onClick={() => onDelete(row)}
                                title="מחק משימה ידנית"
                                className="cursor-pointer text-slate-300 hover:text-red-500 text-sm px-1 shrink-0 transition-colors"
                            >
                                🗑
                            </button>
                        )}
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
