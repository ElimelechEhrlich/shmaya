// src/comps/OfficeTaskModal.tsx
import React, { useState } from 'react';
import { PersistenceAdapter } from '../services/PersistenceAdapter';
import { PRIORITY_LEVELS, PRIORITY_STYLES } from '../registries/CustomerRegistry';

export interface OfficeSubtaskEdit {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    comment: string;
}

interface OfficeTaskModalProps {
    subtaskToEdit: OfficeSubtaskEdit | null;
    onClose: () => void;
    onSaved: () => void;
}

export const OfficeTaskModal: React.FC<OfficeTaskModalProps> = ({ subtaskToEdit, onClose, onSaved }) => {
    const [title, setTitle] = useState<string>(subtaskToEdit?.title ?? '');
    const [priority, setPriority] = useState<string>(subtaskToEdit?.priority ?? 'medium');
    const [comment, setComment] = useState<string>(subtaskToEdit?.comment ?? '');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setErr('');
        if (!title.trim()) { setErr('כותרת חובה'); return; }

        setSaving(true);
        try {
            if (subtaskToEdit) {
                const unchanged = title.trim() === subtaskToEdit.title
                    && priority === subtaskToEdit.priority
                    && comment.trim() === (subtaskToEdit.comment ?? '');

                if (!unchanged) {
                    const { error } = await PersistenceAdapter.updateSubtask(subtaskToEdit.id, '', {
                        title: title.trim(),
                        priority,
                        comment: comment.trim(),
                    });
                    if (error) throw new Error(error.message);
                }
            } else {
                const { error } = await PersistenceAdapter.insertOfficeSubtask(title.trim(), priority, comment.trim());
                if (error) throw new Error(error.message);
            }

            setSaving(false);
            onSaved();
        } catch (error: any) {
            console.error('Error in OfficeTaskModal handleSubmit:', error);
            setErr(error.message || 'שגיאה בשמירת הנתונים במערכת');
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="text-xl font-black text-slate-900">
                            {subtaskToEdit ? 'עריכת משימת משרד' : 'משימת משרד חדשה'}
                        </h3>
                        <button type="button" onClick={onClose} className="cursor-pointer text-slate-400 hover:text-slate-700 text-xl">×</button>
                    </div>

                    <div className="p-6 space-y-5">
                        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{err}</div>}

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">שם המשימה *</label>
                            <input
                                value={title}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                                className="input-style"
                                placeholder="הקלד את כותרת המשימה..."
                                required
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">רמת עדיפות</label>
                            <div className="flex gap-2">
                                {PRIORITY_LEVELS.map((p: any) => {
                                    const style = PRIORITY_STYLES[p as 'low' | 'medium' | 'high'] || PRIORITY_STYLES['medium'];
                                    const selected = priority === p;
                                    return (
                                        <button
                                            type="button"
                                            key={p}
                                            onClick={() => setPriority(p)}
                                            className={`cursor-pointer flex-1 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition border ${selected ? `${style?.bg || ''} ${style?.text || ''} ${style?.border || ''}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {style?.label || p}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 tracking-wide">הערה</label>
                            <textarea
                                value={comment}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                                className="input-style h-20 resize-none py-2"
                                placeholder="הערה..."
                            />
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                        <button type="button" onClick={onClose} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition">ביטול</button>
                        <button type="submit" disabled={saving} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white transition">
                            {saving ? 'שומר...' : 'שמור'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OfficeTaskModal;
