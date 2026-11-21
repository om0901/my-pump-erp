import { createClient } from '@supabase/supabase-js';

const rawEnvUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawEnvKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Check if valid URL or placeholder
export const isEnvConfigured = Boolean(
  rawEnvUrl &&
  rawEnvKey &&
  !rawEnvUrl.includes('YOUR_SUPABASE_URL') &&
  !rawEnvKey.includes('YOUR_SUPABASE_ANON_KEY')
);

// Fallback to project keys so app always operates reliably even if .env is not yet reloaded
const supabaseUrl = (rawEnvUrl && !rawEnvUrl.includes('YOUR_SUPABASE_URL'))
  ? rawEnvUrl
  : 'https://rfgnrqzrsanibgkuyhqw.supabase.co';

const supabaseAnonKey = (rawEnvKey && !rawEnvKey.includes('YOUR_SUPABASE_ANON_KEY'))
  ? rawEnvKey
  : 'sb_publishable_b2SSefiAUEAz6dy4vcnTmQ_o_yAO8Ow';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
