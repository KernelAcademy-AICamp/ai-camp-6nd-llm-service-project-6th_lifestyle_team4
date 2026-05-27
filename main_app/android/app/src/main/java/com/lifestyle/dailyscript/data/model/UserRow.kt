package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class UserRow(
    @SerialName("user_id") val userId: Long,
    @SerialName("anonymous_id") val anonymousId: String,
    val nickname: String? = null,
)

@Serializable
data class UserInsert(
    @SerialName("anonymous_id") val anonymousId: String,
    val nickname: String? = null,
)
