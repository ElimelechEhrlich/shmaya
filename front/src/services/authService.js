// src/services/authService.js

const AUTHORIZED_USER = "מוישי";

export const authService = {
  login(username) {
    // ניקוי רווחים מהקלט של המשתמש
    const cleanUsername = username ? username.trim() : "";

    if (cleanUsername === AUTHORIZED_USER) {
      localStorage.setItem('user_name', cleanUsername);
      localStorage.setItem('is_authenticated', 'true');
      return true;
    }
    
    // אם לא מוישי - ננקה את הזיכרון לביטחון
    this.logout();
    return false;
  },

  isAuthenticated() {
    return localStorage.getItem('is_authenticated') === 'true';
  },

  logout() {
    localStorage.removeItem('user_name');
    localStorage.removeItem('is_authenticated');
  }
};