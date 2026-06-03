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
                install(Auth) {
                    // 소셜 로그인(OAuth) 콜백 딥링크. 이 값으로 만들어지는
                    // redirect URL "com.lifestyle.dailyscript://login-callback" 은
                    //  ① AndroidManifest의 intent-filter (scheme/host) 와 일치해야 하고
                    //  ② Supabase 대시보드 Auth → URL Configuration → Redirect URLs 에 등록돼야 한다.
                    scheme = "com.lifestyle.dailyscript"
                    host = "login-callback"
                }
                install(Postgrest)
            }
        }.getOrElse { error ->
            initError = error.message?.takeIf { it.isNotBlank() }
                ?: "Could not initialize Supabase."
            return
        }
    }
}
