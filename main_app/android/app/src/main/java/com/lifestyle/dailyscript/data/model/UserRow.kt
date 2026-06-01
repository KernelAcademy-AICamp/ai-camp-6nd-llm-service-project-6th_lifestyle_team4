package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserRow(
    @SerialName("user_id") val userId: Long,
    @SerialName("anonymous_id") val anonymousId: String,
    val nickname: String? = null,
    val gender: String? = null,
    @SerialName("age_group") val ageGroup: String? = null,
    @SerialName("login_id") val loginId: String? = null,
)

@Serializable
data class UserInsert(
    @SerialName("anonymous_id") val anonymousId: String,
    val nickname: String? = null,
)
