package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * public.notifications 의 한 행 — 내 글/댓글/하이라이트에 다른 사용자가 댓글·대댓글을 달면
 * DB 트리거(040_notifications)가 자동 생성한다. (PWA 헤더 확성기 알림과 동일)
 *
 * kind: post_comment | comment_reply | highlight_comment | highlight_comment_reply
 *   - post_comment / comment_reply        → target_post_id (feed_post 상세로 이동)
 *   - highlight_comment / *_reply         → target_highlight_id (하이라이트 상세로 이동)
 */
@Serializable
data class AppNotification(
    @SerialName("notification_id") val notificationId: Long,
    @SerialName("actor_nickname") val actorNickname: String? = null,
    val kind: String,
    @SerialName("target_post_id") val targetPostId: Long? = null,
    @SerialName("target_highlight_id") val targetHighlightId: Long? = null,
    @SerialName("target_comment_id") val targetCommentId: Long? = null,
    @SerialName("body_preview") val bodyPreview: String? = null,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String,
)

/** unread 개수 집계용 — notification_id 만 읽는다. */
@Serializable
data class NotificationIdRow(
    @SerialName("notification_id") val notificationId: Long,
)
