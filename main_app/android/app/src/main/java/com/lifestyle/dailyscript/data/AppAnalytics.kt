package com.lifestyle.dailyscript.data

import android.content.Context
import android.util.Log
import com.amplitude.android.Amplitude
import com.amplitude.android.AutocaptureOption
import com.amplitude.android.Configuration
import com.amplitude.core.events.Identify
import com.lifestyle.dailyscript.data.model.CardDto
import com.microsoft.clarity.Clarity
import com.microsoft.clarity.ClarityConfig
import com.microsoft.clarity.models.LogLevel

object AppAnalytics {
    private const val TAG = "AppAnalytics"

    private var amplitude: Amplitude? = null
    private var clarityEnabled = false

    fun init(context: Context, amplitudeApiKey: String, clarityProjectId: String) {
        val appContext = context.applicationContext

        if (amplitudeApiKey.isNotBlank() && amplitude == null) {
            amplitude = runCatching {
                Amplitude(
                    Configuration(
                        apiKey = amplitudeApiKey,
                        context = appContext,
                        // DB user_id(예: "42")는 SDK 기본 최소 id 길이(5)보다 짧아,
                        // 이 설정이 없으면 setUserId가 거부돼 모든 이벤트가 익명으로 잡힌다.
                        // PWA analytics.js의 minIdLength: 1 과 동일하게 맞춘다.
                        minIdLength = 1,
                        autocapture = setOf(AutocaptureOption.SESSIONS),
                    )
                )
            }
                .onFailure { Log.w(TAG, "Amplitude init failed", it) }
                .getOrNull()
        }

        if (clarityProjectId.isNotBlank() && !clarityEnabled) {
            clarityEnabled = runCatching {
                Clarity.initialize(
                    appContext,
                    ClarityConfig(
                        projectId = clarityProjectId,
                        logLevel = LogLevel.None,
                    )
                )
            }.onFailure {
                Log.w(TAG, "Clarity init failed", it)
            }.getOrDefault(false)
        }
    }

    fun identify(
        userId: Long,
        isAnonymous: Boolean,
        gender: String?,
        ageGroup: String?,
    ) {
        val id = userId.toString()
        runCatching { amplitude?.setUserId(id) }
        setUserProperties(
            mapOf(
                "account_type" to if (isAnonymous) "anonymous" else "member",
                "user_pk" to id,
                "gender" to gender,
                "age_group" to ageGroup,
            )
        )
        runCatching {
            if (clarityEnabled) Clarity.setCustomUserId(id)
        }
    }

    fun setUserProperties(props: Map<String, Any?>) {
        val identify = Identify()
        props.forEach { (key, value) ->
            if (value == null || (value is String && value.isBlank())) {
                identify.unset(key)
            } else {
                identify.set(key, value)
            }
        }
        runCatching { amplitude?.identify(identify) }
    }

    fun resetUser() {
        runCatching { amplitude?.reset() }
    }

    fun setScreen(name: String) {
        val screenName = name.take(255).ifBlank { return }
        runCatching { amplitude?.track("screen_viewed", mapOf("screen" to screenName)) }
        runCatching {
            if (clarityEnabled) Clarity.setCurrentScreenName(screenName)
        }
    }

    fun trackCard(name: String, card: CardDto, props: Map<String, Any?> = emptyMap()) {
        track(name, cardProperties(card) + props)
    }

    fun track(name: String, props: Map<String, Any?> = emptyMap()) {
        val cleanProps = props.filterValues { it != null }
        runCatching { amplitude?.track(name, cleanProps) }
        runCatching {
            if (clarityEnabled) Clarity.sendCustomEvent(name.take(254))
        }
    }

    private fun cardProperties(card: CardDto): Map<String, Any?> =
        mapOf(
            "card_id" to card.cardId,
            "work_id" to card.workId,
            "work_title" to card.works?.title,
            "format" to card.works?.format,
        )
}
