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
    // 충전(구매) 실타래 잔액. 06_yarn.sql 적용 전/익명 신규 행을 위해 기본 0.
    @SerialName("yarn_balance") val yarnBalance: Int = 0,
)

@Serializable
data class UserInsert(
    @SerialName("anonymous_id") val anonymousId: String,
    val nickname: String? = null,
)
