import React, { useState, useEffect } from 'react';
import { OFFICE_CUSTOMER_ID, PersistenceAdapter } from '../services/PersistenceAdapter';
import { calculateWeightedProgress } from '../registries/CustomerRegistry';

export default function Dashboard() {
    const [activeCustomers, setActiveCustomers] = useState<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<number | null>(null);
    const [completedTasks, setCompletedTasks] = useState<number | null>(null);

    useEffect(() => {
        PersistenceAdapter.fetchActiveCustomerCount()
            .then(r => setActiveCustomers(r.data ?? 0));

        PersistenceAdapter.fetchAllCustomersWithTasks().then(({ data }) => {
            if (!data) return;
            const realCustomers = data.filter(c => c.id !== OFFICE_CUSTOMER_ID);
            let pending = 0, completed = 0;
            for (const c of realCustomers) {
                const progress = calculateWeightedProgress(c.tasks ?? []).percent;
                if (progress === 100) completed++;
                else pending++;
            }
            setPendingTasks(pending);
            setCompletedTasks(completed);
        });
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto" dir="rtl">
            <h1 className="text-3xl font-black text-slate-900 mb-6">לוח בקרה</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-blue-500 shadow-sm transition-all duration-300 active:scale-105 active:shadow-lg active:bg-blue-50 hover:scale-105 hover:shadow-lg hover:bg-blue-50">
                    <span className="text-2xl">👥</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות פעילים</h3>
                    <p className="text-4xl font-black text-slate-900 mt-1">
                        {activeCustomers ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-amber-500 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-amber-50 active:scale-105 active:shadow-lg active:bg-amber-50">
                    <span className="text-2xl">⏳</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות בטיפול</h3>
                    <p className="text-4xl font-black text-amber-600 mt-1">
                        {pendingTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 border-t-4 border-emerald-500 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-emerald-50 active:scale-105 active:shadow-lg active:bg-emerald-50">
                    <span className="text-2xl">✅</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות שהושלמו</h3>
                    <p className="text-4xl font-black text-green-600 mt-1">
                        {completedTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
            </div>
        </div>
    );
}
