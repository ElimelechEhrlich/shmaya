// src/pages/Dashboard.tsx
import React from 'react';

export default function Dashboard(): React.ReactElement {
  // הגדרת טיפוס מפורש למחרוזת הטקסט
  const userName: string = localStorage.getItem('user_name') || 'אורח';

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold text-slate-800">שלום, {userName}! 👋</h2>
        <p className="text-slate-500 mt-2">שמחים שחזרת לעבודה. הנה סיכום המשימות שלך להיום.</p>
      </div>
      
      {/* כאן יבואו הווידג'טים של הסטטיסטיקה */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
          <p className="text-blue-600 font-bold">משימות פתוחות</p>
          <p className="text-3xl font-black">12</p>
        </div>
        <div className="bg-green-50 p-6 rounded-lg border border-green-100">
          <p className="text-green-600 font-bold">לקוחות פעילים</p>
          <p className="text-3xl font-black">45</p>
        </div>
        <div className="bg-amber-50 p-6 rounded-lg border border-amber-100">
          <p className="text-amber-600 font-bold">משימות דחופות</p>
          <p className="text-3xl font-black">3</p>
        </div>
      </div>
    </div>
  );
}