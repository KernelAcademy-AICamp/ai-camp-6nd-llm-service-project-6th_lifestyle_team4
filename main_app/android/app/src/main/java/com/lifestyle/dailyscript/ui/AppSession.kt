package com.lifestyle.dailyscript.ui

import android.app.Activity
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.UserPrefs
import com.lifestyle.dailyscript.data.repo.AuthRepository
import com.lifestyle.dailyscript.data.repo.SocialProvider
import com.lifestyle.dailyscript.data.repo.UserSession
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Holds the bootstrapped session (user_id, anonymous flag, nickname) used across screens. */
class AppSessionViewModel : ViewModel() {

    private val authRepo = AuthRepository()

    // 마지막으로 bootstrap한 auth 사용자 id. OAuth(소셜) 로그인은 외부 브라우저에서
    // 비동기로 완료되므로, sessionStatus를 관찰해 uid가 바뀌면 재bootstrap한다.
    private var lastAuthUid: String? = null

    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    /** Transient toast-style message for auth/nickname actions. */
    private val _authMessage = MutableStateFlow<String?>(null)
    val authMessage: StateFlow<String?> = _authMessage.asStateFlow()

    private val _authInProgress = MutableStateFlow(false)
    val authInProgress: StateFlow<Boolean> = _authInProgress.asStateFlow()

    /** 소셜 첫 가입 직후 성별·나이 입력 프롬프트 노출 여부 (세션 copy 경쟁을 피하려 별도 플로우). */
    private val _profilePromptVisible = MutableStateFlow(false)
    val profilePromptVisible: StateFlow<Boolean> = _profilePromptVisible.asStateFlow()

    // init 의 bootstrap() 과 observeAuthChanges() 가 콜드스타트에 동시에 진입할 수 있다.
    // 직렬화하지 않으면 두 코루틴이 각각 signInAnonymously() 를 호출해 익명 계정이 둘 생기거나
    // _state/lastAuthUid 쓰기가 경쟁한다. Mutex 로 단일화하고, 잠금 안에서 이미 같은 사용자로
    // 부트스트랩이 끝났으면 중복 작업/로딩 깜빡임을 건너뛴다.
    // NOTE: 아래 init 이 (코루틴을 통해) 이 Mutex 를 사용하므로 반드시 init 보다 먼저 초기화해야
    // 한다. init 뒤에 두면 release(R8)에서 bootstrapIntoState 가 생성자 도중 동기 실행될 때
    // 아직 null 이라 NPE 가 난다.
    private val bootstrapMutex = Mutex()

    init {
        bootstrap()
        observeAuthChanges()
    }

    fun bootstrap() {
        viewModelScope.launch { bootstrapIntoState() }
    }

    fun signOutAndReauth() {
        viewModelScope.launch {
            _state.value = SessionState.Loading
            val signOutResult = runCatching { authRepo.signOut() }
            if (signOutResult.isFailure) {
                _state.value = SessionState.Error(signOutResult.exceptionOrNull().messageOr("Sign-out failed"))
                return@launch
            }
            AppAnalytics.resetUser()
            bootstrapIntoState()
        }
    }

    /**
     * 회원 탈퇴 + 재인증. 성공 시 새 익명 사용자로 복귀. 실패해도 dead-end Error 화면
     * 대신 토스트만 띄우고 기존 세션으로 복귀한다 — delete_account 는 단일 트랜잭션이라
     * 실패 시 auth.users 가 삭제되지 않아 기존 JWT 가 그대로 유효하기 때문.
     */
    fun deleteAccountAndReauth() {
        if (_authInProgress.value) return
        _authInProgress.value = true
        _state.value = SessionState.Loading
        viewModelScope.launch {
            runCatching { authRepo.deleteAccount() }
                .onSuccess {
                    AppAnalytics.track("account_deleted")
                    AppAnalytics.resetUser()
                }
                .onFailure {
                    _authMessage.value = "탈퇴에 실패했어요. 잠시 후 다시 시도해주세요."
                }
            bootstrapIntoState()
            _authInProgress.value = false
        }
    }

    fun signIn(id: String, password: String, signUp: Boolean) {
        if (_authInProgress.value) return
        val current = (_state.value as? SessionState.Ready)?.session
        _authInProgress.value = true
        _authMessage.value = null
        viewModelScope.launch {
            runCatching {
                authRepo.signInWithId(id, password, signUp, current?.userId)
            }.onSuccess {
                bootstrapIntoState()
                AppAnalytics.track(
                    if (signUp) "sign_up" else "login",
                    mapOf("method" to "id_password"),
                )
                _authMessage.value = if (signUp) "가입 완료" else "로그인 됐어요"
            }.onFailure {
                _authMessage.value = friendlyAuthError(it.message.orEmpty())
            }
            _authInProgress.value = false
        }
    }

    /**
     * Social sign-in. 구글은 Credential Manager 네이티브 시트(브라우저 없음)로 처리하므로
     * 호출부에서 [activity]를 넘겨준다. 네이티브 로그인은 동기 완료라 성공 즉시 재bootstrap한다.
     */
    fun signInWithProvider(provider: SocialProvider, activity: Activity?) {
        // 카카오는 Supabase가 account_email 스코프를 강제 → 카카오 비즈니스 앱 전환 전까지 "준비 중".
        // 비즈앱 전환 + 동의항목(account_email/profile_image) 활성화 후엔 이 가드만 제거하면 켜진다.
        if (provider == SocialProvider.KAKAO) {
            _authMessage.value = "카카오 로그인은 준비 중입니다."
            return
        }
        if (_authInProgress.value) return
        if (activity == null) {
            _authMessage.value = "로그인을 시작할 수 없습니다. 다시 시도해주세요."
            return
        }
        val current = (_state.value as? SessionState.Ready)?.session
        _authInProgress.value = true
        _authMessage.value = null
        viewModelScope.launch {
            runCatching { authRepo.signInWithGoogleNative(activity, current?.userId) }
                .onSuccess {
                    bootstrapIntoState()
                    AppAnalytics.track("login", mapOf("method" to "google_native"))
                    _authMessage.value = "로그인 됐어요"
                }
                .onFailure { e ->
                    when (e) {
                        // 사용자가 계정 선택 시트를 닫음 — 에러가 아니므로 조용히 넘긴다.
                        is GetCredentialCancellationException -> Unit
                        is NoCredentialException ->
                            _authMessage.value = "사용 가능한 구글 계정이 없습니다. 기기에 구글 계정을 추가해주세요."
                        else -> _authMessage.value = friendlyAuthError(e.message.orEmpty())
                    }
                }
            _authInProgress.value = false
        }
    }

    fun updateProfile(newName: String, gender: String?, ageGroup: String?) {
        val session = (_state.value as? SessionState.Ready)?.session ?: return
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) { _authMessage.value = "이름을 입력해주세요"; return }
        if (trimmed.length > 24) { _authMessage.value = "24자 이하로 입력해주세요"; return }
        viewModelScope.launch {
            runCatching { authRepo.updateProfile(session.userId, trimmed, gender, ageGroup) }
                .onSuccess {
                    _state.value = SessionState.Ready(
                        session.copy(
                            nickname = trimmed,
                            gender = gender ?: session.gender,
                            ageGroup = ageGroup ?: session.ageGroup,
                        )
                    )
                    AppAnalytics.setUserProperties(
                        mapOf(
                            "gender" to (gender ?: session.gender),
                            "age_group" to (ageGroup ?: session.ageGroup),
                        )
                    )
                    AppAnalytics.track("profile_updated")
                    _authMessage.value = "프로필이 저장됐어요"
                }
                .onFailure { _authMessage.value = "저장 실패: ${it.message ?: ""}" }
        }
    }

    /**
     * 선호도 온보딩 완료/건너뛰기 — 로컬 저장(→오버레이 닫힘) 후 서버에도 저장.
     * 서버 저장은 fire-and-forget (PWA 동일): 실패해도 로컬은 이미 저장돼 재노출되지 않는다.
     */
    fun savePreferences(genres: List<String>, themes: List<String>, any: Boolean, skipped: Boolean) {
        val session = (_state.value as? SessionState.Ready)?.session ?: return
        val prefs = UserPrefs(genres = genres, themes = themes, any = any)
        viewModelScope.launch {
            AppPreferences.savePrefs(prefs)
            runCatching { authRepo.updatePreferences(session.userId, prefs) }
            AppAnalytics.track(
                "preferences_set",
                mapOf(
                    "genreCount" to genres.size,
                    "themeCount" to themes.size,
                    "any" to any,
                    "skipped" to skipped,
                ),
            )
        }
    }

    fun consumeAuthMessage() { _authMessage.value = null }

    fun consumeProfilePrompt() { _profilePromptVisible.value = false }

    private fun observeAuthChanges() {
        // OAuth(소셜) 로그인은 외부 브라우저에서 비동기로 완료된다. sessionStatus를 관찰해
        // auth 사용자 id가 바뀌면(=로그인/로그아웃) 세션을 다시 bootstrap한다.
        viewModelScope.launch {
            SupabaseProvider.client.auth.sessionStatus.collect { status ->
                if (status is SessionStatus.Authenticated) {
                    val uid = status.session.user?.id
                    if (uid != null && uid != lastAuthUid) {
                        bootstrapIntoState()
                    }
                }
            }
        }
    }

    private suspend fun bootstrapIntoState() = bootstrapMutex.withLock {
        val current = runCatching { SupabaseProvider.client.auth.currentUserOrNull()?.id }.getOrNull()
        if (current != null && current == lastAuthUid && _state.value is SessionState.Ready) {
            return@withLock
        }
        _state.value = SessionState.Loading
        val result = runCatching { authRepo.bootstrap() }
        lastAuthUid = runCatching { SupabaseProvider.client.auth.currentUserOrNull()?.id }.getOrNull()
        _state.value = result
            .map(SessionState::Ready)
            .getOrElse { SessionState.Error(it.messageOr("Sign-in failed")) }
        // 소셜 첫 가입이면 직후 1회 성별·나이 입력 프롬프트.
        if (result.getOrNull()?.needsProfileSetup == true) _profilePromptVisible.value = true
    }

    private fun Throwable?.messageOr(fallback: String): String =
        this?.message?.takeIf { it.isNotBlank() } ?: fallback

    // 3개 클라이언트 공통 매핑 — web_pwa(submitSignin) / iOS(friendlyAuthError)와 동일 세트 유지.
    // 더 구체적인 패턴을 위에 두어야 한다 (email rate limit → 일반 rate limit 순서).
    private fun friendlyAuthError(msg: String): String = when {
        Regex("Invalid login credentials", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "아이디 또는 비밀번호가 맞지 않습니다."
        Regex("User already registered", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "이미 가입된 아이디입니다. 로그인해주세요."
        Regex("Password should be", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "비밀번호가 너무 짧습니다. (보통 6자 이상)"
        Regex("email not confirmed", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "이메일 확인이 필요합니다 — Supabase Auth에서 Confirm email을 끄세요."
        Regex("email.*rate.?limit|email_send_rate_limit", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "이메일 발송 제한 초과 — Supabase Auth에서 Confirm email을 끄고 다시 시도해주세요."
        Regex("For security purposes|you can only request", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "잠시 (약 1분) 후 다시 시도해주세요."
        Regex("rate limit", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "요청이 많습니다. 잠시 후 다시 시도해주세요."
        Regex("signups not allowed|not enabled", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "회원가입이 비활성화됨 — Supabase Auth 설정을 확인하세요."
        Regex("unable to validate email|email.*not.*valid", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "이 아이디는 사용할 수 없습니다 — 다른 아이디를 시도해주세요."
        msg.isBlank() -> "로그인에 실패했습니다."
        else -> msg
    }
}

sealed interface SessionState {
    data object Loading : SessionState
    data class Ready(val session: UserSession) : SessionState
    data class Error(val message: String) : SessionState
}
