import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function Dashboard() {
    const [activeCustomers, setActiveCustomers] = useState<number | null>(null);
    const [pendingTasks, setPendingTasks] = useState<number | null>(null);
    const [completedTasks, setCompletedTasks] = useState<number | null>(null);

    useEffect(() => {
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true)
            .then(r => setActiveCustomers(r.count ?? 0));
        supabase.from('sub_tasks').select('*', { count: 'exact', head: true }).eq('is_completed', false)
            .then(r => setPendingTasks(r.count ?? 0));
        supabase.from('sub_tasks').select('*', { count: 'exact', head: true }).eq('is_completed', true)
            .then(r => setCompletedTasks(r.count ?? 0));
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto" dir="rtl">
            <h1 className="text-3xl font-black text-slate-900 mb-6">לוח בקרה</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-2xl">👥</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">לקוחות פעילים</h3>
                    <p className="text-4xl font-black text-slate-900 mt-1">
                        {activeCustomers ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-2xl">⏳</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">משימות לטיפול</h3>
                    <p className="text-4xl font-black text-amber-600 mt-1">
                        {pendingTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-2xl">✅</span>
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-2">משימות שהושלמו</h3>
                    <p className="text-4xl font-black text-green-600 mt-1">
                        {completedTasks ?? <span className="inline-block w-12 h-9 bg-slate-100 rounded animate-pulse" />}
                    </p>
                </div>
            </div>
        </div>
    );
}