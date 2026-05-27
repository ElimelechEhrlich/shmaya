// src/comps/Layout.tsx
import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Outlet } from 'react-router';

export default function Layout(): React.ReactElement {
    return (
        <div className="flex h-screen w-full bg-gray-50" dir="rtl">
            {/* סיידבר קבוע בצד */}
            <Sidebar />

            {/* אזור התוכן הראשי */}
            <div className="flex flex-col flex-1 overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet /> {/* כאן ירונדרו הדפים: משימות, לקוחות וכו' */}
                </main>
            </div>
        </div>
    );
}