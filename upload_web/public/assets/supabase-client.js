// Lazy-initialized browser Supabase client.
// Loads anon key from /api/config so we don't need a build step to inline env vars.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

let clientPromise = null;

export function getSupabase() {
  if (!clientPromise) {
    clientPromise = fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load /api/config');
        return r.json();
      })
      .then(({ supabaseUrl, supabaseAnonKey }) => {
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Supabase env not configured on server');
        }
        return createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
      });
  }
  return clientPromise;
}

export async function getAccessToken() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token ?? null;
}

export async function requireSessionOrRedirect(redirectTo = '/') {
  const token = await getAccessToken();
  if (!token) {
    location.href = redirectTo;
    return null;
  }
  return token;
}
