import { createClient } from '@supabase/supabase-js';

const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export class AuthError extends Error {
  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AuthError('Missing bearer token');

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user) throw new AuthError('Invalid session');
  return data.user;
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
