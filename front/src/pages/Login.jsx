import { useState } from "react";
import { useNavigate } from "react-router";
import { authService } from "../services/authService";

export default function Login() {
const [username, setUsername] = useState('');
  const [error, setError] = useState(false);
  const navigate = useNavigate();

const handleLogin = (e) => {
  e.preventDefault();
  
  // חשוב: לוודא שערך ה-username אכן מגיע מה-input
  const success = authService.login(username);
  
  if (success) {
    console.log("Login successful for:", username); // לבדיקה בקונסול
    navigate('/admin/dashboard');
  } else {
    console.log("Login failed for:", username);
    setError(true);
  }
};

  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900" dir="rtl">
      <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-sm border-b-8 border-blue-600">
        <h1 className="text-3xl font-bold text-slate-800 text-center mb-8">התחברות</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`w-full p-4 rounded-xl border-2 outline-none transition ${
              error ? 'border-red-500 bg-red-50' : 'border-slate-200 focus:border-slate-800'
            }`}
            placeholder="שם משתמש"
          />
          {error && <p className="text-red-500 text-sm font-bold">גישה למוישי בלבד!</p>}
          
          <button className="w-full bg-slate-800 text-white py-4 rounded-xl font-bold hover:bg-slate-700">
            כניסה למערכת
          </button>
        </form>
      </div>
    </div>
  );
};

