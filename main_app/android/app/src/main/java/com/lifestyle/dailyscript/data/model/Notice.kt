package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A row from public.notices (migration 019). Admin-authored, read-only for the app.
 * tag ∈ { "update", "notice", "event" }.
 */
@Serializable
data class Notice(
    @SerialName("notice_id") val noticeId: Long,
    val tag: String = "notice",
    val title: String,
    val body: String,
    val pinned: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)
