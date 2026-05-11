import React from 'react'

export default function FormField({ label, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-sm font-bold text-slate-700 mr-1">{label}</label>
            {children}
        </div>
    )
}
