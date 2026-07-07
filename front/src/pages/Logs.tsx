import React, { useEffect, useState } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { authService } from '../services/authService';

interface LogEntry {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: { details: string };
}

export default function Logs(): React.ReactElement {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PersistenceAdapter.fetchLogs().then(({ data }) => {
      setLogs(data ?? []);
      setLoading(false);
    });
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-black text-slate-800 mb-6">יומן פעולות</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-slate-400 text-center py-20">אין פעולות מתועדות עדיין</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-right p-4 font-bold text-slate-600">תאריך ושעה</th>
                <th className="text-right p-4 font-bold text-slate-600">משתמש</th>
                <th className="text-right p-4 font-bold text-slate-600">פעולה</th>
                <th className="text-right p-4 font-bold text-slate-600">פרטים</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="p-4 text-slate-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="p-4 font-medium text-slate-700">{log.actor}</td>
                  <td className="p-4">
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{log.payload?.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
