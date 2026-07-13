// src/comps/NewCustomerPrecheckModal.tsx
//
// Pre-check modal shown before AddCustomer.tsx. Collects business type,
// client type, spousal income-tax fields, and which authorities to handle —
// then hands everything to AddCustomer via navigate(..., { state }). Nothing
// here touches the DB; cancelling has zero side effects.

import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
    BUSINESS_TYPE_OPTIONS,
    CLIENT_TYPE_OPTIONS,
    isEmployerType,
    type BusinessTypeKey,
    type ClientTypeKey,
    type Customer,
} from '../registries/CustomerRegistry';
import FilterableSelect from './FilterableSelect';

export interface NewCustomerPrecheckState {
    businessType: BusinessTypeKey;
    employsWorkers?: 'yes' | 'no';
    clientType: ClientTypeKey;
    spouseFileExists?: boolean;
    spouseRepresentationTransferNeeded?: boolean;
    isInsuranceActive: boolean;
    isIncomeTaxActive: boolean;
    isVatActive: boolean;
}

interface NewCustomerPrecheckModalProps {
    onClose: () => void;
}

const NewCustomerPrecheckModal: React.FC<NewCustomerPrecheckModalProps> = ({ onClose }) => {
    const navigate = useNavigate();

    const [businessType, setBusinessType] = useState<string>('');
    const [employsWorkers, setEmploysWorkers] = useState<'yes' | 'no' | ''>('');
    const [clientType, setClientType] = useState<string>('');
    const [spouseFileExists, setSpouseFileExists] = useState(false);
    const [spouseRepresentationTransferNeeded, setSpouseRepresentationTransferNeeded] = useState(false);
    const [isInsuranceActive, setIsInsuranceActive] = useState(false);
    const [isIncomeTaxActive, setIsIncomeTaxActive] = useState(false);
    const [isVatActive, setIsVatActive] = useState(false);

    const showsEmployerFields = businessType
        ? isEmployerType({ businessDetails: { businessType } } as unknown as Customer)
        : false;
    const showsSpouseFile = clientType === 'עסק חדש' || clientType === 'לקוח עובר (עסק קיים)';

    const canContinue =
        !!businessType &&
        (!showsEmployerFields || !!employsWorkers) &&
        !!clientType;

    const handleContinue = () => {
        if (!canContinue) return;
        const state: NewCustomerPrecheckState = {
            businessType: businessType as BusinessTypeKey,
            employsWorkers: showsEmployerFields ? (employsWorkers as 'yes' | 'no') : undefined,
            clientType: clientType as ClientTypeKey,
            spouseFileExists: showsSpouseFile ? spouseFileExists : undefined,
            spouseRepresentationTransferNeeded: showsSpouseFile && spouseFileExists ? spouseRepresentationTransferNeeded : undefined,
            isInsuranceActive,
            isIncomeTaxActive,
            isVatActive,
        };
        navigate('/admin/customers/new', { state });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
                <div className="p-6 space-y-5">
                    <h2 className="text-xl font-black text-slate-900">לקוח חדש — פרטים ראשוניים</h2>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700">סוג עסק</label>
                        <FilterableSelect
                            options={BUSINESS_TYPE_OPTIONS}
                            value={businessType}
                            onChange={setBusinessType}
                            placeholder="בחר סוג עסק..."
                        />
                    </div>

                    {showsEmployerFields && (
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700">מעסיק עובדים?</label>
                            <select
                                className="input-style cursor-pointer"
                                value={employsWorkers}
                                onChange={(e) => setEmploysWorkers(e.target.value as 'yes' | 'no' | '')}
                            >
                                <option value="">בחר...</option>
                                <option value="yes">כן</option>
                                <option value="no">לא</option>
                            </select>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700">סוג לקוח</label>
                        <select
                            className="input-style cursor-pointer"
                            value={clientType}
                            onChange={(e) => setClientType(e.target.value)}
                        >
                            <option value="">בחר...</option>
                            {CLIENT_TYPE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    </div>

                    {showsSpouseFile && (
                        <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-5 h-5 cursor-pointer accent-blue-600"
                                    checked={spouseFileExists}
                                    onChange={(e) => setSpouseFileExists(e.target.checked)}
                                />
                                <span className="text-sm font-bold text-slate-700">תיק בן זוג קיים במס הכנסה</span>
                            </label>
                            {spouseFileExists && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 cursor-pointer accent-blue-600"
                                        checked={spouseRepresentationTransferNeeded}
                                        onChange={(e) => setSpouseRepresentationTransferNeeded(e.target.checked)}
                                    />
                                    <span className="text-sm font-bold text-slate-700">נדרשת העברת ייצוג תיק בן הזוג</span>
                                </label>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">לטיפולנו / רשויות לטיפול</label>
                        <div className="flex flex-wrap gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-5 h-5 cursor-pointer accent-blue-600" checked={isInsuranceActive} onChange={(e) => setIsInsuranceActive(e.target.checked)} />
                                <span className="text-sm text-slate-600">ביטוח לאומי</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-5 h-5 cursor-pointer accent-blue-600" checked={isIncomeTaxActive} onChange={(e) => setIsIncomeTaxActive(e.target.checked)} />
                                <span className="text-sm text-slate-600">מס הכנסה</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-5 h-5 cursor-pointer accent-blue-600" checked={isVatActive} onChange={(e) => setIsVatActive(e.target.checked)} />
                                <span className="text-sm text-slate-600">מע״מ</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="cursor-pointer px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition"
                        >
                            ביטול
                        </button>
                        <button
                            type="button"
                            onClick={handleContinue}
                            disabled={!canContinue}
                            className={`px-6 py-2.5 rounded-xl text-sm font-black text-white transition ${canContinue ? 'cursor-pointer bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}
                        >
                            המשך
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewCustomerPrecheckModal;
