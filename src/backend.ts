import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url!, key!, { auth:{detectSessionInUrl:true, persistSession:true, autoRefreshToken:true} }) : null;
