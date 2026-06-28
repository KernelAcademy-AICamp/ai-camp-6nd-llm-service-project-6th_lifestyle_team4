package com.lifestyle.dailyscript.data.repo

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.lifestyle.dailyscript.BuildConfig
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.BookmarkInsert
import com.lifestyle.dailyscript.data.model.CardIdRow
import com.lifestyle.dailyscript.data.model.UserInsert
import com.lifestyle.dailyscript.data.model.UserPrefs
import com.lifestyle.dailyscript.data.model.UserRow
import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.Kakao
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

/** Social OAuth providers we support (web-redirect flow via Supabase). */
enum class SocialProvider { GOOGLE, KAKAO }

/** App-level session snapshot, surfaced to the UI. */
data class UserSession(
    val userId: Long,
    val isAnonymous: Boolean,
    val nickname: String,
    val gender: String? = null,
    val ageGroup: String? = null,
    val loginId: String? = null,
    /** 충전(구매) 실타래 잔액. 무료 5개/일은 클라이언트 로컬에서 별도 관리. */
    val yarnBalance: Int = 0,
    /** 소셜 첫 가입 직후 1회 성별·나이 입력 프롬프트를 띄울지. */
    val needsProfileSetup: Boolean = false,
)

class AuthRepository {

    private val client get() = SupabaseProvider.client
    private val auth get() = client.auth

    // Carried across a login/sign-up so bootstrap() can migrate the previous
    // anonymous user's bookmarks into the freshly created account and stamp the
    // entered login id onto the new (non-anonymous) users row.
    private var pendingMigrationUserId: Long? = null
    private var pendingLoginId: String? = null
    // ID/PW 회원가입 시 입력받은 성별·나이대(선택) — 다음 bootstrap 이 새 users 행에 기록한다.
    private var pendingGender: String? = null
    private var pendingAgeGroup: String? = null

    /**
     * Ensures we have a session (anonymous if none) + a row in public.users.
     * Returns the resolved [UserSession].
     */
    suspend fun bootstrap(): UserSession {
        withTimeout(SESSION_RESTORE_TIMEOUT_MS) {
            auth.sessionStatus.first { it !is SessionStatus.Initializing }
        }

        // 익명 자동 로그인 폐지: 세션이 없으면 비로그인 게스트로 둔다(읽기 전용 둘러보기).
        // 예전엔 여기서 signInAnonymously() 로 매일 유령 익명 유저를 양산했다(분석/users 오염).
        // 로그인(Google/Kakao/ID·PW) 시에만 세션과 users 행이 생긴다. 게스트는 isAnonymous=true,
        // userId=0L 로 표현돼 기존 `isAnonymous || userId <= 0L` 가드가 그대로 막아준다.
        // 기존 세션(예전에 만들어진 익명 세션 포함)은 아래 경로로 그대로 동작한다.
        val user = auth.currentUserOrNull() ?: return GUEST_SESSION
        val authedUserId = user.id
        // 익명 사용자는 연결된 identity가 없다. 이메일 유무로 판별하면 "이메일 미동의 카카오
        // 로그인"이 익명으로 잘못 분류되므로 identities로 판별한다. (iOS/PWA의 is_anonymous와 동일 의미)
        val isAnonymous = user.identities.isNullOrEmpty()

        // 카카오(외부 브라우저 OAuth) 복귀 — 프로세스가 죽었다 살아나 in-memory stash 가 비었으면
        // 영속 stash 에서 마이그레이션 대상(이전 익명 user_id)을 복원한다. 로그인 1회 소비 후 정리.
        if (!isAnonymous) {
            if (pendingMigrationUserId == null) {
                pendingMigrationUserId = AppPreferences.pendingMigrationUserId()
            }
            AppPreferences.clearPendingMigrationUserId()
        }

        val existing: UserRow? = client.postgrest["users"]
            .select {
                filter { eq("anonymous_id", authedUserId) }
                limit(1)
            }
            .decodeSingleOrNull<UserRow>()

        if (existing != null) {
            clearPending()
            syncPrefsFromRow(existing) // DB 선호도 → DataStore (기기 간 동기화 + 온보딩 재노출 방지)
            return UserSession(
                existing.userId,
                isAnonymous,
                existing.nickname.orEmpty(),
                existing.gender,
                existing.ageGroup,
                existing.loginId,
                existing.yarnBalance,
            )
        }

        // Brand-new users row. Anonymous users get no nickname — it is assigned
        // only at sign-up (non-anonymous). The nickname column is non-null, so an
        // anonymous row stores an empty string.
        val startingNickname = if (isAnonymous) "" else randomCuteNickname()
        // 원자적 get-or-create — 같은 auth.uid 로 두 기기가 동시에 첫 로그인해도 users 행은 하나로 수렴.
        // 예전 "조회→없으면 insert" 는 anonymous_id 에 UNIQUE 가 없어 동시 insert 가 둘 다 성공 →
        // user_id 두 개로 갈라지고 출석 +100 을 이중 수령하는 버그가 있었다(서버: 14_fix_duplicate_users.sql).
        // ensure_user_row RPC 미배포 환경에서는 기존 insert→재조회 경로로 폴백한다.
        val newUserId = runCatching {
            client.postgrest.rpc(
                function = "ensure_user_row",
                parameters = buildJsonObject { put("p_nickname", startingNickname) },
            ).decodeAs<Long>()
        }.getOrElse {
            runCatching {
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
        }

        // Just signed up / logged in → stamp the entered id and carry the old
        // anonymous bookmarks into the freshly created account.
        val recordedLoginId = pendingLoginId?.takeIf { it.isNotBlank() }
        val recordedGender = pendingGender
        val recordedAgeGroup = pendingAgeGroup
        // 소셜(OAuth) 첫 가입: 비익명 신규인데 입력 아이디가 없음(= ID/PW 가입이 아님).
        val isSocialSignup = !isAnonymous && recordedLoginId == null
        if (!isAnonymous) {
            recordedLoginId?.let { id -> runCatching { updateLoginId(newUserId, id) } }
            // ID/PW 회원가입의 성별·나이(선택) — PWA applySignupProfile 대응. null 필드는 미기록.
            if (recordedGender != null || recordedAgeGroup != null) {
                runCatching { updateDemographics(newUserId, recordedGender, recordedAgeGroup) }
            }
            val oldUserId = pendingMigrationUserId
            if (oldUserId != null && oldUserId != newUserId) {
                runCatching { migrateBookmarks(oldUserId, newUserId) }
            }
        }
        clearPending()
        return UserSession(
            newUserId, isAnonymous, startingNickname,
            gender = recordedGender,
            ageGroup = recordedAgeGroup,
            loginId = recordedLoginId,
            needsProfileSetup = isSocialSignup,
        )
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
        gender: String? = null,
        ageGroup: String? = null,
    ) {
        val email = idToEmail(id) ?: throw IllegalArgumentException("아이디를 입력해주세요.")
        if (password.isBlank()) throw IllegalArgumentException("비밀번호를 입력해주세요.")

        pendingMigrationUserId = currentUserId
        pendingLoginId = id.trim()
        // 성별·나이는 회원가입일 때만 기록 대상으로 둔다(로그인은 기존 값 유지).
        pendingGender = if (signUp) gender else null
        pendingAgeGroup = if (signUp) ageGroup else null

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

    /**
     * Native Google sign-in via Android Credential Manager — no browser/redirect.
     * Shows the system account-picker sheet, gets a Google ID token, then exchanges
     * it with Supabase via signInWith(IDToken). The call is synchronous (suspends
     * until the session exists), so the caller can re-bootstrap immediately.
     *
     * We stash the current (anonymous) user_id so the next bootstrap can migrate
     * its bookmarks into the freshly created account.
     *
     * Nonce: Google Sign-In wants a HASHED nonce in the request; Supabase verifies
     * the token by hashing the RAW nonce we pass it. (Supabase 공식 Android 패턴)
     */
    suspend fun signInWithGoogleNative(activity: Activity, currentUserId: Long?) {
        val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        if (webClientId.isBlank()) {
            throw IllegalStateException(
                "구글 로그인이 설정되지 않았습니다. local.properties에 GOOGLE_WEB_CLIENT_ID를 추가하세요."
            )
        }
        pendingMigrationUserId = currentUserId
        pendingLoginId = null

        val rawNonce = UUID.randomUUID().toString()
        val hashedNonce = MessageDigest.getInstance("SHA-256")
            .digest(rawNonce.toByteArray())
            .joinToString("") { "%02x".format(it) }

        val googleIdOption = GetGoogleIdOption.Builder()
            .setServerClientId(webClientId)
            // 처음엔 인증된 계정만 필터링하지 않고 모든 계정을 보여준다(첫 로그인 대비).
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false)
            .setNonce(hashedNonce)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        val response = CredentialManager.create(activity).getCredential(activity, request)
        val credential = response.credential
        if (credential !is CustomCredential || credential.type != TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw IllegalStateException("구글 자격 증명을 받지 못했습니다.")
        }
        val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken

        auth.signInWith(IDToken) {
            this.idToken = idToken
            this.provider = Google
            this.nonce = rawNonce
        }
    }

    /**
     * 카카오 로그인 — 외부 브라우저(Custom Tab) 리다이렉트 OAuth. 구글(네이티브 Credential Manager)과
     * 달리 동의 화면이 브라우저에서 뜨고, 완료되면 deeplink(com.lifestyle.dailyscript://login-callback)로
     * 복귀한다. 세션 적용은 비동기라 [AppSessionViewModel.observeAuthChanges] 가 sessionStatus 변화를
     * 감지해 재bootstrap 한다(익명 북마크 마이그레이션 포함). 그래서 여기선 호출 직전에 마이그레이션
     * 대상(현재 익명 user_id)만 stash 해 둔다.
     *
     * ⚠️ 백엔드 선행조건: Supabase Kakao provider 활성화 + 카카오 비즈니스 앱(account_email 동의) +
     *   Redirect URL 에 위 deeplink 등록. 미설정 시 동의 후 'provider is not enabled' 등으로 실패.
     */
    suspend fun signInWithKakao(currentUserId: Long?) {
        pendingMigrationUserId = currentUserId
        pendingLoginId = null
        // 브라우저 왕복 중 프로세스가 죽어도 마이그레이션이 유지되도록 영속 stash (PWA ds.prevAnonUserId).
        AppPreferences.setPendingMigrationUserId(currentUserId)
        auth.signInWith(Kakao)
    }

    suspend fun signOut() {
        auth.signOut()
        clearPending()
    }

    /**
     * 회원 탈퇴 — 본인 데이터와 auth 계정을 서버측 RPC(delete_account)로 일괄 삭제한다.
     * RPC는 무인자이며 내부적으로 auth.uid()만 신뢰하므로 호출자는 자기 자신만 지운다.
     * 삭제 후 토큰은 사라진 사용자를 가리키므로 로컬 스코프로만 로그아웃한다
     * (GoTrue /logout 미호출 → 실패 불가). signOut 실패가 삭제 성공을 가리지 않게 방어한다.
     */
    suspend fun deleteAccount() {
        client.postgrest.rpc("delete_account")
        runCatching { auth.signOut(SignOutScope.LOCAL) }
        clearPending()
    }

    /**
     * 회원가입 전 아이디 중복확인 — PWA email_available(idToEmail(id)). true = 사용 가능(미가입).
     * 합성 이메일 스킴(idToEmail)이 실제 가입과 동일해야 결과가 일치한다.
     */
    suspend fun emailAvailable(id: String): Boolean {
        val email = idToEmail(id) ?: return false
        return client.postgrest.rpc(
            function = "email_available",
            parameters = buildJsonObject { put("p_email", email) },
        ).decodeAs<Boolean>()
    }

    /** Stamp the human-entered login id onto the user's row (shown in the UI). */
    suspend fun updateLoginId(userId: Long, loginId: String) {
        client.postgrest["users"].update({ set("login_id", loginId) }) {
            filter { eq("user_id", userId) }
        }
    }

    /** ID/PW 가입 시 입력받은 성별·나이대(선택)를 새 행에 기록. null 필드는 건드리지 않음(DB CHECK 가 빈문자 거부). */
    private suspend fun updateDemographics(userId: Long, gender: String?, ageGroup: String?) {
        client.postgrest["users"].update({
            if (gender != null) set("gender", gender)
            if (ageGroup != null) set("age_group", ageGroup)
        }) {
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

    /**
     * 온보딩 선호도를 users 행에 저장 (PWA savePreferencesToDb, 033 컬럼).
     * 실패해도 로컬(DataStore)은 이미 저장돼 있어 흐름엔 지장 없다 — 호출측 fire-and-forget.
     */
    suspend fun updatePreferences(userId: Long, prefs: UserPrefs) {
        client.postgrest["users"].update({
            set("pref_genres", buildJsonArray { prefs.genres.forEach { add(it) } })
            set("pref_themes", buildJsonArray { prefs.themes.forEach { add(it) } })
            set("pref_any", prefs.any)
            set("pref_updated_at", Instant.now().toString())
        }) {
            filter { eq("user_id", userId) }
        }
    }

    /**
     * DB users 행의 선호도 → DataStore (PWA syncPrefsFromDb). DB가 우선 —
     * 재설치/다른 기기에서도 온보딩이 다시 뜨지 않는다. pref 필드가 전부 null이면 미설정.
     */
    private suspend fun syncPrefsFromRow(row: UserRow) {
        if (row.prefGenres == null && row.prefThemes == null && row.prefAny == null) return
        runCatching {
            AppPreferences.savePrefs(
                UserPrefs(
                    genres = row.prefGenres ?: emptyList(),
                    themes = row.prefThemes ?: emptyList(),
                    any = row.prefAny ?: false,
                ),
            )
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
        pendingLoginId = null
        pendingGender = null
        pendingAgeGroup = null
    }

    companion object {
        private const val SESSION_RESTORE_TIMEOUT_MS = 10_000L

        /**
         * 비로그인 게스트 세션 — 세션도 users 행도 없다. userId=0L 은 절대 유효한 DB user_id 가
         * 아니며(시퀀스는 1부터), 기존 `isAnonymous || userId <= 0L` 가드와 호환된다. 게스트는
         * 카탈로그/피드를 anon 키로 읽기만 하고, 개인 행동은 isAnonymous 가드가 로그인으로 유도한다.
         */
        private val GUEST_SESSION = UserSession(userId = 0L, isAnonymous = true, nickname = "")

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
         * ⚠️ 3개 클라이언트 동기화 필수 — 바꾸면 기존 계정 로그인이 전부 깨진다.
         *   web_pwa: idToEmail            (web_pwa/public/m/assets/m-app.js)
         *   iOS:     AuthSession.idToEmail (main_app/ios/.../Data/AuthSession.swift)
         * FNV-1a 32-bit over UTF-16 code units, so the same ID resolves to the
         * same account on web + native.
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
