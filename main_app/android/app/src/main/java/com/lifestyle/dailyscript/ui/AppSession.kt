package com.lifestyle.dailyscript.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.repo.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Holds the bootstrapped user_id used across screens. */
class AppSessionViewModel : ViewModel() {

    private val authRepo = AuthRepository()

    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    init { bootstrap() }

    fun bootstrap() {
        _state.value = SessionState.Loading
        viewModelScope.launch {
            _state.value = runCatching { authRepo.bootstrap() }
                .map(SessionState::Ready)
                .getOrElse { SessionState.Error(it.message ?: "Sign-in failed") }
        }
    }

    fun signOutAndReauth() {
        viewModelScope.launch {
            runCatching { authRepo.signOut() }
            bootstrap()
        }
    }
}

sealed interface SessionState {
    data object Loading : SessionState
    data class Ready(val userId: Long) : SessionState
    data class Error(val message: String) : SessionState
}
