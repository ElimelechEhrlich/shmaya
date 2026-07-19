import React, { useState } from 'react';

interface SearchableMultiSelectProps {
    label: string;
    options: [string, string][];
    selected: string[];
    onChange: (selected: string[]) => void;
    searchable?: boolean;
}

const SearchableMultiSelect: React.FC<SearchableMultiSelectProps> = React.memo(
    ({ label, options, selected, onChange, searchable }) => {
        const [open, setOpen] = useState(false);
        const [query, setQuery] = useState('');

        const summary =
            selected.length === 0
                ? 'הכל'
                : selected.length === 1
                ? (options.find(([v]) => v === selected[0])?.[1] ?? selected[0])
                : `${selected.length} נבחרו`;

        const toggle = (val: string) => {
            if (selected.includes(val)) onChange(selected.filter(v => v !== val));
            else onChange([...selected, val]);
        };

        const visibleOptions =
            searchable && query
                ? options.filter(([_, lbl]) => lbl.toLowerCase().includes(query.toLowerCase()))
                : options;

        const handleClose = () => { setOpen(false); setQuery(''); };

        return (
            <div className="relative" dir="rtl">
                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    className="cursor-pointer w-full input-style text-right flex justify-between items-center bg-white border rounded-xl p-2.5 text-sm"
                >
                    <span className="text-xs text-slate-400 font-bold">{label}: </span>
                    <span className="text-sm font-medium truncate mx-1">{summary}</span>
                    <svg viewBox="0 0 20 20" fill="#94a3b8" style={{ width: '0.85rem', height: '0.85rem' }} className="shrink-0">
                        <path d="M5 7l5 6 5-6H5z" />
                    </svg>
                </button>

                {open && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={handleClose} />
                        <div className="absolute top-full mt-1 right-0 left-0 z-20 bg-white border border-slate-200 rounded-xl shadow-xl">
                            <div className="sticky top-0 bg-white border-b border-slate-100">
                                {searchable && (
                                    <div className="p-2 border-b border-slate-100">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={query}
                                            onChange={e => setQuery(e.target.value)}
                                            placeholder="חפש..."
                                            className="input-style text-sm"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </div>
                                )}
                                <div className="flex justify-between p-2">
                                    <button
                                        type="button"
                                        onClick={() => onChange(visibleOptions.map(([v]) => v))}
                                        className="cursor-pointer text-[11px] text-blue-600 font-bold hover:underline"
                                    >בחר הכל</button>
                                    <button
                                        type="button"
                                        onClick={() => onChange([])}
                                        className="cursor-pointer text-[11px] text-slate-500 font-bold hover:underline"
                                    >נקה</button>
                                </div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {visibleOptions.map(([val, lbl]) => (
                                    <label key={val} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(val)}
                                            onChange={() => toggle(val)}
                                            className="cursor-pointer accent-blue-600 w-4 h-4"
                                        />
                                        <span className="text-sm text-slate-700">{lbl}</span>
                                    </label>
                                ))}
                                {visibleOptions.length === 0 && (
                                    <div className="p-4 text-center text-xs text-slate-400 italic">אין תוצאות</div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }
);

export default SearchableMultiSelect;
