// src/comps/Header.tsx
import React from 'react';
import { useLocation, useParams } from "react-router";

export default function Header(): React.ReactElement {
  const location = useLocation();
  
  // הגדרת טיפוס מפורש לפרמטרים של ה-URL כדי לוודא ש-id מוכר כמחרוזת
  const { id } = useParams<{ id: string }>();
  
  // משיכת השם מה-localStorage (ברירת מחדל: "אורח")
  const userName: string = localStorage.getItem('user_name') || 'אורח';
  
  // הגדרת טיפוס חזרה מפורש של מחרוזת (string) לפונקציית הכותרת
  const getTitle = (): string => {
    const path = location.pathname;
    if (path.includes('/customers/') && !path.includes('/customers/new')) return `פרטי לקוח`;
    if (path.includes('/tasks/')) return `פרטי משימה: ${id || ''}`;
    if (path.includes('dashboard')) return 'לוח בקרה';
    if (path.includes('customers')) return 'לקוחות';
    if (path.includes('tasks')) return 'ניהול משימות';
    if (path.includes('logs')) return 'יומן פעולות';
    return 'מערכת ניהול';
  };

  return (
    <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8 border-b border-slate-200">
      <h1 className="text-2xl font-bold text-slate-800">{getTitle()}</h1>
      
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800 leading-none">{userName}</p>
          <p className="text-xs text-slate-500">מחובר כעת</p>
        </div>
        {/* "עיגול" תמונת פרופיל עם האות הראשונה */}
        <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
          {userName.charAt(0)}
        </div>
      </div>
    </header>
  );
}