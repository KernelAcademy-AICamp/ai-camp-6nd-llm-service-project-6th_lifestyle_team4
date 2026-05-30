import { createClient } from '@supabase/supabase-js';

let anonClient = null;

export class AuthError extends Error {
  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(req) {
  const client = getAnonClient();
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AuthError('Missing bearer token');

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) throw new AuthError('Invalid session');
  return data.user;
}

function getAnonClient() {
  if (anonClient) return anonClient;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new AuthError('Supabase auth env is not configured', 500);
  }
  anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anonClient;
}

// app_metadata.role === 'admin' 인 사용자만 통과. 다른 경우 403.
export async function requireAdmin(req) {
  const user = await requireUser(req);
  const role = user?.app_metadata?.role;
  if (role !== 'admin') {
    throw new AuthError('Admin only', 403);
  }
  return user;
}
