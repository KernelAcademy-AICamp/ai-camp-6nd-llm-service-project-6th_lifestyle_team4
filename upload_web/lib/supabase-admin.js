import { createClient } from '@supabase/supabase-js';

// service_role 키는 RLS를 우회합니다. 절대 브라우저에 노출 금지.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
