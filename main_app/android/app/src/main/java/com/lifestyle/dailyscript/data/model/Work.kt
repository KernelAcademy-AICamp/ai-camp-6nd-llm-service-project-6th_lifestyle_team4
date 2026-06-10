package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Serializable
data class WorkDto(
    @SerialName("work_id") val workId: Long = 0,
    val title: String,
    val subtitle: String? = null,
    val format: String,
    val author: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
    // 책 표지 이미지 (Supabase Storage 공개 URL). 표지 없는 책은 null → 미표시.
    @SerialName("cover_url") val coverUrl: String? = null,
    // jsonb array of character names — used for speaker bolding in the detail view.
    val characters: JsonElement? = null,
    // --- Bilingual originals (English). ---
    @SerialName("title_original") val titleOriginal: String? = null,
    @SerialName("subtitle_original") val subtitleOriginal: String? = null,
    @SerialName("author_original") val authorOriginal: String? = null,
) {
    fun characterList(): List<String> = when (val c = characters) {
        is JsonArray -> c.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotEmpty) }
        else -> emptyList()
    }
}
