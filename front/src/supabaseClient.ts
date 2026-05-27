// src/services/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// הגנה קריטית: וידוא שמשתני הסביבה קיימים לפני אתחול הלקוח
if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Missing Supabase environment variables. Please check your .env file.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseKey);