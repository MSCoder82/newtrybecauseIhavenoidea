import { createClient } from '@supabase/supabase-js';

// Get the environment variables from Vite's import.meta.env object
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if the variables are loaded. If not, throw an error.
// This will cause the app to crash on startup if the variables are missing,
// which is better than failing silently with a fallback profile.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase environment variables are not set. Please check your .env file or deployment settings.');
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);