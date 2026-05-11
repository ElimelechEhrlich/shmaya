import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { TaskGeneratorService } from '../services/TaskService';

const CustomerCard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
const [editData, setEditData] = useState(null);

    useEffect(() => {
        fetchCustomerData();
    }, [id]);
const handleUpdateCustomer = async () => {
    const { error } = await supabase
        .from('clients')
        .update({
            customerDetails: editData?.customerDetails,
            businessDetails: editData?.businessDetails
        })
        .eq('id', id);

    if (error) {
        alert("שגיאה בעדכון: " + error.message);
    } else {
        setCustomer(editData);
        setIsEditing(false);
    }
};
    const fetchCustomerData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('clients')
            .select(`*, tasks(*)`) // שליפת הלקוח וכל המשימות שלו
            .eq('id', id)
            .single();

        if (error) console.error("Error:", error.message);
        else setCustomer(data);
        setLoading(false);
    };

    const toggleTaskStatus = async (taskId, currentStatus) => {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus })
            .eq('id', taskId);

        if (!error) {
            setCustomer(prev => ({
                ...prev,
                tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
            }));
        }
    };
    const handleSaveCustomer = async () => {
        const { error } = await supabase
            .from('clients')
            .update({
                customerDetails: editData?.customerDetails,
                businessDetails: editData?.businessDetails
            })
            .eq('id', id);

        if (error) alert("שגיאה בעדכון");
        else {
            setCustomer(editData);
            setIsEditing(false);
        }
    };
    // const fetchCustomerData = async () => {
    //     setLoading(true);
    //     const { data, error } = await supabase
    //         .from('clients').select(`*, tasks(*)`).eq('id', id).single();

    //     if (!error) {
    //         setCustomer(data);
    //         setEditData(data); // מאתחל את נתוני העריכה
    //     }
    //     setLoading(false);
    // };
const handleInputChange = (section, field, value) => {
    setEditData(prev => {
        // הגנה: אם אין נתונים קודמים, אל תעשה כלום
        if (!prev) return prev; 
        
        return {
            ...prev,
            [section]: { 
                ...prev[section], 
                [field]: value 
            }
        };
    });
};
if (loading ) {
    return (
        <div className="flex justify-center items-center h-screen">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="mr-3 text-lg font-bold">טוען נתוני לקוח...</span>
        </div>
    );
}    if (!customer) return <div className="p-10 text-center">לקוח לא נמצא</div>;

    const progress = TaskGeneratorService.calculateProgress(customer.tasks || []);

    return (
        <div className="p-6 bg-gray-50 min-h-screen rtl text-right">
{/* כותרת וכפתורי פעולה */}
                <div className="flex justify-between items-center mb-6">
                    <button onClick={() => navigate('/admin/customers')} className="text-blue-600">➜ חזרה</button>
                    <button 
                        onClick={isEditing ? handleSaveCustomer : () => setIsEditing(true)}
                        className={`px-6 py-2 rounded-lg font-bold shadow-md ${isEditing ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}
                    >
                        {isEditing ? '💾 שמור שינויים' : '✏️ ערוך פרטי לקוח'}
                    </button>
                </div>

            {/* Header */}
            <div className="bg-white p-6 rounded-xl shadow-sm mb-6 flex justify-between items-center border-r-8 border-blue-600">
                <div>
                    <h1 className="text-3xl font-bold">{customer.customerDetails?.fullName}</h1>
                    <p className="text-gray-500">מזהה עסק: {customer.businessDetails?.businessID}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-xs text-blue-400">התקדמות</div>
                    <div className="text-2xl font-bold text-blue-700">{progress}%</div>
                </div>
            </div>

<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-right">                {/* פרטי לקוח */}
                <div className="space-y-6">
<div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-blue-700 mb-4 border-b pb-2">👤 פרטי הלקוח</h3>
            <div className="space-y-2">
                <DetailRow label="שם מלא" value={customer.customerDetails?.fullName} isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange}/>
                <DetailRow label="תעודת זהות" value={customer.customerDetails?.identityId}isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange} />
                <DetailRow label="טלפון" value={customer.customerDetails?.phoneNumber} isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange}/>
                <DetailRow label="אימייל" value={customer.customerDetails?.email}isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange} />
                <DetailRow label="כתובת" value={customer.customerDetails?.address}isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange} />
            </div>
        </div>

        {/* כרטיס פרטי עסק */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-blue-700 mb-4 border-b pb-2">🏢 פרטי העסק</h3>
            <div className="space-y-2">
                <DetailRow label="שם העסק" value={customer.businessDetails?.businessName}isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange} />
                <DetailRow label="מספר עוסק/ח.פ" value={customer.businessDetails?.businessID} isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange}/>
                <DetailRow label="סוג עסק" value={customer.businessDetails?.businessType} isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange}/>
                <DetailRow label="מהות העיסוק" value={customer.businessDetails?.occupation}isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange} />
                <DetailRow label="מעסיק עובדים?" value={customer.businessDetails?.employsWorkers === 'yes' ? 'כן' : 'לא'} isEditing={isEditing} section="businessDetails" field="businessName" onChange={handleInputChange}/>
            </div>
        </div>

        {/* כרטיס סטטוס ביטוחים ומיסים */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-blue-700 mb-4 border-b pb-2">🛡️ ביטוחים ומיסים</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <StatusTag label="ביטוח לאומי" active={customer.isInsuranceActive} />
                <StatusTag label="מס הכנסה" active={customer.isIncomeTaxActive} />
                <StatusTag label="מע''מ" active={customer.isVatActive} />
            </div>
        </div>
    </div>

                {/* רשימת משימות */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-6 rounded-xl shadow-sm">
                        <h3 className="text-xl font-bold mb-6">משימות פתוחות</h3>
                        <div className="space-y-3">
                            {customer.tasks?.map(task => (
                                <div key={task.id} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition-all">
                                    <div>
                                        <span className={`block font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                                            {task.title}
                                        </span>
                                        {task.restricted_to && <small className="text-red-500 font-bold">🔒 {task.restricted_to}</small>}
                                    </div>
                                    <button 
                                        onClick={() => toggleTaskStatus(task.id, task.status)}
                                        className={`px-4 py-1 rounded-full text-xs font-bold ${
                                            task.status === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'
                                        }`}
                                    >
                                        {task.status === 'completed' ? 'בוצע' : 'סמן כבוצע'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailRow = ({ label, value, isEditing, onChange, name }) => (
    <div className="flex flex-col border-b border-gray-50 py-2">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        {isEditing ? (
            <input 
                type="text" 
                value={value || ''} 
                onChange={(e) => onChange(name, e.target.value)}
                className="mt-1 p-1 border rounded text-sm focus:ring-2 focus:ring-blue-500"
            />
        ) : (
            <span className="text-gray-700 font-semibold">{value || '---'}</span>
        )}
    </div>
);

const StatusTag = ({ label, active }) => (
    <div className={`p-2 rounded text-center border ${active ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
        <div className="text-xs">{label}</div>
        <div className="font-bold">{active ? 'פעיל' : 'לא פעיל'}</div>
    </div>
);

export default CustomerCard;