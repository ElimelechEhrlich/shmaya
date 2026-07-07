// src/comps/AppModal.tsx
import React from 'react';

export type ModalVariant = 'primary' | 'danger' | 'secondary';

export interface ModalButton {
    label: string;
    onClick: () => void;
    variant?: ModalVariant;
}

export interface ModalOptions {
    title?: string;
    message: string;
    buttons: ModalButton[];
    autoCloseMs?: number;
}

interface AppModalProps {
    options: ModalOptions | null;
}

const variantClass: Record<ModalVariant, string> = {
    primary:   'bg-blue-600 hover:bg-blue-700 text-white',
    danger:    'bg-red-600 hover:bg-red-700 text-white',
    secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800',
};

export default function AppModal({ options }: AppModalProps): React.ReactElement | null {
    if (!options) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" dir="rtl">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4
                            animate-[modalIn_0.2s_ease_both] max-h-[90vh] overflow-y-auto">

                {/* כותרת */}
                {options.title && (
                    <h2 className="text-lg font-black text-slate-900 text-right">
                        {options.title}
                    </h2>
                )}

                {/* הודעה */}
                <p className="text-sm text-slate-600 text-right leading-relaxed whitespace-pre-line">
                    {options.message}
                </p>

                {/* כפתורים */}
                <div className="flex gap-2 flex-row-reverse pt-1">
                    {options.buttons.map((btn, i) => (
                        <button
                            key={i}
                            onClick={btn.onClick}
                            className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition
                                        ${variantClass[btn.variant ?? 'secondary']}`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
