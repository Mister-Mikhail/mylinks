import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are missing.')
}

/**
 * Anonymous read-only client for public profile pages.
 * It never reads, refreshes or waits for a user session, so a public page
 * does not depend on authorization at all.
 */
export const publicSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'mylinks-public-client',
  },
})
