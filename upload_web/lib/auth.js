import { createClient } from '@supabase/supabase-js';

const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export class AuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.status = 401;
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
