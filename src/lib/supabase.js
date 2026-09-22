import { createClient } from '@supabase/supabase-js';

// Read environment variables using import.meta.env without hardcoded credentials
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in environment variables.');
}

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);
