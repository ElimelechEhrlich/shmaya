// src/services/authService.ts

// ✨ עדכון: רשימת המשתמשים המורשים במשרד (סעיף 6)
export const ALLOWED_USERS: string[] = ["מוישי", "יוחנן", "שמוליק"];

// הגדרת המבנה (Interface) של שירות ה-Auth - נשאר זהה לחלוטין
export interface AuthService {
  login(username: string | null | undefined): boolean;
  isAuthenticated(): boolean;
  logout(): void;
  getCurrentUser(): string | null;
  canDelete(): boolean;                  // ✨ פונקציית עזר חדשה להרשאת מחיקה
  canApproveFinal(title: string): boolean; // ✨ פונקציית עזר חדשה לאישור ניהול סופי
}

export const authService: AuthService = {
  login(username: string | null | undefined): boolean {
    // ניקוי רווחים מהקלט של המשתמש בצורה בטוחה
    const cleanUsername: string = username ? username.trim() : "";

    // ✨ תיקון: בודק אם המשתמש קיים ברשימת העובדים המורשים
    if (ALLOWED_USERS.includes(cleanUsername)) {
      localStorage.setItem('user_name', cleanUsername);
      localStorage.setItem('is_authenticated', 'true');
      return true; // מאשר כניסה גם ליוחנן ושמוליק!
    }
    
    // אם המשתמש לא מורשה - ננקה את הזיכרון לביטחון
    this.logout();
    return false;
  },

  isAuthenticated(): boolean {
    return localStorage.getItem('is_authenticated') === 'true';
  },

  logout(): void {
    localStorage.removeItem('user_name');
    localStorage.removeItem('is_authenticated');
  },

  getCurrentUser(): string | null {
    return localStorage.getItem('user_name');
  },

  // ✨ סעיף 6 + 10: פונקציה הבודקת האם המשתמש המחובר רשאי למחוק לקוחות
  canDelete(): boolean {
    const user = this.getCurrentUser();
    if (user === 'יוחנן' || user === 'שמוליק') return false;
    return true; // מוישי/אדמין מורשה למחוק
  },

  // ✨ סעיף 6: פונקציה הבודקת האם המשתמש רשאי לסמן "אישור ניהול סופי"
// בתוך src/services/authService.ts

canApproveFinal(subtaskTitle: string): boolean {
    const user = this.getCurrentUser();
    
    // בודק בצורה גמישה וחסינה האם הטקסט מכיל את הביטוי הרגיש
    const isFinalApproval = subtaskTitle?.toLowerCase().includes("אישור ניהול סופי");
    
    // אם זו משימת אישור סופי והמשתמש הוא יוחנן או שמוליק - חסום לחלוטין (מחזיר false)
    if (isFinalApproval && (user === 'יוחנן' || user === 'שמוליק')) {
        return false;
    }
    return true; // מורשה (מוישי)
}
};