package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.UserInsert
import com.lifestyle.dailyscript.data.model.UserRow
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

class AuthRepository {

    private val client get() = SupabaseProvider.client
    private val auth get() = client.auth

    /**
     * Ensures we have an anonymous session + a corresponding row in `public.users`.
     * Returns the BIGINT user_id from `public.users`.
     */
    suspend fun bootstrap(): Long {
        // Block until session restoration finishes (Initializing -> something else).
        val auth = auth
        withTimeout(SESSION_RESTORE_TIMEOUT_MS) {
            auth.sessionStatus.first { it !is SessionStatus.Initializing }
        }

        if (auth.currentUserOrNull() == null) {
            auth.signInAnonymously()
        }
        val authedUserId = auth.currentUserOrNull()?.id
            ?: throw IllegalStateException("Could not establish anonymous session.")

        val existing: UserRow? = client.postgrest["users"]
            .select {
                filter { eq("anonymous_id", authedUserId) }
                limit(1)
            }
            .decodeSingleOrNull<UserRow>()

        return existing?.userId ?: runCatching {
            client.postgrest["users"]
                .insert(UserInsert(anonymousId = authedUserId)) {
                    select()
                }
                .decodeSingle<UserRow>()
                .userId
        }.getOrElse { insertError ->
            client.postgrest["users"]
                .select {
                    filter { eq("anonymous_id", authedUserId) }
                    limit(1)
                }
                .decodeSingleOrNull<UserRow>()
                ?.userId
                ?: throw insertError
        }
    }

    suspend fun signOut() {
        auth.signOut()
    }

    private companion object {
        const val SESSION_RESTORE_TIMEOUT_MS = 10_000L
    }
}
