package com.lifestyle.dailyscript.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest

object SupabaseProvider {
    @Volatile
    private var _client: SupabaseClient? = null

    @Volatile
    private var initError: String? = null

    val client: SupabaseClient
        get() = _client ?: throw IllegalStateException(
            initError ?: "SupabaseProvider.init() must be called before use"
        )

    @Synchronized
    fun init(url: String, anonKey: String) {
        if (_client != null) return
        initError = null
        if (url.isBlank() || anonKey.isBlank()) {
            initError = "SUPABASE_URL / SUPABASE_ANON_KEY are missing. See local.properties.sample."
            return
        }
        _client = runCatching {
            createSupabaseClient(supabaseUrl = url, supabaseKey = anonKey) {
                install(Auth)
                install(Postgrest)
            }
        }.getOrElse { error ->
            initError = error.message?.takeIf { it.isNotBlank() }
                ?: "Could not initialize Supabase."
            return
        }
    }
}
