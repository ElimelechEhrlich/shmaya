import React from 'react';
import { PRIORITY_LEVELS, PRIORITY_STYLES } from '../registries/CustomerRegistry';

type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

interface PriorityBadgeProps {
    priority: string | undefined;
    onChange: (priority: string) => void;
}

const PriorityBadge: React.FC<PriorityBadgeProps> = React.memo(({ priority, onChange }) => {
    const p = (priority && PRIORITY_STYLES[priority as PriorityLevel] ? priority : 'medium') as PriorityLevel;
    const style = PRIORITY_STYLES[p];

    return (
        <div className="relative inline-flex items-center">
            <select
                value={p}
                onChange={(e) => onChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                title={`עדיפות: ${style?.label || p}`}
                className={`cursor-pointer ${style?.bg || 'bg-slate-50'} ${style?.text || 'text-slate-700'} ${style?.border || 'border-slate-200'} border h-5 pr-1.5 pl-4 py-0 rounded-full text-[9px] leading-none font-black uppercase tracking-wider appearance-none transition bg-no-repeat`}
                style={{
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath d='M5 7l5 6 5-6H5z'/%3E%3C/svg%3E\")",
                    backgroundPosition: 'left 0.15rem center',
                    backgroundSize: '0.85rem 0.85rem',
                }}
            >
                {PRIORITY_LEVELS.map((lv: string) => (
                    <option key={lv} value={lv}>
                        {PRIORITY_STYLES[lv as PriorityLevel]?.label || lv}
                    </option>
                ))}
            </select>
        </div>
    );
});

export default PriorityBadge;
