import React from 'react';

/**
 * Visual progress bar with dynamic color thresholds.
 *   <30%   → orange
 *   30–70% → blue
 *   >70%   → green
 *
 * Feeds off the percent value from Registry.calculateWeightedProgress so the
 * visual semantics stay aligned with the subtask-weighted calculation.
 */
export default function ProgressBar({ percent, size = 'md', showLabel = true, label }) {
    const clamped = Math.min(100, Math.max(0, Math.round(percent ?? 0)));
    const tier =
        clamped < 30 ? 'low' :
        clamped <= 70 ? 'mid' :
        'high';

    const fillClass =
        tier === 'low'  ? 'bg-orange-500' :
        tier === 'mid'  ? 'bg-blue-600'   :
                          'bg-green-600';

    const textClass =
        tier === 'low'  ? 'text-orange-600' :
        tier === 'mid'  ? 'text-blue-700'   :
                          'text-green-700';

    const heightClass = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-3';

    const labelText = label ?? `${clamped}% הושלם`;

    return (
        <div className="flex items-center gap-3 w-full" dir="rtl">
            <div className={`flex-1 ${heightClass} bg-slate-100 rounded-full overflow-hidden border border-slate-200`}>
                <div
                    role="progressbar"
                    aria-valuenow={clamped}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className={`h-full ${fillClass} transition-all duration-500 ease-out`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
            {showLabel && (
                <span className={`text-xs font-bold whitespace-nowrap ${textClass}`}>
                    {labelText}
                </span>
            )}
        </div>
    );
}
