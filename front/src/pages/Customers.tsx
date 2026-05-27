// src/pages/Customers.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerList from '../comps/CustomerList';

export default function Customers(): React.ReactElement {
    const navigate = useNavigate();

    return (
        <div className="space-y-6">
            <div className="flex justify-center items-center px-6 rounded-xl ">
                {/* כפתור הוספה בולט */}
                <button
                    onClick={() => navigate('/admin/customers/new')}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl transition-all transform active:scale-95 flex items-center gap-2"
                >
                    <span className="text-xl">+</span>
                    לקוח חדש
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-2 text-center text-slate-400">
                    <CustomerList />
                </div>
            </div>
        </div>
    );
}