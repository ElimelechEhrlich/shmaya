// src/utils/formatContrealDeadline.ts
//
// תצוגת תאריכים של קונטריל.
//
// deadline_date מגיע מקונטריל כתאריך בלבד, "YYYY-MM-DD", בלי שעה ובלי אזור זמן (אומת מול
// התשובות האמיתיות). אסור להעביר אותו ישר ל-new Date(): מחרוזת תאריך בלבד מתפרשת כחצות UTC,
// ובישראל (UTC+2/+3) זה עדיין אותו יום — אבל בכל אזור שמערבית ל-UTC היא תוצג יום אחד מוקדם.
// לכן מפרקים את המחרוזת למספרים ומשווים מול "היום" לפי שעון ישראל, בלי המרות.
//
// שדות זמן אחרים (created_at, completed_at...) מגיעים כ-ISO עם Z ומוצגים בשעון ישראל.

const TIME_ZONE = 'Asia/Jerusalem';
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

export type DeadlineTone = 'overdue' | 'today' | 'soon' | 'normal';

export interface FormattedDeadline {
    /** תווית קצרה לשורה: "היום" / "מחר" / "אתמול" / "יום ה׳ 12/10". */
    short: string;
    /** תאריך מלא לחלונית: "יום ה׳ 12/10/2026". */
    full: string;
    /** עבר = אדום, היום = כתום, מחר = צהוב, אחר = רגיל. */
    tone: DeadlineTone;
}

/** "YYYY-MM-DD" של היום לפי שעון ישראל. `now` מוזרק לבדיקות. */
export function todayInIsrael(now: Date = new Date()): string {
    // en-CA מפיק בדיוק YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parseDateOnly(value: string): { y: number; m: number; d: number } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
    // דוחה תאריכים לא קיימים (31/02 וכו')
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
    return { y, m, d };
}

/** הפרש בימים בין שני תאריכי "YYYY-MM-DD" (חישוב ב-UTC טהור, לא מושפע משעון קיץ). */
function dayDiff(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
    return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * מעצב deadline_date של קונטריל. מחזיר null לערך חסר או לא תקין (ואז לא מציגים תגית).
 */
export function formatContrealDeadline(value: string | null | undefined, now: Date = new Date()): FormattedDeadline | null {
    if (!value) return null;
    const date = parseDateOnly(value);
    if (!date) {
        console.warn('[formatContrealDeadline] unexpected deadline value:', value);
        return null;
    }
    const today = parseDateOnly(todayInIsrael(now))!;
    const diff = dayDiff(date, today);
    const weekday = WEEKDAYS[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
    const full = `יום ${weekday} ${pad(date.d)}/${pad(date.m)}/${date.y}`;

    let short: string;
    if (diff === 0) short = 'היום';
    else if (diff === 1) short = 'מחר';
    else if (diff === -1) short = 'אתמול';
    else short = date.y === today.y ? `יום ${weekday} ${pad(date.d)}/${pad(date.m)}` : full;

    const tone: DeadlineTone = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff === 1 ? 'soon' : 'normal';
    return { short, full, tone };
}

/**
 * מעצב חותמת זמן של קונטריל (ISO עם אזור זמן, למשל "2026-10-07T07:04:08.000Z") לשעון ישראל:
 * "יום ד׳ 07/10/2026, 10:04". תאריך בלבד מועבר ל-formatContrealDeadline. null לערך לא תקין.
 */
export function formatContrealDateTime(value: string | null | undefined): string | null {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return formatContrealDeadline(value)?.full ?? null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
        }).formatToParts(date).map(p => [p.type, p.value]),
    );
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return `יום ${WEEKDAYS[weekdayIndex]} ${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}`;
}
