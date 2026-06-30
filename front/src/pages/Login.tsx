// src/pages/Login.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router";
import { authService } from "../services/authService";

// הגדרת רשימת המשתמשים המורשים במערכת
const ALLOWED_USERS = ["מוישי", "יוחנן", "שמוליק"];

export default function Login(): React.ReactElement {
  // נגדיר את ברירת המחדל למשתמש הראשון ברשימה
  const [username, setUsername] = useState<string>('בחר');
  const [error, setError] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setError(false);

    // וידאו הגנה קל שהמשתמש שנבחר אכן חוקי במערכת
    if (!ALLOWED_USERS.includes(username)) {
      setError(true);
      return;
    }

    // שמירת היוזר ב-localStorage (משתמש במפתח user_name שמוגדר ב-Header)
    localStorage.setItem('user_name', username);
    
    // במידה ויש לוגיקה ייעודית פנימית ב-authService שלך
    if (typeof authService?.login === 'function') {
      authService.login(username);
    }
    
    // ניתוב לדף הבית / דאשבורד הראשי של המערכת
    navigate('/admin/dashboard');
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900" dir="rtl">
      <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-sm border-b-8 border-blue-600">
        <h1 className="text-3xl font-black text-slate-800 text-center mb-2">התחברות</h1>
        <p className="text-center text-xs text-slate-400 font-bold mb-8">בחר משתמש לכניסה למשרד</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          
          {/* ✨ סעיף 6: החלפת ה-Input בתיבת בחירה (Select) מהירה ונקייה */}
          <div className="relative">
            <select
              value={username}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUsername(e.target.value)}
              className={`w-full p-4 rounded-xl border-2 outline-none transition appearance-none bg-slate-50 font-bold text-slate-700 cursor-pointer ${
                error ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-slate-800 focus:bg-white'
              }`}
            >
              <option key={'בחר'} value={'בחר'}>בחר</option>
              {ALLOWED_USERS.map((user) => (
                <option key={user} value={user}>
                  👤 {user}
                </option>
              ))}
            </select>
            {/* חץ קטן מעוצב עבור ה-select */}
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-slate-400 text-xs">
              ▼
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold text-center">
              שגיאה: משתמש לא מורשה במערכת!
            </p>
          )}
          
          <button 
            type="submit" 
            className="w-full bg-slate-800 text-white py-4 rounded-xl font-black text-sm hover:bg-slate-700 transition cursor-pointer shadow-md"
          >
            כניסה למערכת
          </button>
        </form>
      </div>
    </div>
  );
}