// src/comps/ContrealTasksSection.tsx
//
// משימות מקונטריל בדשבורד.
//  - מנהל (CONTREAL_MANAGERS): כל המשימות, מקובצות לפי העובד המשויך בקונטריל, כולל "לא משויך".
//  - עובד: רק המשימות שמשויכות אליו (contreal_user_map → contreal_task_link.assigned_to).
// בשמעיה אפשר רק לסמן בוצע/לא בוצע; כותרת, תאריך, שיוך וכו' משתנים בקונטריל בלבד.
// הסימון נשמר דרך updateSubtaskStatus הקיים, ואז נדחף לקונטריל (push_status). דחיפה שנכשלה
// מוצגת כאזהרה בשורה, והסנכרון הבא ינסה שוב.
// אם טבלאות קונטריל עוד לא קיימות (מיגרציה 0027 לא הורצה) — האזור לא מוצג בכלל.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    PersistenceAdapter,
    type ContrealConnectionStatus,
    type ContrealSyncResult,
    type ContrealTaskRow,
} from '../services/PersistenceAdapter';
import { authService } from '../services/authService';
import { formatContrealDateTime, formatContrealDeadline, type DeadlineTone } from '../utils/formatContrealDeadline';

const UNASSIGNED = 'לא משויך';

const TONE_STYLES: Record<DeadlineTone, string> = {
    overdue: 'bg-red-50 text-red-700 border-red-200',
    today: 'bg-orange-50 text-orange-700 border-orange-200',
    soon: 'bg-amber-50 text-amber-700 border-amber-200',
    normal: 'bg-slate-50 text-slate-600 border-slate-200',
};

// סטטוסים שלא צריך להציג כתגית (ברירת המחדל הפתוחה, והסגור — שממילא מסומן ב-✓)
const QUIET_STATUSES = new Set(['לביצוע', 'הושלם']);

export default function ContrealTasksSection(): React.ReactElement | null {
    const currentUser = authService.getCurrentUser();
    const isManager = authService.isContrealManager();

    const [rows, setRows] = useState<ContrealTaskRow[] | null>(null);
    // null = עוד לא ידוע אם טבלאות קונטריל קיימות; עד אז לא מציגים כלום (בלי הבהוב)
    const [available, setAvailable] = useState<boolean | null>(null);
    const [loadError, setLoadError] = useState(false);
    const [connection, setConnection] = useState<ContrealConnectionStatus | 'unknown'>('unknown');
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
    const [showOpenOnly, setShowOpenOnly] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<ContrealSyncResult | null>(null);
    const [detailsFor, setDetailsFor] = useState<ContrealTaskRow | null>(null);
    // תוצאת ההתחברות: ה-callback של הפונקציה מפנה לדשבורד עם ?contreal=connected / ?error=...
    const [connectNotice] = useState<'connected' | 'error' | null>(() => {
        const q = new URLSearchParams(window.location.search);
        if (q.get('contreal') === 'connected') return 'connected';
        if (q.has('error')) return 'error';
        return null;
    });
    useEffect(() => {
        if (!connectNotice) return;
        // מנקים את הפרמטרים מהכתובת כדי שההודעה לא תחזור ברענון
        window.history.replaceState(null, '', window.location.pathname);
    }, [connectNotice]);

    const loadRows = useCallback(async () => {
        const { data, error } = await PersistenceAdapter.fetchContrealTasks(isManager ? null : currentUser);
        if (error) {
            // הטבלה עוד לא קיימת → קונטריל לא הוגדר. מסתירים את האזור במקום להציג שגיאה.
            if (/contreal_task_link|does not exist|schema cache/i.test(error.message)) setAvailable(false);
            else { console.error('[ContrealTasksSection] fetchContrealTasks:', error); setAvailable(true); setLoadError(true); }
            return;
        }
        setAvailable(true);
        setLoadError(false);
        setRows(data ?? []);
    }, [isManager, currentUser]);

    const loadStatus = useCallback(async () => {
        const { data, error } = await PersistenceAdapter.fetchContrealStatus();
        if (error || !data?.ok) { setConnection('unknown'); return; }
        setConnection(data.status);
        setLastSyncedAt(data.lastSyncedAt);
    }, []);

    useEffect(() => {
        // הטעינה אסינכרונית: ה-state מתעדכן רק אחרי שהתשובה מגיעה, לא באופן סינכרוני באפקט
        Promise.resolve().then(() => Promise.all([loadRows(), loadStatus()]));
    }, [loadRows, loadStatus]);

    // הסנכרון האוטומטי (כל 5 דקות, pg_cron) רץ בשרת; כאן רק מרעננים את התצוגה כל דקה,
    // כשהלשונית גלויה ואין סנכרון ידני באמצע — כך שינוי מקונטריל מופיע בלי לרענן את הדף.
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'visible' || syncing) return;
            loadRows();
            loadStatus();
        }, 60_000);
        return () => window.clearInterval(timer);
    }, [loadRows, loadStatus, syncing]);

    const handleSync = useCallback(async () => {
        setSyncing(true);
        setSyncResult(null);
        const { data, error } = await PersistenceAdapter.syncContreal();
        setSyncing(false);
        if (error) { setSyncResult({ ok: false, error: error.message }); return; }
        setSyncResult(data);
        if (data?.error === 'not_connected') setConnection('none');
        await Promise.all([loadRows(), loadStatus()]);
        if (data?.ok) {
            await PersistenceAdapter.insertLog(
                // entity_id הוא uuid שמאפשר NULL; לסנכרון אין ישות אחת
                currentUser ?? 'unknown', 'סנכרון קונטריל', 'system', null as unknown as string,
                `נוספו ${data.created ?? 0}, נסגרו ${data.completedFromContreal ?? 0}, נפתחו ${data.reopenedFromContreal ?? 0}, נדחפו ${data.pushed ?? 0}, נמחקו ${data.deleted ?? 0}`,
            ).catch(() => {});
        }
    }, [loadRows, loadStatus, currentUser]);

    const handleToggle = useCallback(async (row: ContrealTaskRow, completed: boolean) => {
        setRows(prev => prev?.map(r => r.subtaskId === row.subtaskId ? { ...r, completed, pushError: null } : r) ?? null);
        const { error } = await PersistenceAdapter.updateSubtaskStatus(row.taskId, row.subtaskId, completed);
        if (error) {
            console.error('[ContrealTasksSection] updateSubtaskStatus:', error);
            await loadRows();
            return;
        }
        const { data: pushed, error: pushErr } = await PersistenceAdapter.pushContrealStatus(row.subtaskId);
        if (pushErr || !pushed?.ok) {
            console.error('[ContrealTasksSection] push to Contreal failed:', pushErr ?? pushed?.error);
            await PersistenceAdapter.insertLog(
                currentUser ?? 'unknown', 'דחיפה לקונטריל נכשלה', 'task', row.subtaskId,
                `${row.title} — ${pushErr?.message ?? pushed?.error ?? ''}`,
            ).catch(() => {});
            // push_error נשמר בטבלה ע"י הפונקציה; כשל ברשת לפני שהגענו אליה — מציגים מקומית
            setRows(prev => prev?.map(r => r.subtaskId === row.subtaskId
                ? { ...r, pushError: pushErr?.message ?? pushed?.error ?? 'הדחיפה לקונטריל נכשלה' } : r) ?? null);
        }
    }, [loadRows, currentUser]);

    // משימה שסומנה כבוצעה אבל העדכון לא הגיע לקונטריל נשארת גלויה גם במצב "רק פתוחות",
    // אחרת האזהרה (⚠️) נעלמת יחד עם השורה והמשתמש לא יודע שקונטריל לא עודכן.
    const visibleRows = useMemo(
        () => (rows ?? []).filter(r => !showOpenOnly || !r.completed || !!r.pushError),
        [rows, showOpenOnly],
    );

    // מנהל: קיבוץ לפי עובד. משימה עם כמה עובדים מופיעה אצל כל אחד מהם.
    const groups = useMemo(() => {
        if (!isManager) return null;
        const map = new Map<string, ContrealTaskRow[]>();
        for (const r of visibleRows) {
            const names = r.assignees.length > 0 ? r.assignees.map(a => a.name) : [UNASSIGNED];
            for (const n of names) map.set(n, [...(map.get(n) ?? []), r]);
        }
        const openCount = new Map<string, number>();
        for (const r of rows ?? []) {
            if (r.completed) continue;
            const names = r.assignees.length > 0 ? r.assignees.map(a => a.name) : [UNASSIGNED];
            for (const n of names) openCount.set(n, (openCount.get(n) ?? 0) + 1);
        }
        return [...map.entries()]
            .sort(([a], [b]) => a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b, 'he'))
            .map(([name, list]) => ({ name, list, open: openCount.get(name) ?? 0 }));
    }, [isManager, visibleRows, rows]);

    if (available !== true) return null;

    const notConnected = connection === 'none' || connection === 'expired' || connection === 'pending';

    return (
        <div className="mt-8 bg-white rounded-2xl border border-violet-200 shadow-sm">
            {/* header */}
            <div className="px-6 py-4 border-b border-violet-100 bg-violet-50/60 rounded-t-2xl flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-violet-900">
                        {isManager ? 'משימות קונטריל — כל העובדים' : 'המשימות שלי מקונטריל'}
                    </h2>
                    {lastSyncedAt && (
                        <p className="text-[11px] text-slate-400 mt-0.5">סונכרן לאחרונה: {formatContrealDateTime(lastSyncedAt)}</p>
                    )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={showOpenOnly}
                        onChange={e => setShowOpenOnly(e.target.checked)}
                        className="peer sr-only"
                    />
                    <span className="w-4 h-4 rounded border-2 border-slate-300
                                     peer-checked:border-violet-500 peer-checked:bg-violet-500
                                     transition-all duration-150 flex items-center justify-center
                                     text-transparent peer-checked:text-white text-[9px] font-black shrink-0">
                        ✓
                    </span>
                    <span className="text-xs text-slate-500 font-medium">הצג רק משימות פתוחות</span>
                </label>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="cursor-pointer bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-wait text-white text-xs font-bold py-1.5 px-3 rounded-lg transition flex items-center gap-1"
                >
                    <span className={syncing ? 'inline-block animate-spin' : ''}>⟳</span>
                    {syncing ? 'מסנכרן…' : 'סנכרן מקונטריל'}
                </button>
            </div>

            {/* connection / sync messages */}
            {connectNotice === 'connected' && connection === 'connected' && (
                <div className="px-6 py-3 text-sm bg-emerald-50 text-emerald-800 border-b border-emerald-100">
                    ✓ החיבור לקונטריל הצליח. לחץ "סנכרן מקונטריל" כדי לייבא את המשימות.
                </div>
            )}
            {connectNotice === 'error' && notConnected && (
                <div className="px-6 py-3 text-sm bg-red-50 text-red-700 border-b border-red-100">
                    ההתחברות לקונטריל לא הושלמה. אפשר לנסות שוב.
                </div>
            )}
            {notConnected && (isManager
                ? <ConnectContrealBox expired={connection === 'expired'} />
                : (
                    <div className="px-6 py-3 text-sm bg-amber-50 text-amber-800 border-b border-amber-100">
                        החיבור לקונטריל לא פעיל — פנה למוישי.
                    </div>
                ))}
            {syncResult && <SyncResultBanner result={syncResult} isManager={isManager} />}

            {/* body */}
            {loadError ? (
                <div className="p-6 text-center">
                    <p className="text-sm font-bold text-slate-700 mb-3">לא הצלחנו לטעון את משימות קונטריל</p>
                    <button
                        onClick={loadRows}
                        className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg transition"
                    >
                        נסה שוב
                    </button>
                </div>
            ) : rows === null ? (
                <div className="p-6"><div className="h-5 w-48 bg-slate-100 rounded animate-pulse" /></div>
            ) : visibleRows.length === 0 ? (
                <p className="p-6 text-slate-400 text-sm italic">
                    {rows.length === 0
                        ? (isManager ? 'אין משימות מקונטריל. לחץ "סנכרן מקונטריל" כדי לייבא.' : 'אין משימות מקונטריל שמשויכות אליך.')
                        : 'אין משימות פתוחות כרגע'}
                </p>
            ) : groups ? (
                <div className="max-h-120 overflow-y-auto">
                    {groups.map(g => (
                        <div key={g.name}>
                            <div className="px-6 py-2 bg-slate-50 border-y border-slate-100 flex items-center gap-2 sticky top-0 z-10">
                                <span className="text-xs font-bold text-slate-600">{g.name}</span>
                                <span className="text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2">{g.open} פתוחות</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {g.list.map(r => <TaskRow key={`${g.name}:${r.subtaskId}`} row={r} onToggle={handleToggle} onOpen={setDetailsFor} />)}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="divide-y divide-slate-100 max-h-120 overflow-y-auto">
                    {visibleRows.map(r => <TaskRow key={r.subtaskId} row={r} onToggle={handleToggle} onOpen={setDetailsFor} />)}
                </div>
            )}

            {detailsFor && <ContrealTaskDetailsModal row={detailsFor} onClose={() => setDetailsFor(null)} />}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────

function TaskRow({ row, onToggle, onOpen }: {
    row: ContrealTaskRow;
    onToggle: (row: ContrealTaskRow, completed: boolean) => void;
    onOpen: (row: ContrealTaskRow) => void;
}): React.ReactElement {
    const deadline = formatContrealDeadline(row.deadlineDate);
    return (
        <div className="relative flex items-center gap-3 px-6 py-3 hover:bg-violet-50/30 transition-colors">
            <label className="cursor-pointer flex items-center shrink-0">
                <input
                    type="checkbox"
                    checked={row.completed}
                    onChange={e => onToggle(row, e.target.checked)}
                    className="peer sr-only"
                />
                <span className="w-5 h-5 rounded-full border-2 border-slate-300
                                 peer-checked:border-violet-500 peer-checked:bg-violet-500
                                 transition-all duration-200 flex items-center justify-center
                                 text-transparent peer-checked:text-white text-[11px] font-black
                                 hover:border-slate-400 shrink-0 select-none">
                    ✓
                </span>
            </label>

            <button onClick={() => onOpen(row)} className="cursor-pointer flex-1 min-w-0 text-right">
                <span className={`text-sm truncate block ${row.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {row.title}
                </span>
                {(row.projectName || row.clientName) && (
                    <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                        {[row.projectName, row.clientName].filter(Boolean).join(' · ')}
                    </span>
                )}
            </button>

            {row.pushError && (
                <span title={`העדכון לא הגיע לקונטריל: ${row.pushError}. הסנכרון הבא ינסה שוב.`} className="text-amber-500 shrink-0 cursor-help">⚠️</span>
            )}
            {row.statusName && !row.completed && !QUIET_STATUSES.has(row.statusName) && (
                <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 bg-sky-50 text-sky-700 border-sky-200">{row.statusName}</span>
            )}
            {deadline && (
                <span title={deadline.full} className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${row.completed ? TONE_STYLES.normal : TONE_STYLES[deadline.tone]}`}>
                    {deadline.short}
                </span>
            )}
            {row.priorityName && (
                <span className="text-xs px-2 py-0.5 rounded-full border shrink-0 bg-white text-slate-500 border-slate-200">{row.priorityName}</span>
            )}
        </div>
    );
}

/**
 * כפתור "התחבר לקונטריל" למנהל. ההתחברות דורשת את הקוד הסודי (CONTREAL_ADMIN_KEY) —
 * הוא מוקלד כאן, נשלח רק בכתובת ההתחברות, ולא נשמר באתר.
 */
function ConnectContrealBox({ expired }: { expired: boolean }): React.ReactElement {
    const [open, setOpen] = useState(false);
    const [key, setKey] = useState('');
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!key.trim()) return;
        window.location.href = PersistenceAdapter.contrealConnectUrl(key.trim());
    };
    return (
        <div className="px-6 py-3 text-sm bg-amber-50 text-amber-800 border-b border-amber-100">
            <div className="flex items-center gap-3 flex-wrap">
                <span className="flex-1 min-w-0">
                    {expired ? 'החיבור לקונטריל פג — יש להתחבר מחדש.' : 'קונטריל עדיין לא מחובר.'}
                </span>
                {!open && (
                    <button
                        onClick={() => setOpen(true)}
                        className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition"
                    >
                        התחבר לקונטריל
                    </button>
                )}
            </div>
            {open && (
                <form onSubmit={submit} className="mt-3 flex items-center gap-2 flex-wrap">
                    <input
                        type="password"
                        autoFocus
                        autoComplete="off"
                        value={key}
                        onChange={e => setKey(e.target.value)}
                        placeholder="קוד החיבור הסודי"
                        className="input-style max-w-60 text-sm"
                        dir="ltr"
                    />
                    <button
                        type="submit"
                        disabled={!key.trim()}
                        className="cursor-pointer bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold py-2 px-3 rounded-lg transition"
                    >
                        המשך לקונטריל
                    </button>
                    <button type="button" onClick={() => { setOpen(false); setKey(''); }} className="cursor-pointer text-xs text-slate-500 hover:text-slate-800 px-2">
                        ביטול
                    </button>
                    <p className="basis-full text-[11px] text-amber-700/80">
                        תועבר להתחברות בקונטריל, ואחריה תחזור לכאן. התחבר עם החשבון שממנו רוצים לסנכרן משימות.
                    </p>
                </form>
            )}
        </div>
    );
}

function SyncResultBanner({ result, isManager }: { result: ContrealSyncResult; isManager: boolean }): React.ReactElement {
    if (!result.ok) {
        const msg = result.error === 'sync_running' ? 'סנכרון אחר כבר רץ כרגע. נסה שוב בעוד דקה.'
            : result.error === 'not_connected' ? 'קונטריל לא מחובר.'
            : `הסנכרון נכשל: ${result.error ?? 'שגיאה לא ידועה'}`;
        return <div className="px-6 py-3 text-sm bg-red-50 text-red-700 border-b border-red-100">{msg}</div>;
    }
    const parts = [
        result.created ? `${result.created} חדשות` : null,
        result.completedFromContreal ? `${result.completedFromContreal} נסגרו בקונטריל` : null,
        result.reopenedFromContreal ? `${result.reopenedFromContreal} נפתחו מחדש` : null,
        result.pushed ? `${result.pushed} עדכונים נשלחו לקונטריל` : null,
        result.deleted ? `${result.deleted} נמחקו` : null,
    ].filter(Boolean);
    return (
        <div className="px-6 py-3 text-xs border-b border-slate-100 bg-emerald-50/50 text-emerald-800 space-y-1">
            <p>✓ הסנכרון הושלם{parts.length ? `: ${parts.join(', ')}` : ' — אין שינויים'}.</p>
            {!!result.pushFailed && <p className="text-amber-700">⚠️ {result.pushFailed} עדכונים לא הגיעו לקונטריל — הסנכרון הבא ינסה שוב.</p>}
            {(result.warnings ?? []).map((w, i) => <p key={i} className="text-amber-700">⚠️ {w}</p>)}
            {isManager && !!result.autoMapped?.length && (
                <p className="text-slate-600">שויכו אוטומטית לפי שם: {result.autoMapped.join(', ')}. אם משהו לא נכון — מתקנים בטבלה contreal_user_map.</p>
            )}
            {isManager && !!result.unmappedAssignees?.length && (
                <p className="text-slate-600">
                    עובדים בקונטריל שעוד לא שויכו למשתמש בשמעיה: {result.unmappedAssignees.join(', ')}.
                    {' '}השיוך נעשה בטבלה contreal_user_map ב-Supabase (עמודה shmaya_user).
                </p>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────
// Details modal — כל השדות של המשימה מקונטריל (get_task), נטען בפתיחה
// ──────────────────────────────────────────────────────────────────

// תוויות בעברית לשדות מוכרים, לפי הסדר שבו יוצגו. שדות שלא כאן מוצגים בשם המקורי.
const FIELD_LABELS: [string, string][] = [
    ['description', 'תיאור'],
    ['deadline_date', 'תאריך יעד'],
    ['status', 'סטטוס'],
    ['priority', 'עדיפות'],
    ['assignees', 'משויכים'],
    ['project', 'פרויקט'],
    ['client', 'לקוח'],
    ['created_by', 'נוצרה ע״י'],
    ['estimated_minutes', 'הערכת זמן'],
    ['tracked_seconds', 'זמן שנרשם'],
    ['source', 'מקור'],
    ['created_at', 'נוצרה'],
    ['updated_at', 'עודכנה'],
    ['completed_at', 'הושלמה'],
    ['sub_tasks', 'תתי-משימות'],
    ['links', 'קישורים'],
    ['files', 'קבצים'],
];
// שדות טכניים שלא מוצגים (מזהים, הכותרת שכבר בראש החלונית, קישור שיש לו כפתור)
const HIDDEN_FIELDS = new Set(['id', 'title', 'url', 'comments', 'project_id', 'client_id', 'step_id', 'meeting_id', 'user_id', 'timer_running', 'visible_to_client']);
const SOURCE_LABELS: Record<string, string> = { whatsapp: 'וואטסאפ', web: 'אתר' };

function isEmpty(v: unknown): boolean {
    return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function nameOf(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'object') return String(v);
    return v.name ?? v.priority_name ?? v.title ?? v.file_name ?? v.label ?? v.url ?? JSON.stringify(v);
}

function renderField(key: string, value: any): React.ReactNode {
    switch (key) {
        case 'deadline_date': return formatContrealDeadline(value)?.full ?? String(value);
        case 'created_at': case 'updated_at': case 'completed_at': return formatContrealDateTime(value) ?? String(value);
        case 'estimated_minutes': return value ? `${value} דקות` : null;
        case 'tracked_seconds': return value ? `${Math.round(value / 60)} דקות` : null;
        case 'source': return SOURCE_LABELS[value] ?? String(value);
        case 'description': return <span className="whitespace-pre-wrap">{String(value)}</span>;
        case 'sub_tasks':
            return (
                <ul className="list-disc pr-4 space-y-0.5">
                    {(value as any[]).map((s, i) => <li key={i}>{nameOf(s)}{s?.is_completed || s?.completed ? ' ✓' : ''}</li>)}
                </ul>
            );
    }
    if (Array.isArray(value)) return value.map(nameOf).join(', ');
    if (typeof value === 'object') return nameOf(value);
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    return String(value);
}

function ContrealTaskDetailsModal({ row, onClose }: { row: ContrealTaskRow; onClose: () => void }): React.ReactElement {
    const [task, setTask] = useState<Record<string, any> | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        PersistenceAdapter.fetchContrealTaskDetails(row.subtaskId).then(({ data, error: err }) => {
            if (cancelled) return;
            if (err || !data?.ok) {
                setError(data?.error === 'deleted_in_contreal' ? 'המשימה נמחקה בקונטריל.'
                    : data?.error === 'not_connected' ? 'קונטריל לא מחובר.'
                    : 'לא הצלחנו לטעון את פרטי המשימה מקונטריל.');
                return;
            }
            setTask(data.task ?? {});
        });
        return () => { cancelled = true; };
    }, [row.subtaskId]);

    const known = new Set(FIELD_LABELS.map(([k]) => k));
    const fields: [string, string, any][] = task ? [
        ...FIELD_LABELS.filter(([k]) => !isEmpty(task[k])).map(([k, label]) => [k, label, task[k]] as [string, string, any]),
        ...Object.entries(task)
            .filter(([k, v]) => !known.has(k) && !HIDDEN_FIELDS.has(k) && !isEmpty(v))
            .map(([k, v]) => [k, k, v] as [string, string, any]),
    ] : [];
    const comments: any[] = Array.isArray(task?.comments) ? task!.comments : [];
    const safeUrl = row.url && row.url.startsWith('https://app.contreal.io/') ? row.url : null;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-3">
                    <h3 className="flex-1 text-lg font-bold text-slate-900">{row.title}</h3>
                    <button onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="סגירה">×</button>
                </div>

                <div className="px-6 py-4 text-sm">
                    {error ? (
                        <p className="text-red-600">{error}</p>
                    ) : !task ? (
                        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}</div>
                    ) : (
                        <>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                                {fields.map(([k, label, v]) => {
                                    const rendered = renderField(k, v);
                                    if (isEmpty(rendered)) return null;
                                    return (
                                        <React.Fragment key={k}>
                                            <dt className="text-slate-400 whitespace-nowrap">{label}</dt>
                                            <dd className="text-slate-800 min-w-0 break-words">{rendered}</dd>
                                        </React.Fragment>
                                    );
                                })}
                            </dl>
                            {comments.length > 0 && (
                                <div className="mt-5">
                                    <h4 className="text-xs font-bold text-slate-500 mb-2">תגובות ({comments.length})</h4>
                                    <div className="space-y-2">
                                        {comments.map((c, i) => (
                                            <div key={i} className="bg-slate-50 rounded-lg p-3">
                                                <div className="text-[11px] text-slate-400 mb-1">
                                                    {nameOf(c.author ?? c.user ?? c.created_by)}
                                                    {c.created_at ? ` · ${formatContrealDateTime(c.created_at) ?? ''}` : ''}
                                                </div>
                                                <div className="whitespace-pre-wrap text-slate-700">{String(c.content ?? c.text ?? c.body ?? '')}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-3 border-t border-slate-100 flex gap-2 justify-end">
                    {safeUrl && (
                        <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                           className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition">
                            פתח בקונטריל ↗
                        </a>
                    )}
                    <button onClick={onClose} className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 px-4 rounded-lg transition">
                        סגירה
                    </button>
                </div>
            </div>
        </div>
    );
}
