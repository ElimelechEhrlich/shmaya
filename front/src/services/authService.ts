// src/services/authService.ts

const AUTHORIZED_USER: string = "מוישי";

// הגדרת המבנה (Interface) של שירות ה-Auth
export interface AuthService {
  login(username: string | null | undefined): boolean;
  isAuthenticated(): boolean;
  logout(): void;
  getCurrentUser(): string | null;
}

export const authService: AuthService = {
  login(username: string | null | undefined): boolean {
    // ניקוי רווחים מהקלט של המשתמש בצורה בטוחה
    const cleanUsername: string = username ? username.trim() : "";

    if (cleanUsername === AUTHORIZED_USER) {
      localStorage.setItem('user_name', cleanUsername);
      localStorage.setItem('is_authenticated', 'true');
      return true;
    }
    
    // אם לא מוישי - ננקה את הזיכרון לביטחון
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

  // פונקציית עזר אופציונלית שנוח להוסיף ב-TS כדי לשלוף את השם הנוכחי בצורה בטוחה
  getCurrentUser(): string | null {
    return localStorage.getItem('user_name');
  }
};