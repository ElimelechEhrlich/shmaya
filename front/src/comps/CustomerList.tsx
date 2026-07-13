// src/comps/CustomerList.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { TaskGeneratorService } from '../services/TaskService';
import { BUSINESS_TYPE_OPTIONS, calculateWeightedProgress, getCustomerDisplayName } from '../registries/CustomerRegistry';
import SearchableMultiSelect from './SearchableMultiSelect';
import { useNavigate } from 'react-router';

interface CustomerFilters {
    search: string;
    businessType: string[];
    isInsuranceActive: string;
    isIncomeTaxActive: string;
    isVatActive: string;
    isFinalApproved: string;
    status: 'all' | 'waiting' | 'active' | 'completed' | 'inactive';
}

const INITIAL_FILTERS: CustomerFilters = {
    search: '',
    businessType: [],
    isInsuranceActive: 'all',
    isIncomeTaxActive: 'all',
    isVatActive: 'all',
    isFinalApproved: 'all',
    status: 'all',
};

// עדיפות: בהמתנה גוברת על הכל (גם על לא-פעיל), אחריה לא-פעיל, ואז לפי אחוז ביצוע.
function getStatusCategory(client: any, progressPercent: number): 'waiting' | 'inactive' | 'completed' | 'active' {
    if (client.isWaiting) return 'waiting';
    if (client.isActive === false) return 'inactive';
    return progressPercent === 100 ? 'completed' : 'active';
}

const CustomerList: React.FC = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [filters, setFilters] = useState<CustomerFilters>(INITIAL_FILTERS);
    const [showFilters, setShowFilters] = useState(false);

    const fetchCustomers = useCallback(async (): Promise<void> => {
        setLoading(true);
        const { data, error } = await PersistenceAdapter.fetchAllCustomersWithTasks();
        if (error) {
            console.error('Error fetching customers:', error);
        } else {
            setCustomers(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    // מחושב פעם אחת כשרשימת הלקוחות משתנה — לא מחושב מחדש בכל שינוי סינון
    const finalizationMap = useMemo(() => {
        const map = new Map<string, boolean>();
        customers.forEach(c => map.set(c.id, TaskGeneratorService.isCustomerFinalized(c.tasks || [])));
        return map;
    }, [customers]);

    const progressMap = useMemo(() => {
        const map = new Map<string, number>();
        customers.forEach(c => map.set(c.id, calculateWeightedProgress(c.tasks || []).percent));
        return map;
    }, [customers]);

    const filteredCustomers = useMemo(() => customers.filter(client => {
        const isApproved = finalizationMap.get(client.id) ?? false;
const matchesSearch =
getCustomerDisplayName(client).includes(filters.search || '')
|| (client.businessDetails?.businessID || '').includes(filters.search || '')
    const matchesType = filters.businessType.length === 0 || filters.businessType.includes(client.businessDetails?.businessType);
        const matchesInsurance = filters.isInsuranceActive === 'all' || String(!!client.isInsuranceActive) === filters.isInsuranceActive;
        const matchesTax = filters.isIncomeTaxActive === 'all' || String(!!client.isIncomeTaxActive) === filters.isIncomeTaxActive;
        const matchesVat = filters.isVatActive === 'all' || String(!!client.isVatActive) === filters.isVatActive;
        const matchesApproved = filters.isFinalApproved === 'all' || String(isApproved) === filters.isFinalApproved;
        const matchesStatus = filters.status === 'all' || getStatusCategory(client, progressMap.get(client.id) ?? 0) === filters.status;
        return matchesSearch && matchesType && matchesInsurance && matchesTax && matchesVat && matchesApproved && matchesStatus;
    }), [customers, filters, finalizationMap, progressMap]);

    const exportToExcel = (): void => {
        const headers = ["שם לקוח", "מזהה עסק", "סוג עסק", "ביטוח לאומי", "מס הכנסה", "מע\"מ", "אישור סופי"];
        const rows = filteredCustomers.map(client => [
            getCustomerDisplayName(client),
            client.businessDetails?.businessID || '',
            client.businessDetails?.businessType || '',
            client.isInsuranceActive ? "כן" : "לא",
            client.isIncomeTaxActive ? "כן" : "לא",
            client.isVatActive ? "כן" : "לא",
            (finalizationMap.get(client.id) ?? false) ? "כן" : "לא",
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
        return (
            <div className="p-4 md:p-6 min-h-screen" dir="rtl">
                <div className="max-w-7xl mx-auto">
                    <div className="h-9 w-48 bg-slate-200 rounded-xl mb-6 animate-pulse" />
                    <div className="card-base overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>{[1,2,3,4,5,6].map(i => (
                                    <th key={i} className="p-4"><div className="h-3 bg-slate-200 rounded animate-pulse" /></th>
                                ))}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {[1,2,3,4,5,6,7].map(i => (
                                    <tr key={i}>{[1,2,3,4,5,6].map(j => (
                                        <td key={j} className="p-4"><div className="h-5 bg-slate-100 rounded animate-pulse" /></td>
                                    ))}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
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
                    <button
                        className="md:hidden w-full flex justify-between items-center
                                   p-3 bg-white rounded-xl border border-slate-200 mb-2"
                        onClick={() => setShowFilters(p => !p)}
                    >
                        <span className="font-medium text-slate-600">סינון</span>
                        <span>{showFilters ? '▴' : '▾'}</span>
                    </button>
                    <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3">
                        <input
                            type="text"
                            placeholder="🔍 חיפוש שם או מזהה..."
                            value={filters.search}
                            className="input-style cursor-text"
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        />
                        <SearchableMultiSelect
                            label="סוג עסק"
                            options={BUSINESS_TYPE_OPTIONS.map(o => [o, o] as [string, string])}
                            selected={filters.businessType}
                            onChange={(v) => setFilters({ ...filters, businessType: v })}
                            searchable
                        />
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
                        <select className="input-style cursor-pointer" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as CustomerFilters['status'] })}>
                            <option value="all">סטטוס (הכל)</option>
                            <option value="waiting">בהמתנה</option>
                            <option value="active">בטיפול</option>
                            <option value="completed">הושלם</option>
                            <option value="inactive">לא פעיל</option>
                        </select>
                    </div>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-medium">מציג {filteredCustomers.length} מתוך {customers.length} לקוחות</span>
                        <button onClick={resetFilters} className="cursor-pointer text-sm text-blue-600 hover:text-blue-800 font-bold transition">
                            ניקוי סינונים
                        </button>
                    </div>
                </div>

                {/* Data table */}
                <div className="card-base overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">שם לקוח</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">מזהה עסק</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">סוג עסק</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">רשויות</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">סטטוס</th>
                                <th className="p-4 text-xs font-bold text-slate-600 uppercase tracking-wider text-center">תאריך יצירה</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCustomers.map((client: any) => {
                                const isApproved = finalizationMap.get(client.id) ?? false;
                                const isInactive = client.isActive === false;
                                return (
                                    <tr
                                        key={client.id}
                                        onClick={() => navigate(`/admin/customers/${client.id}`)}
                                        className={`cursor-pointer hover:bg-blue-50/50 transition group ${isInactive ? 'opacity-60' : ''}`}
                                    >
                                        <td title={getCustomerDisplayName(client) || ''} className="p-4 font-bold text-slate-800 group-hover:text-blue-700 transition truncate max-w-[200px]">
                                            {getCustomerDisplayName(client) || '—'}
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
                                            {client.isWaiting
                                                ? <span className="text-orange-700 bg-orange-50 px-3 py-1 rounded-full border border-orange-200 text-xs font-bold">בהמתנה</span>
                                                : isInactive
                                                ? <span className="text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 text-xs font-bold">לא פעיל</span>
                                                : (progressMap.get(client.id) ?? 0) === 100
                                                    ? <span className="text-green-700 bg-green-50 px-3 py-1 rounded-full border border-green-200 text-xs font-bold">✓ הושלם</span>
                                                    : <span className="text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 text-xs font-bold">⏳ בטיפול</span>}
                                        </td>
                                        <td className="p-4 text-sm text-slate-600 text-center">{client.createdAt ? new Date(client.createdAt).toLocaleDateString('he-IL') : '—'}</td>
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
