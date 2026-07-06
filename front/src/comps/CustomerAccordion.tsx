// src/comps/CustomerAccordion.tsx
import React from 'react';
import { useNavigate } from 'react-router';
import { OFFICE_CUSTOMER_ID } from '../services/PersistenceAdapter';
import SubtaskRow, { type SubtaskViewRow } from './SubtaskRow';

interface CustomerAccordionProps {
    clientId: string;
    clientName: string;
    rows: SubtaskViewRow[];
    isOpen: boolean;
    onToggle: (clientId: string) => void;
    // callbacks stable (useCallback in Tasks.tsx) — passed directly to SubtaskRow
    onRowToggle: (row: SubtaskViewRow, completed: boolean) => void;
    onSaveTitle: (row: SubtaskViewRow, title: string) => void;
    onEditClick: (row: SubtaskViewRow) => void;
    onPriorityChange: (row: SubtaskViewRow, priority: string) => void;
    onDelete?: (row: SubtaskViewRow) => void;
    comments?: string;
}

function getAccordionAccentBg(openCount: number): string {
    if (openCount === 0) return 'bg-slate-200';
    if (openCount <= 3)  return 'bg-blue-300';
    if (openCount <= 7)  return 'bg-blue-500';
    return 'bg-amber-400';
}

const CustomerAccordion: React.FC<CustomerAccordionProps> = React.memo(({
    clientId,
    clientName,
    rows,
    isOpen,
    onToggle,
    onRowToggle,
    onSaveTitle,
    onEditClick,
    onPriorityChange,
    onDelete,
    comments,
}) => {
    const navigate = useNavigate();
    const openCount = rows.filter(r => !r.completed).length;
    const accentBg = getAccordionAccentBg(openCount);

    return (
        <div className="card-base mb-3 overflow-hidden relative">

            {/* accent strip — 4px on the right (RTL start) */}
            <div className={`absolute inset-y-0 right-0 w-1 ${accentBg} transition-colors duration-300`} />

            {/* ─── Header ─── */}
            <button
                type="button"
                onClick={() => onToggle(clientId)}
                className="w-full flex items-center gap-3 pr-6 pl-4 py-3.5 text-right
                           bg-linear-to-b from-white to-slate-50/80
                           hover:from-slate-50 hover:to-slate-100/60 hover:shadow-sm
                           transition-all duration-150"
            >
                <span className="font-bold text-slate-800">{clientName}</span>

                {clientId !== OFFICE_CUSTOMER_ID && (
                    <a
                        role="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/customers/${clientId}`); }}
                        title="פתח תיק לקוח"
                        className="cursor-pointer text-slate-400 hover:text-blue-600 transition text-sm leading-none"
                    >
                        ⧉
                    </a>
                )}

                <div className="flex items-center gap-1.5">
                    <span className="bg-slate-100 text-slate-500 text-[11px] px-2 py-0.5 rounded-full font-medium">
                        {rows.length} משימות
                    </span>
                    {openCount > 0 && (
                        <span className="bg-blue-50 text-blue-600 text-[11px] px-2 py-0.5 rounded-full font-semibold">
                            {openCount} פתוחות
                        </span>
                    )}
                </div>

                <span className={`mr-auto text-slate-400 text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                    ▾
                </span>
            </button>

            {/* ─── Body ─── */}
            {isOpen && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {comments && (
    <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-[12px] text-blue-700">
        📋 {comments}
    </div>
)}
                    {rows.map(row => (
                        <SubtaskRow
                            key={`${row.taskId}-${row.subtaskId ?? 'parent'}`}
                            row={row}
                            onToggle={onRowToggle}
                            onSaveTitle={onSaveTitle}
                            onEditClick={onEditClick}
                            onPriorityChange={onPriorityChange}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}

        </div>
    );
});

CustomerAccordion.displayName = 'CustomerAccordion';
export default CustomerAccordion;
