const ERROR_MAP: [RegExp, string][] = [
    [/failed to fetch|networkerror|network error|fetch failed/i,    'שגיאת רשת — בדוק את החיבור לאינטרנט'],
    [/jwt expired|token.*expired|session.*expired/i,                 'פג תוקף ההתחברות — רענן את הדף'],
    [/duplicate key value.*identity_id/i, 'מספר זהות זה כבר קיים במערכת — לקוח עם ת"ז זו כבר רשום'],
    [/duplicate key value.*business_id|already exists.*business_id/i, 'מזהה עסק זה כבר קיים במערכת — בדוק אם הלקוח כבר רשום'],
    [/duplicate key value|already exists/i,                          'הרשומה כבר קיימת במערכת'],
    [/violates foreign key constraint/i,                             'שגיאת קשר — הרשומה המקושרת אינה קיימת'],
    [/violates row.level security|permission denied for table/i,     'אין הרשאה לביצוע הפעולה'],
    [/permission denied/i,                                           'אין הרשאה לביצוע הפעולה'],
    [/null value in column/i,                                        'שדה חובה חסר'],
    [/invalid input syntax/i,                                        'ערך לא תקין'],
    [/value too long/i,                                              'הערך ארוך מדי'],
    [/timeout|timed out/i,                                           'פג הזמן — נסה שוב'],
    [/not found|no rows returned/i,                                  'הרשומה לא נמצאה'],
    [/column .+ does not exist/i,                                    'שגיאה פנימית: עמודה לא קיימת'],
    [/relation .+ does not exist/i,                                  'שגיאה פנימית: טבלה לא קיימת'],
];

export function translateError(message: string): string {
    for (const [pattern, hebrew] of ERROR_MAP) {
        if (pattern.test(message)) return hebrew;
    }
    return message;
}
