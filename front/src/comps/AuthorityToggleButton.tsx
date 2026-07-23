// src/comps/AuthorityToggleButton.tsx
//
// Unified button-style toggle for the three "רשויות לטיפול" flags
// (isInsuranceActive / isIncomeTaxActive / isVatActive). Replaces the
// checkbox-based toggles previously used in NewCustomerPrecheckModal,
// AddCustomer and CustomerCard so all three surfaces render identically.

import React from 'react';

interface AuthorityToggleButtonProps {
    label: string;
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    /** Header-style usage (AddCustomer's per-authority Card) stretches to fill its row. */
    fullWidth?: boolean;
}

const AuthorityToggleButton: React.FC<AuthorityToggleButtonProps> = ({ label, active, disabled, onClick, fullWidth }) => (
    <button
        type="button"
        disabled={disabled}
        aria-pressed={active}
        onClick={onClick}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition select-none
            ${fullWidth ? 'w-full justify-center' : ''}
            ${active
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}
            ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
        <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-white' : 'bg-slate-300'}`} />
        {label}
    </button>
);

export default AuthorityToggleButton;
