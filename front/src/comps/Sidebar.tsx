// src/comps/Sidebar.tsx
import React from 'react';
import { Link, useLocation } from 'react-router';

export default function Sidebar(): React.ReactElement {
  const location = useLocation();
  
  // הגדרת טיפוס מפורש לפרמטר וטיפוס חזרה של מחרוזת (string)
  const isActive = (path: string): string => 
    location.pathname.includes(path) ? 'bg-slate-800 border-l-4 border-blue-400' : '';

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 h-full">
      <div>
        {/* לוגו החברה */}
        <div className="p-8 text-center border-b border-slate-800">
          <div className="text-3xl font-bold tracking-tighter">   
            <img className="w-25 h-25 mx-auto" src="/shmayaIcon.png" alt="Logo" />
          </div>
        </div>

        {/* ניווט */}
        <nav className="mt-15">
          <Link to="/admin/dashboard" className={`flex items-center p-4 hover:bg-slate-800 transition ${isActive('dashboard')}`}>
            <span>דאשבורד</span>
          </Link>
          <Link to="/admin/customers" className={`flex items-center p-4 hover:bg-slate-800 transition ${isActive('customers')}`}>
            <span>לקוחות</span>
          </Link>
          <Link to="/admin/tasks" className={`flex items-center p-4 hover:bg-slate-800 transition ${isActive('tasks')}`}>
            <span>משימות</span>
          </Link>
          <Link to="/admin/logs" className={`flex items-center p-4 hover:bg-slate-800 transition ${isActive('logs')}`}>
            <span>יומן פעולות</span>
          </Link>
        </nav>
      </div>
    </aside>
  );
}