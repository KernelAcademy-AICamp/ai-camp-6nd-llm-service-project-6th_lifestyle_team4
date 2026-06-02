package com.lifestyle.dailyscript.ui.feedback

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.FeedbackApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FeedbackViewModel : ViewModel() {

    private val _state = MutableStateFlow(FeedbackState())
    val state: StateFlow<FeedbackState> = _state.asStateFlow()

    fun submit(
        rating: Int,
        gender: String,
        age: String,
        liked: String,
        improve: String,
        message: String,
        email: String,
    ) {
        if (_state.value.submitting) return
        if (rating <= 0) {
            _state.value = _state.value.copy(error = "별점을 선택해주세요.")
            return
        }
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            runCatching {
                FeedbackApi.submit(rating, gender, age, liked.trim(), improve.trim(), message.trim(), email.trim())
            }.onSuccess {
                AppAnalytics.track(
                    "feedback_submitted",
                    mapOf(
                        "rating" to rating,
                        "gender" to gender,
                        "age_group" to age,
                    ),
                )
                _state.value = _state.value.copy(submitting = false, done = true)
            }.onFailure {
                _state.value = _state.value.copy(
                    submitting = false,
                    error = "전송에 실패했어요. 잠시 후 다시 시도해주세요.",
                )
            }
        }
    }
}

data class FeedbackState(
    val submitting: Boolean = false,
    val done: Boolean = false,
    val error: String? = null,
)
