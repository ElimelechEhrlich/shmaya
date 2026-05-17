import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PersistenceAdapter } from '../services/PersistenceAdapter.ts';

/**
 * Activity log viewer + Excel export.
 * All DB I/O via PersistenceAdapter; snake_case columns (created_at,
 * entity_type, entity_id) are translated by the adapter.
 */
export default function Logs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        from: '',
        to: '',
        actor: 'all',
        entityType: 'all',
    });

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchAllLogs(1000);
        if (error) console.error('[Logs] fetch failed:', error.message);
        setLogs(data ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const actors = useMemo(
        () => [...new Set(logs.map(l => l.actor).filter(Boolean))].sort(),
        [logs]
    );
    const entityTypes = useMemo(
        () => [...new Set(logs.map(l => l.entityType).filter(Boolean))].sort(),
        [logs]
    );

    const filtered = useMemo(() => logs.filter(l => {
        if (filters.actor !== 'all' && l.actor !== filters.actor) return false;
        if (filters.entityType !== 'all' && l.entityType !== filters.entityType) return false;
        if (filters.from) {
            const fromTs = new Date(filters.from).getTime();
            if (new Date(l.createdAt).getTime() < fromTs) return false;
        }
        if (filters.to) {
            const toTs = new Date(filters.to).getTime() + 24 * 60 * 60 * 1000;
            if (new Date(l.createdAt).getTime() > toTs) return false;
        }
        return true;
    }), [logs, filters]);

    const exportToExcel = () => {
        const rows = filtered.map(l => ({
            'תאריך': new Date(l.createdAt).toLocaleString('he-IL'),
            'משתמש': l.actor ?? '',
            'פעולה': l.action ?? '',
            'סוג ישות': l.entityType ?? '',
            'מזהה ישות': l.entityId ?? '',
            'נתונים': JSON.stringify(l.payload ?? {}),
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 38 }, { wch: 80 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Logs');
        XLSX.writeFile(wb, `logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const resetFilters = () => setFilters({ from: '', to: '', actor: 'all', entityType: 'all' });

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">יומן פעולות</h1>
                        <p className="text-sm text-slate-500 mt-1">היסטוריית שינויים במערכת</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={load}
                            disabled={loading}
                            className="cursor-pointer text-slate-500 hover:text-slate-800 font-bold text-sm py-2 px-3 rounded-lg transition disabled:opacity-50"
                            title="רענון"
                        >
                            ↻ רענן
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={filtered.length === 0}
                            className="cursor-pointer bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition"
                        >
                            <span>📥</span> ייצוא ל-Excel
                        </button>
                    </div>
                </div>

                {/* Filter bar */}
                <div className="card-base p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">מתאריך</label>
                            <input
                                type="date"
                                value={filters.from}
                                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                                className="input-style cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">עד תאריך</label>
                            <input
                                type="date"
                                value={filters.to}
                                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                                className="input-style cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">משתמש</label>
                            <select
                                value={filters.actor}
                                onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
                                className="input-style cursor-pointer"
                            >
                                <option value="all">כל המשתמשים</option>
                                {actors.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">סוג ישות</label>
                            <select
                                value={filters.entityType}
                                onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
                                className="input-style cursor-pointer"
                            >
                                <option value="all">הכל</option>
                                {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <button
                            onClick={resetFilters}
                            className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold py-2 transition"
                        >
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                <div className="text-sm text-slate-500 mb-3 font-medium">
                    מציג {filtered.length} מתוך {logs.length} רשומות
                </div>

                <div className="card-base overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center font-bold text-slate-400">טוען...</div>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 italic">לא נמצאו פעולות תואמות.</div>
                    ) : (
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">תאריך</th>
                                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">משתמש</th>
                                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">פעולה</th>
                                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">ישות</th>
                                    <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider">נתונים</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map(log => (
                                    <tr key={log.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 text-xs font-mono text-slate-500">
                                            {new Date(log.createdAt).toLocaleString('he-IL')}
                                        </td>
                                        <td className="p-4 text-sm font-medium text-slate-800">{log.actor}</td>
                                        <td className="p-4 text-sm text-slate-700">{log.action}</td>
                                        <td className="p-4">
                                            <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-mono">
                                                {log.entityType}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono block mt-1">
                                                {log.entityId ? `${log.entityId.slice(0, 8)}…` : '—'}
                                            </span>
                                        </td>
                                        <td className="p-4 max-w-md">
                                            <PayloadCell payload={log.payload} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

const PayloadCell = ({ payload }) => {
    if (!payload) return <span className="text-slate-300">—</span>;
    if (payload.changeSet) {
        const entries = Object.entries(payload.changeSet);
        return (
            <div className="space-y-0.5">
                {entries.slice(0, 3).map(([path, { old, new: nu }]) => (
                    <div key={path} className="text-[11px] font-mono">
                        <span className="text-slate-500">{path}:</span>{' '}
                        <span className="text-red-600 line-through">{formatValue(old)}</span>{' '}
                        <span className="text-slate-400">→</span>{' '}
                        <span className="text-green-700">{formatValue(nu)}</span>
                    </div>
                ))}
                {entries.length > 3 && (
                    <div className="text-[10px] text-slate-400 italic">+ עוד {entries.length - 3} שינויים</div>
                )}
            </div>
        );
    }
    if (payload.after) {
        const name = payload.after.customerDetails?.fullName || payload.after.id || 'יצירה חדשה';
        return <span className="text-xs text-slate-700">📌 {name}</span>;
    }
    return (
        <span className="text-[11px] text-slate-500 font-mono">
            {JSON.stringify(payload).slice(0, 80)}…
        </span>
    );
};

const formatValue = (v) => {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'string') return v.length > 18 ? v.slice(0, 18) + '…' : v;
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 18) + '…';
    return String(v);
};
