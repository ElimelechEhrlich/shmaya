// src/comps/CustomerList.tsx
import React, { useEffect, useState } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { TaskGeneratorService } from '../services/TaskService';
import { BUSINESS_TYPE_OPTIONS } from '../registries/CustomerRegistry';
import { useNavigate } from 'react-router-dom';

// הגדרת המבנה של פילטרים באפליקציה
interface CustomerFilters {
    search: string;
    businessType: string;
    isInsuranceActive: string;
    isIncomeTaxActive: string;
    isVatActive: string;
    isFinalApproved: string;
}

const INITIAL_FILTERS: CustomerFilters = {
    search: '',
    businessType: '',
    isInsuranceActive: 'all',
    isIncomeTaxActive: 'all',
    isVatActive: 'all',
    isFinalApproved: 'all',
};

const CustomerList: React.FC = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<CustomerFilters>(INITIAL_FILTERS);

    useEffect(() => { 
        fetchCustomers(); 
    }, []);

    const fetchCustomers = async (): Promise<void> => {
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchAllCustomersWithTasks();
        if (error) {
            console.error('Error fetching customers:', error);
        } else {
            setCustomers(data || []);
        }
        setLoading(false);
    };

    const filteredCustomers = customers.filter(client => {
        const isApproved = TaskGeneratorService.isCustomerFinalized(client.tasks || []);
        const matchesSearch =
            (client.customerDetails?.fullName || '').includes(filters.search) ||
            (client.businessDetails?.businessID || '').includes(filters.search);
            
        const matchesType = filters.businessType === '' || client.businessDetails?.businessType === filters.businessType;
        const matchesInsurance = filters.isInsuranceActive === 'all' || String(!!client.isInsuranceActive) === filters.isInsuranceActive;
        const matchesTax = filters.isIncomeTaxActive === 'all' || String(!!client.isIncomeTaxActive) === filters.isIncomeTaxActive;
        const matchesVat = filters.isVatActive === 'all' || String(!!client.isVatActive) === filters.isVatActive;
        const matchesApproved = filters.isFinalApproved === 'all' || String(isApproved) === filters.isFinalApproved;
        
        return matchesSearch && matchesType && matchesInsurance && matchesTax && matchesVat && matchesApproved;
    });

    const exportToExcel = (): void => {
        const headers = ["שם לקוח", "מזהה עסק", "סוג עסק", "ביטוח לאומי", "מס הכנסה", "מע\"מ", "אישור סופי"];
        const rows = filteredCustomers.map(client => [
            client.customerDetails?.fullName || '',
            client.businessDetails?.businessID || '',
            client.businessDetails?.businessType || '',
            client.isInsuranceActive ? "כן" : "לא",
            client.isIncomeTaxActive ? "כן" : "לא",
            client.isVatActive ? "כן" : "לא",
            TaskGeneratorService.isCustomerFinalized(client.tasks || []) ? "כן" : "לא",
        ]);
        
        const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `רשימת_לקוחות_${new Date().toLocaleDateString()}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetFilters = (): void => {
        setFilters(INITIAL_FILTERS);
    };

    if (loading) {
        return <div className="p-12 text-center font-bold text-slate-400">טוען לקוחות...</div>;
    }

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">רשימת לקוחות</h1>
                        <p className="text-sm text-slate-500 mt-1">לחץ על שורה כדי לפתוח את תיק הלקוח</p>
                    </div>
                    <button
                        onClick={exportToExcel}
                        className="cursor-pointer bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-md flex items-center gap-2 transition"
                    >
                        <span>📥</span> ייצוא ל-CSV
                    </button>
                </div>

                {/* Filter bar */}
                <div className="card-base p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <input
                            type="text"
                            placeholder="🔍 חיפוש שם או מזהה..."
                            value={filters.search}
                            className="input-style cursor-text"
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                        <select className="input-style cursor-pointer" value={filters.businessType} onChange={(e) => setFilters({ ...filters, businessType: e.target.value })}>
                            <option value="">כל סוגי העסק</option>
                            {BUSINESS_TYPE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <select className="input-style cursor-pointer" value={filters.isInsuranceActive} onChange={(e) => setFilters({ ...filters, isInsuranceActive: e.target.value })}>
                            <option value="all">ביטוח לאומי (הכל)</option>
                            <option value="true">בטיפול</option>
                            <option value="false">לא בטיפול</option>
                        </select>
                        <select className="input-style cursor-pointer" value={filters.isIncomeTaxActive} onChange={(e) => setFilters({ ...filters, isIncomeTaxActive: e.target.value })}>
                            <option value="all">מס הכנסה (הכל)</option>
                            <option value="true">בטיפול</option>
                            <option value="false">לא בטיפול</option>
                        </select>
                        <select className="input-style cursor-pointer" value={filters.isVatActive} onChange={(e) => setFilters({ ...filters, isVatActive: e.target.value })}>
                            <option value="all">מע״מ (הכל)</option>
                            <option value="true">בטיפול</option>
                            <option value="false">לא בטיפול</option>
                        </select>
                        <select className="input-style cursor-pointer" value={filters.isFinalApproved} onChange={(e) => setFilters({ ...filters, isFinalApproved: e.target.value })}>
                            <option value="all">אישור סופי (הכל)</option>
                            <option value="true">מאושר</option>
                            <option value="false">לא מאושר</option>
                        </select>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">מציג {filteredCustomers.length} מתוך {customers.length} לקוחות</span>
                        <button onClick={resetFilters} className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold transition">
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                {/* Data table */}
                <div className="card-base overflow-hidden">
                    <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">מזהה עסק</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">שם לקוח</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">סוג עסק</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">רשויות</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">סטטוס</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCustomers.map((client: any) => {
                                const isApproved = TaskGeneratorService.isCustomerFinalized(client.tasks || []);
                                const isInactive = client.isActive === false;
                                return (
                                    <tr
                                        key={client.id}
                                        onClick={() => navigate(`/admin/customers/${client.id}`)}
                                        className={`cursor-pointer hover:bg-blue-50/50 transition group ${isInactive ? 'opacity-60' : ''}`}
                                    >
                                        <td className="p-4 font-bold text-slate-800 group-hover:text-blue-700 transition ">
                                            {client.customerDetails?.fullName || '—'}
                                            {isInactive && <span className="text-[10px] text-slate-400 mr-2">(לא פעיל)</span>}
                                        </td>
                                        <td className="p-4 text-sm font-mono text-slate-600 text-center">{client.businessDetails?.businessID || '—'}</td>
                                        <td className="p-4 text-sm text-slate-600 text-center">{client.businessDetails?.businessType || '—'}</td>
                                        <td className="p-4 text-xs space-x-1 rtl:space-x-reverse text-center">
                                            {client.isInsuranceActive && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">ב״ל</span>}
                                            {client.isIncomeTaxActive && <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-medium">מ״ה</span>}
                                            {client.isVatActive && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded font-medium">מע״מ</span>}
                                        </td>
                                        <td className="p-4 text-center">
                                            {isApproved
                                                ? <span className="text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 text-xs font-bold">✓ אושר</span>
                                                : <span className="text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 text-xs font-bold">⏳ בטיפול</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredCustomers.length === 0 && (
                        <div className="p-12 text-center text-slate-400 italic">לא נמצאו לקוחות התואמים את הסינון.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CustomerList;