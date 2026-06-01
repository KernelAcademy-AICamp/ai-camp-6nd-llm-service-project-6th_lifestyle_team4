package com.lifestyle.dailyscript.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.repo.AuthRepository
import com.lifestyle.dailyscript.data.repo.UserSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Holds the bootstrapped session (user_id, anonymous flag, nickname) used across screens. */
class AppSessionViewModel : ViewModel() {

    private val authRepo = AuthRepository()

    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    /** Transient toast-style message for auth/nickname actions. */
    private val _authMessage = MutableStateFlow<String?>(null)
    val authMessage: StateFlow<String?> = _authMessage.asStateFlow()

    private val _authInProgress = MutableStateFlow(false)
    val authInProgress: StateFlow<Boolean> = _authInProgress.asStateFlow()

    init { bootstrap() }

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
            bootstrapIntoState()
        }
    }

    fun signIn(id: String, password: String, signUp: Boolean) {
        if (_authInProgress.value) return
        val current = (_state.value as? SessionState.Ready)?.session
        _authInProgress.value = true
        _authMessage.value = null
        viewModelScope.launch {
            runCatching {
                authRepo.signInWithId(id, password, signUp, current?.userId, current?.nickname)
            }.onSuccess {
                bootstrapIntoState()
                _authMessage.value = if (signUp) "가입 완료" else "로그인 됐어요"
            }.onFailure {
                _authMessage.value = friendlyAuthError(it.message.orEmpty())
            }
            _authInProgress.value = false
        }
    }

    fun updateNickname(newName: String) {
        val session = (_state.value as? SessionState.Ready)?.session ?: return
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) { _authMessage.value = "이름을 입력해주세요"; return }
        if (trimmed.length > 24) { _authMessage.value = "24자 이하로 입력해주세요"; return }
        viewModelScope.launch {
            runCatching { authRepo.updateNickname(session.userId, trimmed) }
                .onSuccess {
                    _state.value = SessionState.Ready(session.copy(nickname = trimmed))
                    _authMessage.value = "이름이 변경됐어요"
                }
                .onFailure { _authMessage.value = "저장 실패: ${it.message ?: ""}" }
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
                    _authMessage.value = "프로필이 저장됐어요"
                }
                .onFailure { _authMessage.value = "저장 실패: ${it.message ?: ""}" }
        }
    }

    fun consumeAuthMessage() { _authMessage.value = null }

    private suspend fun bootstrapIntoState() {
        _state.value = SessionState.Loading
        _state.value = runCatching { authRepo.bootstrap() }
            .map(SessionState::Ready)
            .getOrElse { SessionState.Error(it.messageOr("Sign-in failed")) }
    }

    private fun Throwable?.messageOr(fallback: String): String =
        this?.message?.takeIf { it.isNotBlank() } ?: fallback

    private fun friendlyAuthError(msg: String): String = when {
        Regex("Invalid login credentials", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "아이디 또는 비밀번호가 맞지 않습니다."
        Regex("User already registered", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "이미 가입된 아이디입니다. 로그인해주세요."
        Regex("Password should be at least|Password should be", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "비밀번호가 너무 짧습니다. (보통 6자 이상)"
        Regex("signups not allowed|not enabled", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "회원가입이 비활성화됨 — Supabase Auth 설정을 확인하세요."
        Regex("rate limit", RegexOption.IGNORE_CASE).containsMatchIn(msg) ->
            "요청이 많습니다. 잠시 후 다시 시도해주세요."
        msg.isBlank() -> "로그인에 실패했습니다."
        else -> msg
    }
}

sealed interface SessionState {
    data object Loading : SessionState
    data class Ready(val session: UserSession) : SessionState
    data class Error(val message: String) : SessionState
}
