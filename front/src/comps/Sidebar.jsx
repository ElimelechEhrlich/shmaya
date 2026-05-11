import { Link, useLocation } from 'react-router';

export default function Sidebar() {
const location = useLocation();
  const isActive = (path) => location.pathname.includes(path) ? 'bg-slate-800 border-l-4 border-blue-400' : '';

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between shrink-0 h-full">
      <div>
        {/* לוגו החברה */}
        <div className="p-8 text-center border-b border-slate-800">
          <div className="text-3xl font-bold tracking-tighter">LOGO</div>
          {/* <p className="text-xs text-slate-400 mt-1 uppercase">Accountant CRM</p> */}
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

      {/* פרטי חברה בתחתית */}
      {/* <div className="p-6 border-t border-slate-800 text-xs text-slate-500 space-y-2">
        <div className="font-bold text-slate-300">החברה שלך בע"מ</div>
        <p>ח.פ: 510000000</p>
        <a href="#" className="text-blue-500 hover:underline">תמיכה טכנית</a>
      </div> */}
    </aside>
  );
}

