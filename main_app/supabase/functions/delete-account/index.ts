// supabase/functions/delete-account — DRAFT (backend owner: review, set secrets, deploy)
//
// Permanently deletes the caller's account: every user-scoped row + the Supabase
// Auth user. Invoked by the iOS app via `client.functions.invoke("delete-account")`
// (and later Android). Auth is implicit — the caller's JWT arrives in the
// Authorization header; we resolve their identity from it with the service role.
//
// Why a server function (not client deletes): RLS blocks deleting the `users`
// row from the client, and ONLY the service role can remove the Supabase Auth
// user. Without deleting the auth user, the next launch deterministically
// re-bootstraps the same account (see AuthSession.bootstrap / findUser).
//
// Required function secret: SUPABASE_SERVICE_ROLE_KEY  (SUPABASE_URL is injected
// by the platform). Deploy: `supabase functions deploy delete-account`.

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing token" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Identify the caller from their JWT.
  const { data: got, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !got?.user) return json({ error: "invalid token" }, 401);
  const authUid = got.user.id;

  // Atomically purge every user-scoped row (see migrations/0001_account_deletion.sql).
  const { error: dataErr } = await admin.rpc("delete_user_data", { p_anonymous_id: authUid });
  if (dataErr) return json({ error: `data delete failed: ${dataErr.message}` }, 500);

  // Remove the auth identity LAST, so a re-bootstrap can't recreate the account.
  const { error: delErr } = await admin.auth.admin.deleteUser(authUid);
  if (delErr) return json({ error: `auth delete failed: ${delErr.message}` }, 500);

  return json({ ok: true }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
