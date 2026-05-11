import React, { useState } from 'react'
import { Link } from 'react-router';

export default function Logs() {
    const [allLogs] = useState([
        { id: 1, user: "יוחנן", action: "פתיחת תיק ביטוח לאומי", customerName: "אלימלך ארליך", customerId: "101", taskName: "דוח מע\"מ", taskId: "t1", time: "23/04/2026 14:20" },
        { id: 2, user: "מוישי", action: "פתיחת תיק מס הכנסה", customerName: "משה שמעיה", customerId: "102", taskName: "הצהרת הון", taskId: "t2", time: "23/04/2026 12:05" },
        { id: 3, user: "יוחנן", action: "פתיחת תיק מע'מ", customerName: "אלימלך ארליך", customerId: "101", taskName: "מקדמות", taskId: "t3", time: "23/04/2026 09:00" },
        { id: 4, user: "פיני", action: "לקנות דיו למדפסת", customerName: null, customerId: null, taskName: null, taskId: null, time: "23/04/2026 08:30" },
    ]);

    // States לסינון
    const [filterCustomer, setFilterCustomer] = useState("");
    const [filterTask, setFilterTask] = useState("");
    const [filterUser, setFilterUser] = useState("");

    // לוגיקת הסינון
    const filteredLogs = allLogs.filter(log => {
        const matchCustomer = filterCustomer === "" || log.customerId === filterCustomer;
        const matchTask = filterTask === "" || log.taskId === filterTask;
        const matchUser = filterUser === "" || log.user === filterUser;
        return matchCustomer && matchTask && matchUser;
    });

    return (
        <div className="flex flex-col gap-4">
            {/* סרגל סינון */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-600">סנן לפי לקוח:</label>
                    <select
                        className="border rouded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition"
                        value={filterCustomer}
                        onChange={(e) => setFilterCustomer(e.target.value)}
                    >
                        <option value="">כל הלקוחות</option>
                        <option value="101">אלימלך ארליך</option>
                        <option value="102">משה שמעיה</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-600">סנן לפי משימה:</label>
                    <select
                        className="border rounded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition"
                        value={filterTask}
                        onChange={(e) => setFilterTask(e.target.value)}
                    >
                        <option value="">כל המשימות</option>
                        <option value="t1">פתיחת תיק ביטוח לאומי</option>
                        <option value="t2">פתיחת תיק מס הכנסה</option>
                        <option value="t3">פתיחת תיק מע'מ</option>
                        <option value="t4">לקנות דיו למדפסת</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-600">סנן לפי משתמש:</label>
                    <select
                        className="border rounded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 transition"
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                    >
                        <option value="">כל המשתמשים</option>
                        <option value="מוישי">מוישי</option>
                        <option value="יוחנן">יוחנן</option>
                        <option value="פיני">פיני</option>
                    </select>
                </div>

                <button
                    onClick={() => { setFilterCustomer(""); setFilterTask(""); setFilterUser(""); }}
                    className="text-sm text-blue-600 hover:underline mb-2"
                >
                    נקה סינונים
                </button>
            </div>

            {/* טבלת לוגים */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-right">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="p-4 text-sm font-semibold text-slate-600">משתמש</th>
                            <th className="p-4 text-sm font-semibold text-slate-600">פעולה</th>
                            <th className="p-4 text-sm font-semibold text-slate-600">לקוח</th>
                            <th className="p-4 text-sm font-semibold text-slate-600">משימה</th>
                            <th className="p-4 text-sm font-semibold text-slate-600">זמן</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredLogs.length > 0 ? (
                            filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-sm text-slate-700 font-medium">{log.user}</td>
                                    <td className="p-4 text-sm text-slate-600">{log.action}</td>
                                    <td className="p-4 text-sm">
                                        {log.customerId ? (
                                            <Link to={`/customers/${log.customerId}`} className="text-blue-600 hover:underline">
                                                {log.customerName}
                                            </Link>
                                        ) : <span className="text-slate-400">-</span>}
                                    </td>
                                    <td className="p-4 text-sm">
                                        {log.taskId ? (
                                            <Link to={`/tasks/${log.taskId}`} className="text-emerald-600 hover:underline">
                                                {log.taskName}
                                            </Link>
                                        ) : <span className="text-slate-400">-</span>}
                                    </td>
                                    <td className="p-4 text-sm text-slate-500 font-mono">{log.time}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" className="p-10 text-center text-slate-400 italic">לא נמצאו לוגים התואמים לחיפוש</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
