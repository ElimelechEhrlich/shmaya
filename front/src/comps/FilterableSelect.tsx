import React, { useState } from 'react';

interface FilterableSelectProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

const FilterableSelect: React.FC<FilterableSelectProps> = ({ options, value, onChange, placeholder = 'בחר...' }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const close = () => {
        setOpen(false);
        setQuery('');
    };

    const filtered = query
        ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
        : options;

    return (
        <div className="relative" dir="rtl">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="cursor-pointer w-full input-style text-right flex justify-between items-center"
            >
                <span className={value ? 'text-slate-800' : 'text-slate-400'}>
                    {value || placeholder}
                </span>
                <span className="text-slate-400 text-xs mr-2">▾</span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={close} />

                    <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl">
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                            <input
                                type="text"
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="חפש..."
                                className="input-style"
                                onClick={e => e.stopPropagation()}
                            />
                        </div>

                        <div className="max-h-60 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-4">אין תוצאות</p>
                            ) : (
                                filtered.map(opt => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => { onChange(opt); close(); }}
                                        className={`cursor-pointer w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition
                                            ${opt === value ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'}`}
                                    >
                                        {opt}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default FilterableSelect;
