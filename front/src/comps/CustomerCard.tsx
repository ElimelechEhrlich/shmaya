// src/comps/CustomerCard.tsx

import React, { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useCustomer } from '../hooks/useCustomer';
import {
    isEmployerType as registryIsEmployerType,
    isRepresentationAllowed,
    BUSINESS_TYPE_OPTIONS,
    CLIENT_TYPE_OPTIONS,
    getCustomerDisplayName,
    getChainPosition
} from '../registries/CustomerRegistry';
import ProgressBar from './ProgressBar';
import { CreateTaskModal } from '../comps/CreateTaskModal';
import { authService } from '../services/authService'; // ודא שהנתיב לקובץ ה-Auth נכון
import { useModal } from '../contexts/ModalContext';
import { branchesList } from '../constants/branches';
import FilterableSelect from './FilterableSelect';
import PriorityBadge from './PriorityBadge';
import WhatsAppIcon from './WhatsAppIcon';



interface SectionProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

interface EditableRowProps {
    label: string;
    value: any;
    isEditing: boolean;
    category: string;
    field: string;
    onChange: (category: string, field: string, value: any) => void;
    type?: "text" | "select" | "date" | "search-select";
    options?: string[];
}

interface ToggleRowProps {
    label: string;
    icon?: React.ReactNode;
    active: boolean | undefined;
    isEditing: boolean;
    category: string | null;
    field: string;
    onChange: (category: string | null, field: string, value: any) => void;
}


type DocumentField = 'idPhotoUrl' | 'bankApprovalUrl' | 'agreementUrl';
type DocumentFileType = 'id_photo' | 'bank_approval' | 'agreement';

interface DocumentRowProps {
    label: string;
    path: string | null | undefined;
    isEditing: boolean;
    uploading: boolean;
    downloading: boolean;
    removing: boolean;
    field: DocumentField;
    fileType: DocumentFileType;
    onUpload: (field: DocumentField, fileType: DocumentFileType, file: File) => void;
    onDownload: (field: DocumentField, path: string) => void;
    onRemove: (field: DocumentField, path: string) => void;
}

interface ConfirmModalProps {
    title: string;
    body: string;
    onConfirm: () => void;
    onCancel: () => void;
}

// Sub-components
// ──────────────────────────────────────────────────────────────────

const Section: React.FC<SectionProps> = React.memo(({ title, icon, children }) => (
    <div className="card-base p-6">
        <h3 className="text-blue-700 font-black text-[11px] uppercase tracking-[0.2em] mb-5 border-b border-slate-100 pb-2 flex items-center gap-2">
            {icon && <span className="text-base">{icon}</span>}
            {title}
        </h3>
        {children}
    </div>
));

function formatDateDisplay(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
}

const EditableRow: React.FC<EditableRowProps> = React.memo(({ label, value, isEditing, category, field, onChange, type = "text", options = [] }) => (
    <div className="mb-4 last:mb-0">
        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wide">{label}</label>
        {isEditing ? (
            type === "search-select" ? ( // <-- הוסף את הבלוק הזה
                <FilterableSelect
                    options={options}
                    value={value || ''}
                    onChange={(v) => onChange(category, field, v)}
                    placeholder="הקלד לחיפוש..."
                />
            ) : type === "select" ? (
                <select className="input-style cursor-pointer" value={value} onChange={(e) => onChange(category, field, e.target.value)}>
                    <option value="">בחר...</option>
                    {options.map(o => <option key={o} value={o}>{o === 'yes' ? 'כן' : o === 'no' ? 'לא' : o}</option>)}
                </select>
            ) : (
                <input className="input-style" value={value || ''} onChange={(e) => onChange(category, field, e.target.value)} type={type} />
            )
        ) : (
            type === "select" || type === "search-select" ? (
                <span className="text-sm font-bold text-slate-800">{(value === 'yes' && 'כן') || (value === 'no' && 'לא') || value}</span>
            ) : type === "date" ? (
                <span className="text-sm font-bold text-slate-800">{value ? formatDateDisplay(value) : '---'}</span>
            ) : (
                <span className="text-sm font-bold text-slate-800">{value || '---'}</span>
            )
        )
        }
    </div>
));

const ToggleRow: React.FC<ToggleRowProps> = React.memo(({ label, icon, active, isEditing, category, field, onChange }) => (
    <div className={`flex justify-between items-center p-3 rounded-xl border transition ${active ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
        <span className={`flex items-center gap-2 text-sm font-bold ${active ? 'text-blue-700' : 'text-slate-500'}`}>
            {icon}
            {label}
        </span>
        <label className="p-2 -m-2 cursor-pointer">
            <input
                type="checkbox"
                checked={!!active}
                disabled={!isEditing}
                onChange={(e) => onChange(category, field, e.target.checked)}
                className={`w-5 h-5 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            />
        </label>
    </div>
));


const DocumentRow: React.FC<DocumentRowProps> = React.memo(({ label, path, isEditing, uploading, downloading, removing, field, fileType, onUpload, onDownload, onRemove }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const busy = uploading || downloading || removing;

    return (
        <div className="flex justify-between items-center p-3 rounded-xl border bg-white border-slate-100 mb-2 last:mb-0">
            <span className="text-sm font-bold text-slate-700">{label}</span>
            <div className="flex items-center gap-2">
                {busy ? (
                    <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                    <>
                        {path && (
                            <button
                                type="button"
                                onClick={() => onDownload(field, path)}
                                className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-800 px-2 py-1.5 rounded-lg transition"
                            >
                                הורדה
                            </button>
                        )}
                        {isEditing && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => inputRef.current?.click()}
                                    className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg border border-slate-200 transition"
                                >
                                    העלאה
                                </button>
                                <input
                                    ref={inputRef}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (file) onUpload(field, fileType, file);
                                    }}
                                />
                                {path && (
                                    <button
                                        type="button"
                                        onClick={() => onRemove(field, path)}
                                        title="הסרת קובץ"
                                        className="cursor-pointer text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg transition"
                                    >
                                        הסרה
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

const ConfirmModal: React.FC<ConfirmModalProps> = React.memo(({ title, body, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 border border-slate-200">
            <h3 className="text-lg font-black text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-600 mb-6">{body}</p>
            <div className="flex justify-end gap-3">
                <button onClick={onCancel} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition">
                    ביטול
                </button>
                <button onClick={onConfirm} className="cursor-pointer px-5 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition">
                    מחק לצמיתות
                </button>
            </div>
        </div>
    </div>
));


const CustomerCard: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const {
        editData,
        loading,
        isEditing,
        progress,
        actions,
    } = useCustomer(id);

    const modal = useModal();
    const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
    const [editingTask, setEditingTask] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
    const [downloadingFiles, setDownloadingFiles] = useState<Record<string, boolean>>({});
    const [removingFiles, setRemovingFiles] = useState<Record<string, boolean>>({});

    const handleFileUpload = useCallback(async (field: DocumentField, fileType: DocumentFileType, file: File) => {
        setUploadingFiles(prev => ({ ...prev, [field]: true }));
        const r = await actions.uploadFile(field, fileType, file);
        setUploadingFiles(prev => ({ ...prev, [field]: false }));
        if (!r.success) await modal.alert('שגיאה בהעלאת הקובץ: ' + (r.error ?? ''));
    }, [actions.uploadFile, modal]);

    const handleFileRemove = useCallback(async (field: DocumentField, path: string) => {
        const ok = await modal.confirm('למחוק את הקובץ? פעולה זו אינה הפיכה.');
        if (!ok) return;
        setRemovingFiles(prev => ({ ...prev, [field]: true }));
        const r = await actions.removeFile(field, path);
        setRemovingFiles(prev => ({ ...prev, [field]: false }));
        if (!r.success) await modal.alert('שגיאה בהסרת הקובץ: ' + (r.error ?? ''));
    }, [actions.removeFile, modal]);

    const handleFileDownload = useCallback(async (field: DocumentField, path: string) => {
        setDownloadingFiles(prev => ({ ...prev, [field]: true }));
        const r = await actions.getFileDownloadUrl(path);
        setDownloadingFiles(prev => ({ ...prev, [field]: false }));
        if (!r.success || !r.url) {
            await modal.alert('שגיאה בהפקת קישור להורדה: ' + (r.error ?? ''));
            return;
        }
        window.open(r.url, '_blank', 'noopener,noreferrer');
    }, [actions.getFileDownloadUrl, modal]);

    const handleSave = async () => {
        setIsSaving(true);
        const result = await actions.save();
        setIsSaving(false);
        if (result.success) {
            alert("הנתונים נשמרו וסונכרנו בהצלחה!");
        } else if (result.error !== 'CANCELLED') {
            alert("שגיאה בשמירה: " + result.error);
        }
    };

    const handleDeactivate = async () => {
        const ok = await modal.confirm('להעביר את הלקוח לסטטוס לא פעיל? פעולה זו תאפס את הרשויות הפעילות.');
        if (!ok) return;
        const r = await actions.deactivate();
        if (!r.success) alert("שגיאה: " + r.error);
    };

    const handleReactivate = async () => {
        const hasAnyAuthority = !!(editData?.isIncomeTaxActive || editData?.isVatActive || editData?.isInsuranceActive);
        if (!hasAnyAuthority) {
            modal.custom({
                title: 'נדרשת הפעלת רשות',
                message: 'לא ניתן להפעיל לקוח מחדש ללא רשות פעילה אחת לפחות. עבור למצב עריכה כדי להפעיל רשות.',
                buttons: [
                    { label: 'עבור לעריכה', variant: 'primary', onClick: () => actions.setEditMode(true) },
                    { label: 'ביטול', variant: 'secondary', onClick: () => { } },
                ],
            });
            return;
        }
        const r = await actions.reactivate();
        if (!r.success) alert("שגיאה: " + r.error);
    };

    const handleToggleWaitingStatus = async () => {
        const nextWaiting = !editData?.isWaiting;
        const ok = await modal.confirm(
            nextWaiting
                ? 'להחזיר את הלקוח למצב "בהמתנה"? המשימות יישארו חסומות לסימון ביצוע עד להעברה חוזרת לטיפול המשרד.'
                : 'להעביר את הלקוח לטיפול המשרד? החל מרגע זה ניתן יהיה לסמן ביצוע משימות עבורו.'
        );
        if (!ok) return;
        const r = await actions.setWaitingStatus(nextWaiting);
        if (!r.success) await modal.alert('שגיאה בעדכון הסטטוס: ' + (r.error ?? ''));
    };

    const handleDelete = async () => {
        const r = await actions.remove();
        if (r.success) {
            await modal.alert('הלקוח נמחק.');
            navigate('/admin/customers');
        } else {
            await modal.alert("שגיאה במחיקה: " + r.error);
        }
    };

    if (loading || !editData) {
        return (
            <div className="p-4 md:p-6 min-h-screen" dir="rtl">
                <div className="max-w-7xl mx-auto">
                    <div className="h-9 w-40 bg-slate-200 rounded-xl mb-6 animate-pulse" />
                    <div className="h-36 bg-slate-100 rounded-2xl mb-6 animate-pulse" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="space-y-3">
                                {[1, 2].map(j => (
                                    <div key={j} className="card-base p-6">
                                        <div className="h-3 w-24 bg-slate-200 rounded mb-4 animate-pulse" />
                                        {[1, 2, 3, 4].map(k => <div key={k} className="h-8 bg-slate-100 rounded mb-2 animate-pulse" />)}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const bType = editData.businessDetails?.businessType;
    const isEmployerType = registryIsEmployerType(editData);
    const isVatRelevant = isRepresentationAllowed(editData);
    const isInactive = editData.isActive === false;
    const monthlyFeeNum = parseFloat(String(editData.paymentDetails?.monthlyFee ?? ''));
    const directDebitDisabled = !editData.paymentDetails?.monthlyFee || isNaN(monthlyFeeNum) || monthlyFeeNum <= 0;

    return (
        <div className="p-6 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">

                {/* Actions Bar */}
                <div className="sticky top-0 z-20 bg-gray-50 flex flex-wrap justify-between items-center gap-2 mb-6">
                    <button
                        onClick={() => navigate('/admin/customers')}
                        className="cursor-pointer text-slate-500 font-bold hover:text-slate-800 transition flex items-center gap-1.5"
                    >
                        <span>→</span> חזרה לרשימה
                    </button>
                    <div className="flex gap-3 items-center">
                        {!isEditing && authService.canManageWaitingStatus() && (
                            <button onClick={handleToggleWaitingStatus} className="cursor-pointer text-sm font-bold text-orange-700 hover:text-orange-900 px-3 py-2 rounded-lg transition">
                                {editData.isWaiting ? '→ העברת לקוח לטיפול המשרד' : '↺ החזרת לקוח להמתנה'}
                            </button>
                        )}
                        {!isEditing && (
                            <>
                                {isInactive ? (
                                    <button onClick={handleReactivate} className="cursor-pointer text-sm font-bold text-green-700 hover:text-green-900 px-3 py-2 rounded-lg transition">
                                        ↻ הפעל מחדש
                                    </button>
                                ) : (
                                    <button onClick={handleDeactivate} className="cursor-pointer text-sm font-bold text-amber-700 hover:text-amber-900 px-3 py-2 rounded-lg transition">
                                        ⏸ סמן כלא פעיל
                                    </button>
                                )}
                            </>
                        )}
                        {isEditing && (
                            <button onClick={() => actions.setEditMode(false)} className="cursor-pointer text-red-500 underline font-bold px-4">ביטול</button>
                        )}
                        <button
                            onClick={isEditing ? handleSave : () => actions.setEditMode(true)}
                            disabled={isSaving}
                            className={`cursor-pointer px-8 py-2.5 rounded-xl font-black text-sm shadow-md transition ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-900 text-white hover:bg-slate-800'} ${isSaving ? 'opacity-60 cursor-not-allowed hover:bg-green-600 hover:bg-slate-900' : ''}`}
                        >
                            {isSaving ? 'שומר...' : isEditing ? '💾 שמור וסנכרן' : '✏️ עריכה'}
                        </button>
                    </div>
                </div>

                {/* Delete confirmation modal */}
                {confirmDelete && (
                    <ConfirmModal
                        title="מחיקת לקוח לצמיתות"
                        body={`האם למחוק את ${getCustomerDisplayName(editData) || 'הלקוח'} ואת כל המשימות שלו? פעולה זו אינה הפיכה.`}
                        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}

                {/* Banner */}
                <div className={`card-base p-7 mb-6 relative overflow-hidden ${isInactive ? 'opacity-75' : ''}`}>
                    <div className={`absolute top-0 right-0 w-1.5 h-full ${editData.isWaiting ? 'bg-orange-400' : 'bg-blue-600'}`}></div>
                    <div className="flex justify-between items-start gap-8 mb-5">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-700 font-bold text-[11px] rounded-full border border-blue-100">{bType || 'ללא סיווג'}</span>
                                {editData.isWaiting && <span className="inline-block px-2.5 py-0.5 bg-orange-100 text-orange-700 font-bold text-[11px] rounded-full border border-orange-300">בהמתנה</span>}
                                {isInactive && <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-500 font-bold text-[11px] rounded-full border border-slate-200">לא פעיל</span>}
                                {editData.isInsuranceActive && editData.insuranceDetails?.workHours === '9' && (
                                    <span className="inline-block px-2.5 py-0.5 bg-orange-100 text-orange-700 font-bold text-[11px] rounded-full border border-orange-300">עצמאי שאינו עונה להגדרה</span>
                                )}
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 leading-tight">{getCustomerDisplayName(editData)}</h1>
                            <p className="text-slate-500 font-medium mt-1">{editData.businessDetails?.businessName}</p>
                        </div>
                        <div className="text-left flex-shrink-0">
                            <div className="text-5xl font-black text-slate-900 leading-none">{progress}<span className="text-2xl text-slate-400">%</span></div>
                            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">ביצוע משימות</div>
                        </div>
                    </div>
                    <ProgressBar percent={progress} size="lg" label={`${progress}% הושלם`} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                    {/* Column 1 */}
                    <div className="space-y-6">
                        <Section title="פרטים אישיים" icon="👤">
                            <EditableRow label="שם מלא" value={editData.customerDetails?.fullName} isEditing={isEditing} category="customerDetails" field="fullName" onChange={actions.updateField} />
                            <EditableRow label="תעודת זהות" value={editData.customerDetails?.identityId} isEditing={isEditing} category="customerDetails" field="identityId" onChange={actions.updateField} />
                            <EditableRow label="טלפון" value={editData.customerDetails?.phoneNumber} isEditing={isEditing} category="customerDetails" field="phoneNumber" onChange={actions.updateField} />
                            <ToggleRow label="יש וואטסאפ" icon={<WhatsAppIcon size={16} />} active={editData.customerDetails?.hasWhatsapp} isEditing={isEditing} category="customerDetails" field="hasWhatsapp" onChange={actions.updateField} />
                            <EditableRow label="כתובת מגורים" value={editData.customerDetails?.address} isEditing={isEditing} category="customerDetails" field="address" onChange={actions.updateField} />
                            <EditableRow label="אימייל" value={editData.customerDetails?.email} isEditing={isEditing} category="customerDetails" field="email" onChange={actions.updateField} />
                            <EditableRow label="ת.ז. הורה" value={editData.customerDetails?.parentIdNumber} isEditing={isEditing} category="customerDetails" field="parentIdNumber" onChange={actions.updateField} />
                            <EditableRow
                                label="שנת לידה בן זוג"
                                value={editData.customerDetails?.spouseBirthYear}
                                isEditing={isEditing}
                                category="customerDetails"
                                field="spouseBirthYear"
                                onChange={actions.updateField}
                            />
                        </Section>

                        <Section title="פרטי עסק" icon="🏢">
                            <EditableRow label="שם העסק" value={editData.businessDetails?.businessName} isEditing={isEditing} category="businessDetails" field="businessName" onChange={actions.updateField} />
                            <EditableRow label="מזהה עסק" value={editData.businessDetails?.businessID} isEditing={isEditing} category="businessDetails" field="businessID" onChange={actions.updateField} />
                            <EditableRow label="סוג עסק" value={editData.businessDetails?.businessType} isEditing={isEditing} type="search-select" options={BUSINESS_TYPE_OPTIONS} category="businessDetails" field="businessType" onChange={actions.updateField} />
                          <EditableRow
    label="סוג לקוח"
    value={editData.businessDetails?.clientType}
    isEditing={isEditing}
    type="select"
    options={CLIENT_TYPE_OPTIONS}
    category="businessDetails"
    field="clientType"
    onChange={actions.updateField}
/>
                            {(editData.businessDetails?.clientType === 'עסק חדש' || editData.businessDetails?.clientType === 'לקוח עובר (עסק קיים)') && (
                                <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                    <ToggleRow
                                        label="תיק בן זוג קיים במס הכנסה"
                                        active={editData.incomeTaxDetails?.spouseFileExists}
                                        isEditing={isEditing}
                                        category="incomeTaxDetails"
                                        field="spouseFileExists"
                                        onChange={actions.updateField}
                                    />
                                    {editData.incomeTaxDetails?.spouseFileExists && (
                                        <>
                                            <ToggleRow
                                                label="נדרשת העברת ייצוג תיק בן הזוג"
                                                active={editData.incomeTaxDetails?.spouseRepresentationTransferNeeded}
                                                isEditing={isEditing}
                                                category="incomeTaxDetails"
                                                field="spouseRepresentationTransferNeeded"
                                                onChange={actions.updateField}
                                            />
                                    
                                        </>
                                    )}
                                </div>
                            )}
                            <EditableRow label="תאריך פתיחה" value={editData.businessDetails?.openingDate} isEditing={isEditing} type="date" category="businessDetails" field="openingDate" onChange={actions.updateField} />
                            <EditableRow label="שנת תחילת טיפול בתיק" value={editData.businessDetails?.caseStartYear} isEditing={isEditing} type="text" category="businessDetails" field="caseStartYear" onChange={actions.updateField} />
                            <EditableRow
                                label="משלח יד"
                                value={editData.businessDetails?.occupation}
                                isEditing={isEditing}
                                type="search-select"
                                options={branchesList}
                                category="businessDetails"
                                field="occupation"
                                onChange={actions.updateField}
                            />
                            {isEmployerType && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-3">
                                    <EditableRow label="מעסיק עובדים?" value={editData.businessDetails?.employsWorkers} isEditing={isEditing} type="select" options={['yes', 'no']} category="businessDetails" field="employsWorkers" onChange={actions.updateField} />
                                    {editData.businessDetails?.employsWorkers === 'yes' && (
                                        <EditableRow
                                            label="סטטוס תיק ניכויים"
                                            value={editData.businessDetails?.deductionsFileStatus}
                                            isEditing={isEditing}
                                            type="select"
                                            options={['נדרש לפתוח תיק ניכויים', 'תיק ניכויים כבר קיים']}
                                            category="businessDetails"
                                            field="deductionsFileStatus"
                                            onChange={actions.updateField}
                                        />
                                    )}
                                </div>
                            )}
                        </Section>

                        <Section title="מסמכים" icon="📎">
                            <DocumentRow
                                label="צילום ת.ז."
                                path={editData.idPhotoUrl}
                                isEditing={isEditing}
                                uploading={!!uploadingFiles.idPhotoUrl}
                                downloading={!!downloadingFiles.idPhotoUrl}
                                removing={!!removingFiles.idPhotoUrl}
                                field="idPhotoUrl"
                                fileType="id_photo"
                                onUpload={handleFileUpload}
                                onDownload={handleFileDownload}
                                onRemove={handleFileRemove}
                            />
                            <DocumentRow
                                label="אישור ניהול חשבון"
                                path={editData.bankApprovalUrl}
                                isEditing={isEditing}
                                uploading={!!uploadingFiles.bankApprovalUrl}
                                downloading={!!downloadingFiles.bankApprovalUrl}
                                removing={!!removingFiles.bankApprovalUrl}
                                field="bankApprovalUrl"
                                fileType="bank_approval"
                                onUpload={handleFileUpload}
                                onDownload={handleFileDownload}
                                onRemove={handleFileRemove}
                            />
                            <DocumentRow
                                label="הסכם התקשרות"
                                path={editData.agreementUrl}
                                isEditing={isEditing}
                                uploading={!!uploadingFiles.agreementUrl}
                                downloading={!!downloadingFiles.agreementUrl}
                                removing={!!removingFiles.agreementUrl}
                                field="agreementUrl"
                                fileType="agreement"
                                onUpload={handleFileUpload}
                                onDownload={handleFileDownload}
                                onRemove={handleFileRemove}
                            />
                        </Section>
                    </div>

                    {/* Column 2 */}
                    <div className="space-y-6">
                        <Section title="סטטוס רשויות" icon="🛡️">
                            <div className="space-y-2">
                                <ToggleRow label="ביטוח לאומי" active={editData.isInsuranceActive} isEditing={isEditing} category={null} field="isInsuranceActive" onChange={actions.updateField} />
                                {editData.isInsuranceActive && editData.insuranceDetails && (
                                    <div className="pr-4 border-r-2 border-blue-100 space-y-3 mt-2 mb-3">
                                        <EditableRow label="מקדמות ב״ל" value={editData.insuranceDetails?.insurancePrepayment} isEditing={isEditing} category="insuranceDetails" field="insurancePrepayment" onChange={actions.updateField} />
                                        <EditableRow label="שעות עבודה" value={editData.insuranceDetails?.workHours} isEditing={isEditing} type="select" options={['9', '25']} category="insuranceDetails" field="workHours" onChange={actions.updateField} />
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-blue-700">תיק ביטוח לאומי חדש</span>
                                            <input type="checkbox" checked={!!editData.insuranceDetails?.newInsuranceCase} disabled={!isEditing} onChange={(e) => actions.updateField('insuranceDetails', 'newInsuranceCase', e.target.checked)} className={`w-5 h-5 accent-blue-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`} />
                                        </div>
                                    </div>
                                )}

                                <ToggleRow label="מס הכנסה" active={editData.isIncomeTaxActive} isEditing={isEditing} category={null} field="isIncomeTaxActive" onChange={actions.updateField} />
                                {editData.isIncomeTaxActive && (
                                    <div className="pr-4 border-r-2 border-emerald-100 space-y-3 mt-2 mb-3">
                                        <EditableRow label="מקדמות מס" value={editData.incomeTaxDetails?.incomeTaxPrepayment} isEditing={isEditing} category="incomeTaxDetails" field="incomeTaxPrepayment" onChange={actions.updateField} />
                                        <EditableRow label="מחזור צפוי" value={editData.incomeTaxDetails?.annualTurnover} isEditing={isEditing} category="incomeTaxDetails" field="annualTurnover" onChange={actions.updateField} />
                                        <EditableRow label="סוג ייצוג" value={editData.incomeTaxDetails?.repType} isEditing={isEditing} type="select" options={['ראשי', 'משני']} category="incomeTaxDetails" field="repType" onChange={actions.updateField} />
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-emerald-700">תיק מס הכנסה חדש</span>
                                            <input type="checkbox" checked={!!editData.incomeTaxDetails?.newItCase} disabled={!isEditing} onChange={(e) => actions.updateField('incomeTaxDetails', 'newItCase', e.target.checked)} className={`w-5 h-5 accent-emerald-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`} />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-emerald-700">נדרש הוראת קבע</span>
                                            <input type="checkbox" checked={editData.incomeTaxDetails?.needsIncomeTaxDirectDebit ?? true} disabled={!isEditing} onChange={(e) => actions.updateField('incomeTaxDetails', 'needsIncomeTaxDirectDebit', e.target.checked)} className={`w-5 h-5 accent-emerald-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`} />
                                        </div>
                                    </div>
                                )}

                                {isVatRelevant && (
                                    <>
                                        <ToggleRow label="מע״מ" active={editData.isVatActive} isEditing={isEditing} category={null} field="isVatActive" onChange={actions.updateField} />
                                        {editData.isVatActive && (
                                            <div className="pr-4 border-r-2 border-amber-100 space-y-3 mt-2 mb-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-amber-700">תיק מע״מ חדש</span>
                                                    <input type="checkbox" checked={!!editData.vatDetails?.newVatCase} disabled={!isEditing} onChange={(e) => actions.updateField('vatDetails', 'newVatCase', e.target.checked)} className={`w-5 h-5 accent-amber-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`} />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </Section>

                        <Section title="תשלומים למשרד" icon="💰">
                            <EditableRow label="פתיחת תיק (₪)" value={editData.paymentDetails?.setupFee} isEditing={isEditing} category="paymentDetails" field="setupFee" onChange={actions.updateField} />
                            {parseFloat(String(editData.paymentDetails?.setupFee ?? '')) > 0 && (
                                <div className="flex items-center gap-3 pr-1 pb-1">
                                    <span className="text-xs font-bold text-green-700">שולם</span>
                                    <input
                                        type="checkbox"
                                        checked={!!editData.paymentDetails?.setupFeePaid}
                                        disabled={!isEditing}
                                        onChange={(e) => actions.updateField('paymentDetails', 'setupFeePaid', e.target.checked)}
                                        className={`w-5 h-5 accent-green-600 ${isEditing ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                                    />
                                </div>
                            )}
                            <EditableRow label="ריטיינר חודשי (₪)" value={editData.paymentDetails?.monthlyFee} isEditing={isEditing} category="paymentDetails" field="monthlyFee" onChange={actions.updateField} />
                            <div className={`mt-3 p-3 rounded-xl flex justify-between items-center border ${editData.paymentDetails?.directDebit ? 'bg-green-50 border-green-200 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                <span className="text-xs font-bold uppercase tracking-wide">הוראת קבע</span>
                                {isEditing ? (
                                    <button
                                        onClick={() => actions.updateField('paymentDetails', 'directDebit', !editData.paymentDetails?.directDebit)}
                                        disabled={directDebitDisabled}
                                        className={`px-4 py-1 rounded-full text-[10px] font-black transition bg-green-600 text-white ${directDebitDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        {editData.paymentDetails?.directDebit ? 'הוקם' : 'לא הוקם'}
                                    </button>
                                ) : (
                                    <span className="text-sm font-bold">{editData.paymentDetails?.directDebit ? 'הוקם ✓' : 'לא הוקם'}</span>
                                )}
                            </div>
                        </Section>

                        <Section title="הערות" icon="📝">
                            {isEditing ? (
                                <textarea className="input-style h-28" value={editData.comments || ''} onChange={(e) => actions.updateField(null, 'comments', e.target.value)} />
                            ) : (
                                <p className="text-sm text-slate-600 italic leading-relaxed">{editData.comments || 'אין הערות נוספות.'}</p>
                            )}
                        </Section>
                    </div>

                    {/* ✨ סעיף 3: אזור המשימות המעודכן, הפרופורציונלי והחסין להרשאות עובדים */}
                    <div className="space-y-6">
                        <Section title="משימות" icon="📋">
                            {(!editData?.tasks || editData.tasks.length === 0) ? (
                                <p className="text-sm text-slate-400 italic text-center py-8">לא נוצרו משימות עדיין.</p>
                            ) : (
                                <div className="space-y-4">
                                    {editData.tasks.map((task: any) => (
                                        <div key={task.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                            {/* כותרת קבוצת משימת האב וסעיף 2 סימון גורף */}
                                            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-3">
                                                <h4 className="text-sm font-black text-slate-850 flex items-center gap-1.5">
                                                    <span>📂</span> {task.title}
                                                </h4>
                                                <button
                                                    type="button"
                                                    disabled={!!editData.isWaiting}
                                                    onClick={() => {
                                                        if (editData.isWaiting) return;
                                                        actions.toggleTaskStatus(task.id, task.status);
                                                    }}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition border ${editData.isWaiting ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : task.status === 'completed' ? 'cursor-pointer bg-green-50 text-green-700 border-green-200' : 'cursor-pointer bg-slate-900 text-white hover:bg-slate-800'}`}
                                                >
                                                    {task.status === 'completed' ? '✓ הכל בוצע' : 'סמן הכל כבוצע'}
                                                </button>
                                            </div>

                                            {/* תתי המשימות הפנימיות בשורות שטוחות ויפות */}
                                            <div className="space-y-2">
                                                {(task.subTasks || []).map((sub: any) => {
                                                    const dependency = sub.dependsOn
                                                        ? (task.subTasks || []).find((s: any) => s.registryKey === sub.dependsOn)
                                                        : undefined;
                                                    const isBlockedByDependency = !!dependency && !dependency.completed;
                                                    const isLocked = !!sub.restrictedTo && authService.getCurrentUser() !== sub.restrictedTo;
                                                    const isDisabled = !!editData.isWaiting || isBlockedByDependency || (isLocked && !sub.completed);
                                                    const chainPosition = getChainPosition(task.subTasks || [], sub);
                                                    const checkboxTitle = isBlockedByDependency ? 'יש להשלים קודם את תת-המשימה הקודמת' : (isLocked ? `מוגבל ל-${sub.restrictedTo}` : undefined);
                                                    const handleCheckboxChange = (checked: boolean) => {
                                                        if (editData.isWaiting) {
                                                            alert("הלקוח במצב \"בהמתנה\" — לא ניתן לסמן ביצוע משימות עד להעברה לטיפול המשרד.");
                                                            return;
                                                        }
                                                        if (!authService.canEditRestricted(sub.restrictedTo)) {
                                                            alert(`אין לך הרשאה לשנות את הסטטוס של משימה זו — מוגבלת ל-${sub.restrictedTo} בלבד!`);
                                                            return;
                                                        }
                                                        if (isBlockedByDependency) {
                                                            alert('יש להשלים קודם את תת-המשימה הקודמת בשרשרת.');
                                                            return;
                                                        }
                                                        actions.setSubtaskCompleted(task.id, sub.id, checked);
                                                    };
                                                    return (
                                                        <div key={sub.id} className={`flex items-center justify-between p-2 rounded-lg border transition ${sub.completed ? 'bg-green-50/50 border-green-150' : 'bg-slate-50/50 border-slate-150'}`}>
                                                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                                                {chainPosition ? (
                                                                    <span className="relative flex items-center shrink-0" title={checkboxTitle}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!sub.completed}
                                                                            disabled={isDisabled}
                                                                            onChange={(e) => handleCheckboxChange(e.target.checked)}
                                                                            className="peer sr-only"
                                                                        />
                                                                        <span className={`relative w-4 h-4 rounded-full border-2 border-slate-300
                                                                                         peer-checked:border-blue-500 peer-checked:bg-blue-500
                                                                                         transition-all duration-200 flex items-center justify-center
                                                                                         shrink-0 select-none ${isDisabled ? 'opacity-50' : 'hover:border-slate-400'}`}>
                                                                            {chainPosition.hasPrev && <span className="absolute -top-2.5 right-1/2 translate-x-1/2 w-px h-2.5 bg-slate-300" />}
                                                                            {chainPosition.hasNext && <span className="absolute -bottom-2.5 right-1/2 translate-x-1/2 w-px h-2.5 bg-slate-300" />}
                                                                            <span className="peer-checked:hidden text-[8px] font-black text-slate-400">{chainPosition.position}</span>
                                                                            <span className="hidden peer-checked:inline text-white text-[9px] font-black">✓</span>
                                                                        </span>
                                                                    </span>
                                                                ) : (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!sub.completed}
                                                                        disabled={isDisabled}
                                                                        title={checkboxTitle}
                                                                        onChange={(e) => handleCheckboxChange(e.target.checked)}
                                                                        className={`w-4 h-4 rounded text-blue-600 accent-blue-600 flex-shrink-0 ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                                                                    />
                                                                )}
                                                                <span className={`text-xs font-medium truncate ${sub.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                                                                    {sub.title}
                                                                </span>
                                                            </label>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <PriorityBadge
                                                                    priority={sub.priority}
                                                                    onChange={(p) => actions.updateSubTaskPriority(task.id, sub.id, p as any)}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    title="פתח חלון עריכה מלא"
                                                                    onClick={() => setEditingTask({ ...sub, taskId: task.id, customerName: editData.customerDetails?.fullName || '' })}
                                                                    className="text-slate-400 hover:text-blue-600 px-1 text-sm font-bold cursor-pointer"
                                                                >
                                                                    ✎
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>
                </div>

                {/* ✨ כפתור המחיקה יוצג ויופעל רק עבור משתמשים מורשים (מוישי) */}
                {authService.canDelete() && (
                    <div className="sticky bottom-0 z-20 bg-gray-50 mt-12 pt-6 pb-4 border-t border-slate-200 flex justify-start">
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="text-[11px] font-bold text-red-400 hover:text-red-700 bg-red-50/40 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-200 transition shadow-sm cursor-pointer"
                        >
                            🗑️ הסר לקוח מהמערכת
                        </button>
                    </div>
                )}
            </div>

            {/* הזרקת חלון המשימה המקורי והמנורמל של המערכת שלך בתחתית הדף */}
            {editingTask && (
                <CreateTaskModal
                    customers={[]}
                    onClose={() => setEditingTask(null)}
                    onCreated={() => {
                        setEditingTask(null);
                        actions.reload();
                    }}
                    taskToEdit={{
                        taskId: editingTask.taskId,
                        subtaskId: editingTask.id,
                        subtaskTitle: editingTask.title,
                        parentTaskId: editingTask.taskId,
                        parentTitle: '',
                        clientId: id || null,
                        customerName: editingTask.customerName,
                        completed: !!editingTask.completed,
                        priority: editingTask.priority || 'medium',
                        comment: editingTask.comment || ''
                    }}
                />
            )}
        </div>
    );
};

// ──────────────────────────────────────────────────────────────────

export default CustomerCard;
