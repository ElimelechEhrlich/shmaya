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
}) => {
    const navigate = useNavigate();
    const openCount = rows.filter(r => !r.completed).length;

    return (
        <div className="card-base mb-3">

            {/* ─── Header ─── */}
            <button
                type="button"
                onClick={() => onToggle(clientId)}
                className="w-full flex items-center gap-3 p-4 text-right"
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

                <span className="text-xs text-slate-400 font-medium">
                    {rows.length} משימות · {openCount} פתוחות
                </span>

                <span className="mr-auto text-slate-400 text-xs">
                    {isOpen ? '▴' : '▾'}
                </span>
            </button>

            {/* ─── Body ─── */}
            {isOpen && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {rows.map(row => (
                        <SubtaskRow
                            key={`${row.taskId}-${row.subtaskId ?? 'parent'}`}
                            row={row}
                            onToggle={onRowToggle}
                            onSaveTitle={onSaveTitle}
                            onEditClick={onEditClick}
                            onPriorityChange={onPriorityChange}
                        />
                    ))}
                </div>
            )}

        </div>
    );
});

CustomerAccordion.displayName = 'CustomerAccordion';
export default CustomerAccordion;
