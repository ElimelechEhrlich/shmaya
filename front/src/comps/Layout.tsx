import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { Outlet } from 'react-router';

export default function Layout(): React.ReactElement {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen w-full bg-gray-50" dir="rtl">
            {/* Overlay כהה במובייל כשהסידבר פתוח */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed inset-y-0 right-0 z-50 md:static md:block
                transition-transform duration-300
                ${sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            `}>
                <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </div>

            {/* תוכן ראשי */}
            <div className="flex flex-col flex-1 overflow-hidden">
                <Header onMenuClick={() => setSidebarOpen(prev => !prev)} />
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
