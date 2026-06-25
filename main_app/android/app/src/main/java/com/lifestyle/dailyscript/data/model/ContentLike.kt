package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 피드 글 / 하이라이트 좋아요 (migration 043 content_likes). web/native 공용 DB.
 * target_type 으로 분기: feed_post(피드 글) | highlight(하이라이트).
 * 읽기 = content_like_counts 뷰(전체 카운트) + content_likes(내 좋아요), 쓰기 = toggle_content_like RPC.
 * PWA loadContentLikes()(m-app.js:1567) 미러.
 */
const val LIKE_FEED_POST = "feed_post"
const val LIKE_HIGHLIGHT = "highlight"

/** content_like_counts 뷰 한 행 — target 별 좋아요 총 개수. */
@Serializable
data class ContentLikeCountRow(
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: Long,
    @SerialName("like_count") val likeCount: Int,
)

/** content_likes 에서 현재 사용자가 누른 좋아요(어떤 target 인지)만 추린 행. */
@Serializable
data class MyContentLikeRow(
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: Long,
)

/** toggle_content_like RPC 반환 — 토글 후 상태. */
@Serializable
data class ToggleLikeResult(
    val liked: Boolean,
    val count: Int,
)

/** UI 표시용 — 카운트 + 내가 눌렀는지. */
data class LikeUi(
    val count: Int = 0,
    val liked: Boolean = false,
)
