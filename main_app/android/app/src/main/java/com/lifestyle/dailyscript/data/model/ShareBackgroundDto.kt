package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * public.share_backgrounds (migration 042 / android 10) 한 행. 어드민(upload_web)이 작성, 앱은 읽기 전용.
 * premium/royal 카드지만 — 무료 8종은 앱 코드(ShareBackgrounds.SHARE_BACKGROUNDS)에 그대로 있다.
 * image_url 은 share-backgrounds 버킷의 공개 URL. ink 는 "#RRGGBB" 글자색.
 */
@Serializable
data class ShareBackgroundDto(
    val slug: String,
    val name: String,
    val tier: String,
    val price: Int = 0,
    @SerialName("image_url") val imageUrl: String,
    val ink: String = "#3B2A1A",
    @SerialName("work_title") val workTitle: String? = null,
    @SerialName("sort_order") val sortOrder: Int = 0,
)
