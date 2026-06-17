import Foundation

enum Config {
    static let supabaseURL = URL(string: "https://hixymiidpxnnovtmsvfp.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeHltaWlkcHhubm92dG1zdmZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjY1OTIsImV4cCI6MjA5NDgwMjU5Mn0.dkGd2pTtkz6euRVgMa6vXdOkHmV74M4nfXpY6Al3vbA"
}

/// Build-time feature flags — flip on once the dependency is in place.
enum FeatureFlags {
    /// In-app account deletion (Settings → 회원 탈퇴), backed by the live
    /// `public.delete_account()` Postgres RPC (SECURITY DEFINER, no args) —
    /// NOT an Edge Function. It deletes the user's content, their
    /// `public.users` row, AND the `auth.users` row (cascading identities /
    /// sessions / refresh_tokens), so re-login is impossible after deletion.
    static let accountDeletionEnabled = true
}
