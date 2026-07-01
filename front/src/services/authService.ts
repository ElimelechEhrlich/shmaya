import { supabase } from '../supabaseClient.js';

export const ALLOWED_USERS: string[] = ["מוישי", "יוחנן", "שמוליק"];

const USER_MAP: Record<string, { email: string; password: string }> = {
  'מוישי':   { email: 'moishi@shmaya.internal',   password: 'moishi123'   },
  'יוחנן':   { email: 'yochanan@shmaya.internal', password: 'Yochanan@Shmaya2025!' },
  'שמוליק':  { email: 'shmulik@shmaya.internal',  password: 'Shmulik@Shmaya2025!'  },
};

export const authService = {
  async login(username: string): Promise<boolean> {
    const creds = USER_MAP[username?.trim()];
    if (!creds) return false;
    const { error } = await supabase.auth.signInWithPassword(creds);
    return !error;
  },

  async isAuthenticated(): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.user_metadata?.username ?? null;
  },

  async canDelete(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user === 'מוישי';
  },

  canApproveFinal(subtaskTitle: string): boolean {
    // נשאר sync — נקרא ממקומות sync בקוד
    // יתוקן בשלב הבא עם RLS
    return true;
  },
};
