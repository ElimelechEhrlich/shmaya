import React from 'react'
import { useParams } from 'react-router';

export default function CustomerDetails() {
const { id } = useParams(); // שולף את ה-ID מהכתובת

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* כרטיס פרטי לקוח */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">פרטי לקוח: {id}</h2>
        <div className="grid grid-cols-2 gap-4 text-slate-600">
          <p><strong>שם העסק:</strong> חברת דוגמה בע"מ</p>
          <p><strong>ח.פ:</strong> 512345678</p>
          <p><strong>איש קשר:</strong> ישראל ישראלי</p>
          <p><strong>סטטוס:</strong> פעיל</p>
        </div>
      </div>

      {/* יומן פעולות ספציפי ללקוח זה */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b bg-slate-50">
          <h3 className="font-semibold text-slate-700">היסטוריית פעולות עבור לקוח זה</h3>
        </div>
        <table className="w-full text-right">
          <tbody className="divide-y divide-slate-100">
            {/* כאן תעשה פילטר ללוגים לפי ה-id של הלקוח */}
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="p-4 text-sm text-slate-700">עדכון דוח מע"מ</td>
              <td className="p-4 text-sm text-slate-500 text-left font-mono">23/04/2026 14:20</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
