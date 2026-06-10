// src/pages/Logs.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PersistenceAdapter } from '../services/PersistenceAdapter';

// הגדרת המבנה של רשומת לוג במערכת
interface LogEntry {
    id: string;
    createdAt: string | Date;
    actor: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    payload?: {
        changeSet?: Record<string, { old: any; new: any }>;
        after?: {
            id?: string;
            customerDetails?: {
                fullName?: string;
            };
        };
        [key: string]: any;
    } | null;
}

// הגדרת המבנה של פילטרים ביומן הפעולות
interface LogFilters {
    from: string;
    to: string;
    actor: string;
    entityType: string;
}


export default function Logs(): React.ReactElement {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<LogFilters>({
        from: '',
        to: '',
        actor: 'all',
        entityType: 'all',
    });

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchAllLogs(1000);
        if (error) console.error('[Logs] fetch failed:', error.message);
        setLogs((data as LogEntry[]) ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const actors = useMemo(
        () => [...new Set(logs.map(l => l.actor).filter(Boolean))].sort() as string[],
        [logs]
    );
    const entityTypes = useMemo(
        () => [...new Set(logs.map(l => l.entityType).filter(Boolean))].sort() as string[],
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

    const exportToExcel = (): void => {
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
        // התיקון בתוך פונקציית exportToExcel:
        XLSX.utils.book_append_sheet(wb, ws, 'Logs');
        XLSX.writeFile(wb, `logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const resetFilters = (): void => setFilters({ from: '', to: '', actor: 'all', entityType: 'all' });

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
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, from: e.target.value })}
                                className="input-style cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">עד תאריך</label>
                            <input
                                type="date"
                                value={filters.to}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, to: e.target.value })}
                                className="input-style cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 block mb-1">משתמש</label>
                            <select
                                value={filters.actor}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, actor: e.target.value })}
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
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilters({ ...filters, entityType: e.target.value })}
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
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>{[1,2,3,4,5].map(i => (
                                    <th key={i} className="p-4"><div className="h-3 bg-slate-200 rounded animate-pulse" /></th>
                                ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[1,2,3,4,5,6,7,8,9,10].map(i => (
                                    <tr key={i}>{[1,2,3,4,5].map(j => (
                                        <td key={j} className="p-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td>
                                    ))}</tr>
                                ))}
                            </tbody>
                        </table>
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
                                    <tr key={log.id} className="hover:bg-gray-50 transition">
                                        {/* עמודת תאריך מעוצבת לעברית */}
                                        <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">
                                            {new Date(log.createdAt).toLocaleString('he-IL')}
                                        </td>
                                        {/* עמודת שם המשתמש */}
                                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {log.actor}
                                        </td>
                                        {/* עמודת פעולה - שינוי קריטי 1: תרגום סוג הפעולה */}
                                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                {translateActionType(log.action)}
                                            </span>
                                        </td>
                                        <td className="p-4 whitespace-nowrap">
                                            {/* תרגום סוג הישות לעברית עם עיצוב נקי */}
                                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-semibold">
                                                {log.entityType === 'task' ? 'משימה' : log.entityType === 'customer' ? 'לקוח' : 'מערכת'}
                                            </span>

                                            {/* חילוץ שם אנושי מתוך ה-payload (כמו כותרת המשימה או שם הלקוח) במקום מזהה ה-UUID */}
                                            {log.entityType !== 'task' && (<span className="text-xs text-slate-500 block mt-1 max-w-[120px] truncate" title={log.payload?.title || log.payload?.name || ''}>
                                                {log.payload?.title || log.payload?.name || log.payload?.customerDetails?.fullName || '—'}
                                            </span>)}
                                        </td>
                                        <td className="p-4 max-w-md">
                                            <PayloadCell payload={log.payload} action={log.action} />
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

// הדבק את זה בסוף הקובץ, מחוץ לפונקציה של הקומפוננטה

const translateActionType = (action: string): string => {
    const mapping: Record<string, string> = {
        'customer.create': 'יצירת לקוח',
        'customer.update': 'עדכון לקוח',
        'customer.delete': 'מחיקת לקוח',
        'task.create': 'משימה חדשה',
        'task.update': 'עדכון משימה',
        'task.delete': 'מחיקת משימה',
        'subtask.update': 'עדכון תת-משימה'
    };
    return mapping[action] || action;
};

const formatLogDetails = (log: { action: string; payload: any }): React.ReactNode => {
    const { action, payload } = log;
    if (!payload) return 'אין פרטים';

    // 1. פעולות משימות ותתי-משימות
    if (action === 'task.update' || action === 'subtask.update') {
        if (payload.title) return `הכותרת שונתה ל: "${payload.title}"`;
        if (payload.status) {
            const statusMap: Record<string, string> = { 'pending': 'בהמתנה', 'in_progress': 'בטיפול', 'completed': 'הושלם' };
            return `הסטטוס שונה ל: ${statusMap[payload.status] || payload.status}`;
        }
        if (payload.subTasks && Array.isArray(payload.subTasks)) {
            return 'עודכנו תתי-משימות בתיק';
        }
    }

    // 2. פעולות לקוחות
    if (action === 'customer.create') {
        return `נוצר לקוח חדש: ${payload.customerDetails?.fullName || payload.full_name || ''}`;
    }
    if (action === 'customer.update') {
        return 'עודכנו פרטי הלקוח או תיקי הרשויות';
    }

    // ברירת מחדל אם המבנה לא מזוהה
    return payload.title || payload.name || 'עריכת נתונים כללית';
};

const PayloadCell: React.FC<{ payload: any; action: string }> = ({ payload, action }) => {
    if (!payload) return <span className="text-slate-300">—</span>;

    // א': טיפול ממוקד בשינויי ערכים (changeSet)
    if (payload.changeSet) {
        // אם מדובר בשינוי של תתי-משימות (כמו בצילום מסך שלך)
        if (payload.changeSet.subTasks) {
            const oldSubs = payload.changeSet.subTasks.old || [];
            const newSubs = payload.changeSet.subTasks.new || [];

            // מציאת תת-המשימה שהסטטוס שלה השתנה
            const changedSub = newSubs.find((ns: any) => {
                const os = oldSubs.find((o: any) => o.id === ns.id);
                return os ? os.completed !== ns.completed : false;
            });

            if (changedSub) {
                return (
                    <div className="text-sm font-medium text-slate-700">
                        <span className="text-slate-900 font-bold">"{changedSub.title}"</span> ⇐ {' '}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${changedSub.completed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {changedSub.completed ? 'בוצעה' : 'הוחזרה למצב פתוח'}
                        </span>
                    </div>
                );
            }
            return <span className="text-sm text-slate-600">עודכנו תתי-משימות בתיק</span>;
        }

        // שינויי שדות רגילים (כותרת, סטטוס, וכו')
        const entries = Object.entries(payload.changeSet).filter(([, value]: [string, any]) => {
            if (!value) return false;
            const oldVal = String(value.old || '').trim();
            const newVal = String(value.new || '').trim();
            // מציג רק אם החדש שונה מהישן, ואם הערך החדש הוא לא ריק
            return oldVal !== newVal && value.new !== undefined && value.new !== null && value.new !== '';
        });
        const fieldTranslations: Record<string, string> = {
            'status': 'סטטוס',
            'title': 'כותרת',
            'is_completed': 'הושלם',
            'full_name': 'שם מלא',
            'is_active': 'פעיל',
            'phone_number': 'טלפון',
            'address': 'כתובת',
            'email': 'אימייל'
        };

        return (
            <div className="space-y-0.5">
                {entries.map(([path, value]: [string, any]) => (
                    <div key={path} className="text-[12px] font-medium text-slate-700 flex items-center gap-1">
                        <span className="text-slate-500 font-bold">{fieldTranslations[path] || path}:</span>{' '}
                        <span className="text-red-500 bg-red-50 px-1 rounded line-through text-xs">{formatValue(value?.old)}</span>{' '}
                        {/* שימוש באות חץ פשוטה בתוך גוף ה-Flex מונע מהדפדפן להפוך אותה */}
                        <span className="text-slate-400">←</span>{' '}
                        <span className="text-green-600 bg-green-50 px-1 rounded text-xs">{formatValue(value?.new)}</span>
                    </div>
                ))}
            </div>
        );
    }

    // ב': שימוש במפענח המשפטים הכללי
    return (
        <span className="text-sm text-slate-700 font-medium">
            {formatLogDetails({ action, payload })}
        </span>
    );
};

const formatValue = (v: any): string => {
    if (v === null || v === undefined) return 'ריק';
    if (v === true || v === 'true') return 'בוצע';
    if (v === false || v === 'false') return 'פתוח';
    if (typeof v === 'string') {
        const statusMap: Record<string, string> = { 'pending': 'בהמתנה', 'in_progress': 'בטיפול', 'completed': 'הושלם' };
        if (statusMap[v]) return statusMap[v];
        return v.length > 25 ? v.slice(0, 25) + '…' : v;
    }
    return String(v);
};
