import React, { useEffect, useState } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter.ts';
import { TaskGeneratorService } from '../services/TaskService.js';
import { BUSINESS_TYPE_OPTIONS } from '../registries/CustomerRegistry.ts';
import { useNavigate } from 'react-router';


const CustomerList = () => {
    const navigate = useNavigate(); // הגדרת הניווט
    // פונקציית הייצוא לאקסל
    const exportToExcel = () => {
        // 1. הגדרת הכותרות (Headers)
        const headers = ["שם לקוח", "מזהה עסק", "סוג עסק", "ביטוח לאומי", "מס הכנסה", "מע\"מ", "אישור סופי"];

        // 2. עיבוד הנתונים המסוננים לשורות
        // Last column was a phantom-column comparison that always returned false
        // (audit §1 finding #3). Now driven by Registry's parent-id-anchored probe.
        const rows = filteredCustomers.map(client => [
            client.customerDetails?.fullName,
            client.businessDetails?.businessID,
            client.businessDetails?.businessType,
            client.isInsuranceActive ? "כן" : "לא",
            client.isIncomeTaxActive ? "כן" : "לא",
            client.isVatActive ? "כן" : "לא",
            TaskGeneratorService.isCustomerFinalized(client.tasks) ? "כן" : "לא",
        ]);

        // 3. יצירת תוכן ה-CSV (עם תמיכה בעברית על ידי BOM)
        const csvContent = "\uFEFF" + [headers, ...rows]
            .map(e => e.join(","))
            .join("\n");

        // 4. הורדת הקובץ
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `רשימת_לקוחות_${new Date().toLocaleDateString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);

    // State לניהול הפילטרים
    const [filters, setFilters] = useState({
        search: '',
        businessType: '',
        isInsuranceActive: 'all',
        isIncomeTaxActive: 'all',
        isVatActive: 'all',
        isFinalApproved: 'all'
    });

    useEffect(() => {
        fetchCustomers();

    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        // Joined tasks are needed for the finalization probe + the export's
        // "אישור סופי" column. fetchAllCustomersWithTasks runs `select('*, tasks(*)')`.
        const { data, error } = await PersistenceAdapter.fetchAllCustomersWithTasks();

        if (error) console.error('Error fetching customers:', error);
        else setCustomers(data || []);
        setLoading(false);
    };

    // לוגיקת הסינון
    const filteredCustomers = customers.filter(client => {
        const isApproved = TaskGeneratorService.isCustomerFinalized(client.tasks);

        const matchesSearch =
            client.customerDetails?.fullName?.includes(filters.search) ||
            client.businessDetails?.businessID?.includes(filters.search);

        const matchesType = filters.businessType === '' || client.businessDetails?.businessType === filters.businessType;

        const matchesInsurance = filters.isInsuranceActive === 'all' || String(client.isInsuranceActive) === filters.isInsuranceActive;
        const matchesTax = filters.isIncomeTaxActive === 'all' || String(client.isIncomeTaxActive) === filters.isIncomeTaxActive;
        const matchesVat = filters.isVatActive === 'all' || String(client.isVatActive) === filters.isVatActive;
        const matchesApproved = filters.isFinalApproved === 'all' || String(isApproved) === filters.isFinalApproved;

        return matchesSearch && matchesType && matchesInsurance && matchesTax && matchesVat && matchesApproved;
    });

    if (loading) return <div className="p-8 text-center">טוען לקוחות...</div>;

    return (
        <div className="p-6 bg-slate-50 min-h-screen rtl">
            <h1 className="text-2xl font-bold mb-6">רשימת לקוחות</h1>

            {/* סרגל סינונים */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 bg-white p-4 rounded-lg shadow-sm">
                <input
                    type="text"
                    placeholder="חיפוש שם או מזהה..."
                    className="p-2 border rounded"
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />

                <select className="p-2 border rounded" onChange={(e) => setFilters({ ...filters, businessType: e.target.value })}>
                    <option value="">כל סוגי העסק</option>
                    {BUSINESS_TYPE_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>

                <select className="p-2 border rounded" onChange={(e) =>                     setFilters({ ...filters, isInsuranceActive: e.target.value })                }>
                    <option value="all">ביטוח לאומי (הכל)</option>
                    <option value="true">בטיפול</option>
                    <option value="false">לא בטיפול</option>
                </select>

                <select className="p-2 border rounded" onChange={(e) =>                     setFilters({ ...filters, isIncomeTaxActive: e.target.value })                }>
                    <option value="all">מס הכנסה (הכל)</option>
                    <option value="true">בטיפול</option>
                    <option value="false">לא בטיפול</option>
                </select>

                <select className="p-2 border rounded" onChange={(e) =>                     setFilters({ ...filters, isVatActive: e.target.value })                }>
                    <option value="all">מע"מ (הכל)</option>
                    <option value="true">בטיפול</option>
                    <option value="false">לא בטיפול</option>
                </select>

                <select className="p-2 border rounded" onChange={(e) => setFilters({ ...filters, isFinalApproved: e.target.value })}>
                    <option value="all">אישור ניהול סופי</option>
                    <option value="true">מאושר (אין משימות פתוחות)</option>
                    <option value="false">לא מאושר (טיפול לא הסתיים)</option>
                </select>
            </div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">רשימת לקוחות</h1>
                <button
                    onClick={exportToExcel}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center shadow-md transition-all"
                >
                    <span className="ml-2">📥</span>
                    ייצוא לאקסל (CSV)
                </button>
            </div>

            {/* טבלת נתונים */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-right border-collapse">
                    <thead className="bg-slate-100 border-b">
                        <tr>
                            <th className="p-4">שם לקוח</th>
                            <th className="p-4">מזהה עסק</th>
                            <th className="p-4">סוג עסק</th>
                            <th className="p-4">רשויות בטיפול</th>
                            <th className="p-4">סטטוס משימות</th>
                            <th className="p-4">פעולות</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCustomers.map(client => {
                            const isApproved = TaskGeneratorService.isCustomerFinalized(client.tasks);
                            return (<tr key={client.id} className="border-b hover:bg-slate-50 transition-colors">
                                <td className="p-4 font-medium">{client.customerDetails?.fullName}</td>
                                <td className="p-4">{client.businessDetails?.businessID}</td>
                                <td className="p-4">{client.businessDetails?.businessType}</td>
                                <td className="p-4 text-xs space-x-1 rtl:space-x-reverse">
                                    {client.isInsuranceActive && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">ב"ל</span>}
                                    {client.isIncomeTaxActive && <span className="bg-green-100 text-green-700 px-2 py-1 rounded">מ"ה</span>}
                                    {client.isVatActive && <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">מע"מ</span>}
                                </td>
                                <td className="p-4 text-center">
                                    {isApproved ?
                                        <span className="text-green-600 bg-green-50 px-3 py-1 rounded-full border border-green-200 text-sm font-bold">✓ בוצע</span> :
                                        <span className="text-amber-500 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 text-sm font-bold">⏳ בטיפול</span>
                                    }
                                </td>
                                <td className="p-4">
                                    <button
                                        onClick={() => navigate(`/admin/customers/${client.id}`)} // ההפניה הדינמית
                                        className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                    >
                                        צפייה בתיק
                                    </button>
                                </td>
                            </tr>)
                        })}
                    </tbody>
                </table>
                {filteredCustomers.length === 0 && (
                    <div className="p-8 text-center text-gray-500">לא נמצאו לקוחות התואמים את הסינון.</div>
                )}
            </div>
        </div>
    );
};

export default CustomerList;