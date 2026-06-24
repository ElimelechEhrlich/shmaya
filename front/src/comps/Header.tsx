// src/comps/Header.tsx
import React, { useState } from 'react';
import { useLocation, useParams, useNavigate } from "react-router";
import { authService } from '../services/authService';

export default function Header(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  
  // ניהול הסטייט של החלונית הנפתחת
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  
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

  // פונקציית התנתקות מהמערכת
  const handleLogout = () => {
    authService.logout();
    navigate('/');
  };

  return (
    <header className="h-20 bg-white shadow-sm flex items-center justify-between px-8 border-b border-slate-200 relative z-50">
      <h1 className="text-2xl font-bold text-slate-800">{getTitle()}</h1>
      
      {/* אזור הפרופיל - הופך למיכל יחסי עבור ה-Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-3 hover:bg-slate-50 p-2 rounded-xl transition cursor-pointer select-none text-right border border-transparent hover:border-slate-100"
        >
          <div>
            <p className="text-sm font-bold text-slate-800 leading-none">{userName}</p>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 justify-end">
              מחובר כעת <span className="text-[9px] text-slate-400">{isDropdownOpen ? '▲' : '▼'}</span>
            </p>
          </div>
          {/* "עיגול" תמונת פרופיל עם האות הראשונה */}
          <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold shadow-sm">
            {userName.charAt(0)}
          </div>
        </button>

        {/* חלונית ה-Dropdown (סעיף 9) */}
        {isDropdownOpen && (
          <>
            {/* שכבת הגנה שקופה שסוגרת את החלונית בלחיצה בכל מקום מחוצה לה */}
            <div 
              className="fixed inset-0 z-40 cursor-default" 
              onClick={() => setIsDropdownOpen(false)} 
            />
            
            {/* תיבת התפריט */}
            <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 z-50 text-slate-800 animate-in fade-in slide-in-from-top-1 duration-100" dir="rtl">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-2 mb-1.5 px-2">
                אפשרויות חשבון
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-right text-xs font-bold text-red-600 hover:bg-red-50 p-2 rounded-lg transition cursor-pointer flex items-center gap-2"
              >
                <span>↩</span> התנתקות מהמערכת
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}