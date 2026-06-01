package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.BookmarkInsert
import com.lifestyle.dailyscript.data.model.CardIdRow
import com.lifestyle.dailyscript.data.model.UserInsert
import com.lifestyle.dailyscript.data.model.UserRow
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

/** App-level session snapshot, surfaced to the UI. */
data class UserSession(
    val userId: Long,
    val isAnonymous: Boolean,
    val nickname: String,
    val gender: String? = null,
    val ageGroup: String? = null,
)

class AuthRepository {

    private val client get() = SupabaseProvider.client
    private val auth get() = client.auth

    // Carried across a login/sign-up so bootstrap() can migrate the previous
    // anonymous user's bookmarks + nickname into the freshly created account.
    private var pendingMigrationUserId: Long? = null
    private var pendingCarryNickname: String? = null

    /**
     * Ensures we have a session (anonymous if none) + a row in public.users.
     * Returns the resolved [UserSession].
     */
    suspend fun bootstrap(): UserSession {
        withTimeout(SESSION_RESTORE_TIMEOUT_MS) {
            auth.sessionStatus.first { it !is SessionStatus.Initializing }
        }

        if (auth.currentUserOrNull() == null) {
            auth.signInAnonymously()
        }
        val user = auth.currentUserOrNull()
            ?: throw IllegalStateException("Could not establish a session.")
        val authedUserId = user.id
        val isAnonymous = user.email.isNullOrBlank()

        val existing: UserRow? = client.postgrest["users"]
            .select {
                filter { eq("anonymous_id", authedUserId) }
                limit(1)
            }
            .decodeSingleOrNull<UserRow>()

        if (existing != null) {
            var nickname = existing.nickname.orEmpty()
            if (nickname.isBlank() && isAnonymous) {
                nickname = randomCuteNickname()
                runCatching { updateNickname(existing.userId, nickname) }
            }
            clearPending()
            return UserSession(existing.userId, isAnonymous, nickname, existing.gender, existing.ageGroup)
        }

        // Brand-new users row.
        val startingNickname = pendingCarryNickname?.takeIf { it.isNotBlank() } ?: randomCuteNickname()
        val newUserId = runCatching {
            client.postgrest["users"]
                .insert(UserInsert(anonymousId = authedUserId, nickname = startingNickname)) { select() }
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

        // Just logged in / signed up → carry the old anonymous bookmarks over.
        val oldUserId = pendingMigrationUserId
        if (!isAnonymous && oldUserId != null && oldUserId != newUserId) {
            runCatching { migrateBookmarks(oldUserId, newUserId) }
        }
        clearPending()
        return UserSession(newUserId, isAnonymous, startingNickname)
    }

    /**
     * ID + password sign-in or sign-up. The ID is mapped to a synthetic email
     * (same scheme as the PWA) so the same account works across web + native.
     * Caller passes the current (anonymous) user_id/nickname so they can be
     * migrated into the new account by the next [bootstrap].
     */
    suspend fun signInWithId(
        id: String,
        password: String,
        signUp: Boolean,
        currentUserId: Long?,
        currentNickname: String?,
    ) {
        val email = idToEmail(id) ?: throw IllegalArgumentException("아이디를 입력해주세요.")
        if (password.isBlank()) throw IllegalArgumentException("비밀번호를 입력해주세요.")

        pendingMigrationUserId = currentUserId
        pendingCarryNickname = currentNickname

        if (signUp) {
            auth.signUpWith(Email) {
                this.email = email
                this.password = password
            }
            // Email confirmation may suppress the session — sign in explicitly.
            if (auth.currentUserOrNull()?.email.isNullOrBlank()) {
                auth.signInWith(Email) {
                    this.email = email
                    this.password = password
                }
            }
        } else {
            auth.signInWith(Email) {
                this.email = email
                this.password = password
            }
        }
    }

    suspend fun signOut() {
        auth.signOut()
        clearPending()
    }

    suspend fun updateNickname(userId: Long, nickname: String) {
        client.postgrest["users"].update({ set("nickname", nickname) }) {
            filter { eq("user_id", userId) }
        }
    }

    /**
     * Update nickname + optional demographic fields. gender/age_group are only
     * written when non-null (the DB CHECK rejects empty strings). Mirrors the
     * PWA's profile save (m-app.js:2619).
     */
    suspend fun updateProfile(userId: Long, nickname: String, gender: String?, ageGroup: String?) {
        client.postgrest["users"].update({
            set("nickname", nickname)
            if (gender != null) set("gender", gender)
            if (ageGroup != null) set("age_group", ageGroup)
        }) {
            filter { eq("user_id", userId) }
        }
    }

    private suspend fun migrateBookmarks(oldUserId: Long, newUserId: Long) {
        val old = client.postgrest["user_bookmarks"]
            .select(Columns.raw("card_id")) {
                filter { eq("user_id", oldUserId) }
            }
            .decodeList<CardIdRow>()
        if (old.isEmpty()) return
        val rows = old.map { BookmarkInsert(userId = newUserId, cardId = it.cardId) }
        runCatching { client.postgrest["user_bookmarks"].insert(rows) }
        runCatching {
            client.postgrest["user_bookmarks"].delete { filter { eq("user_id", oldUserId) } }
        }
        runCatching {
            client.postgrest["users"].delete { filter { eq("user_id", oldUserId) } }
        }
    }

    private fun clearPending() {
        pendingMigrationUserId = null
        pendingCarryNickname = null
    }

    companion object {
        private const val SESSION_RESTORE_TIMEOUT_MS = 10_000L

        private val NICKNAME_ADJECTIVES = listOf(
            "서점에 간", "책 좋아하는", "연극에 빠진", "희곡에 매료된", "책 읽는",
            "도서관 가는", "글 쓰는", "시 쓰는", "각본 쓰는", "무대 위의",
            "책장 사이의", "독서하는", "대본 외우는", "극장 가는", "명대사 모으는",
            "소설 좋아하는", "문장 모으는", "활자에 빠진", "책 향기 맡는", "편지 쓰는",
        )
        private val NICKNAME_NOUNS = listOf(
            "안경잡이", "부끄럼쟁이", "매력쟁이", "호랑이", "토끼",
            "여우", "고양이", "기린", "곰", "사슴",
            "두루미", "독수리", "늑대", "판다", "코알라",
            "돌고래", "학자", "낭만가", "몽상가", "여행자",
        )

        fun randomCuteNickname(): String =
            "${NICKNAME_ADJECTIVES.random()} ${NICKNAME_NOUNS.random()}"

        /**
         * Map any user-entered ID to a stable synthetic email.
         * Mirrors the PWA's idToEmail (FNV-1a, 32-bit) so the same ID resolves
         * to the same account on web and native.
         */
        fun idToEmail(id: String): String? {
            val raw = id.trim()
            if (raw.isEmpty()) return null
            val cleaned = raw.lowercase().replace(Regex("\\s+"), "")
            if (cleaned.matches(Regex("^[a-z0-9._+\\-]+$")) && cleaned.length in 1..50) {
                return "$cleaned@user.local"
            }
            var hash = 2166136261.toInt() // 0x811c9dc5, wraps as 32-bit Int (== Math.imul semantics)
            for (ch in raw) {
                hash = hash xor ch.code
                hash *= 16777619
            }
            val unsigned = hash.toLong() and 0xFFFFFFFFL // hash >>> 0
            val slug = ("00000000" + unsigned.toString(36)).takeLast(8)
            return "u_$slug@user.local"
        }
    }
}
