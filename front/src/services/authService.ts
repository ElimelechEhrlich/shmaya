export const ALLOWED_USERS: string[] = ["מוישי", "יוחנן", "שמוליק"];

export interface AuthService {
  login(username: string | null | undefined): boolean;
  isAuthenticated(): boolean;
  logout(): void;
  getCurrentUser(): string | null;
  canDelete(): boolean;
  canEditRestricted(restrictedTo: string | null | undefined): boolean;
  canManageWaitingStatus(): boolean;
}

export const authService: AuthService = {
  login(username: string | null | undefined): boolean {
    const cleanUsername: string = username ? username.trim() : "";
    if (ALLOWED_USERS.includes(cleanUsername)) {
      localStorage.setItem('user_name', cleanUsername);
      localStorage.setItem('is_authenticated', 'true');
      return true;
    }
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

  canDelete(): boolean {
    const user = this.getCurrentUser();
    if (user === 'יוחנן' || user === 'שמוליק') return false;
    return true;
  },

  canEditRestricted(restrictedTo: string | null | undefined): boolean {
    if (!restrictedTo) return true;
    return this.getCurrentUser() === restrictedTo;
  },

  canManageWaitingStatus(): boolean {
    const user = this.getCurrentUser();
    return user === 'שמוליק' || user === 'מוישי';
  },
};
