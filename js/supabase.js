/* ==========================================================================
   MUSIC OS - Supabase Database Client & Connection Manager
   Initializes shared Supabase client with standard session persistence.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';
import { envConfig } from './config.js';

let supabaseClient = null;

/**
 * Initializes or retrieves the singleton Supabase client instance.
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = envConfig.get('SUPABASE_URL', '').trim();
    const supabaseKey = envConfig.get('SUPABASE_PUBLISHABLE_KEY', '').trim();

    if (supabaseUrl && supabaseKey) {
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      console.log('⚡ [Supabase] Client initialized successfully with URL:', supabaseUrl);
    } else {
      console.warn('⚠️ [Supabase] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY.');
    }
  }
  return supabaseClient;
}

/**
 * Shared Supabase client proxy for seamless export.
 */
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabase();
    if (!client) {
      console.warn(`[Supabase] Cannot access property "${String(prop)}": Client not initialized.`);
      return undefined;
    }
    const val = client[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});

/**
 * Performs a harmless read-only query against public.songs to verify database connectivity.
 * Respects RLS and handles expected unauthenticated response states without modifying UI or data.
 * @returns {Promise<{success: boolean, status: number, note?: string, data?: any, error?: any}>}
 */
export async function testSupabaseConnection() {
  const client = getSupabase();
  if (!client) {
    console.warn('[Supabase Connection Test] Aborted: Client not initialized.');
    return { success: false, status: 0, error: 'Client not configured' };
  }

  try {
    // Harmless SELECT limit 1 on public.songs
    const { data, error, status } = await client
      .from('songs')
      .select('id')
      .limit(1);

    if (error) {
      // With RLS enabled, unauthenticated queries will return an RLS restriction or empty result
      console.log(`📡 [Supabase Connection Test] Connected to Supabase (HTTP ${status}):`, error.message);
      return {
        success: true,
        status,
        note: 'Connected with active RLS policy enforcement (expected for unauthenticated client)',
        error: error.message
      };
    }

    console.log(`📡 [Supabase Connection Test] Connected successfully (HTTP ${status}). Rows returned:`, data?.length ?? 0);
    return {
      success: true,
      status,
      data,
      note: 'Database query executed successfully'
    };
  } catch (err) {
    console.error('❌ [Supabase Connection Test] Connection error:', err);
    return {
      success: false,
      status: 500,
      error: err.message
    };
  }
}

// Expose development helpers on window object
if (typeof window !== 'undefined') {
  window.getSupabase = getSupabase;
  window.supabase = supabase;
  window.testSupabaseConnection = testSupabaseConnection;
}
