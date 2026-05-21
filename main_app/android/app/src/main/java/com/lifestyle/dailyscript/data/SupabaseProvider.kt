package com.lifestyle.dailyscript.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest

object SupabaseProvider {
    @Volatile
    private var _client: SupabaseClient? = null

    val client: SupabaseClient
        get() = checkNotNull(_client) { "SupabaseProvider.init() must be called before use" }

    fun init(url: String, anonKey: String) {
        if (_client != null) return
        check(url.isNotBlank() && anonKey.isNotBlank()) {
            "SUPABASE_URL / SUPABASE_ANON_KEY are missing. See local.properties.sample."
        }
        _client = createSupabaseClient(supabaseUrl = url, supabaseKey = anonKey) {
            install(Auth)
            install(Postgrest)
        }
    }
}
