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
                className={`cursor-pointer ${style?.bg || 'bg-slate-50'} ${style?.text || 'text-slate-700'} ${style?.border || 'border-slate-200'} border h-5 px-1.5 py-0 rounded-full text-[9px] leading-none font-black uppercase tracking-wider appearance-none transition`}
                style={{ backgroundImage: 'none' }}
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
