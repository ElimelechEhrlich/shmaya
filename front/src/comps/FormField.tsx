// src/comps/FormField.tsx
import React from 'react';

// הגדרת הטיפוסים של הפרופס עבור קלט הטופס
interface FormFieldProps {
    label: string;
    children: React.ReactNode;
}

export default function FormField({ label, children }: FormFieldProps): React.ReactElement {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-sm font-bold text-slate-700 mr-1">{label}</label>
            {children}
        </div>
    );
}