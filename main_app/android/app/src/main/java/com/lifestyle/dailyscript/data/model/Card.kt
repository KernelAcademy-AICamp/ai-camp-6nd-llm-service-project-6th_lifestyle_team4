package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Serializable
data class CardDto(
    @SerialName("card_id") val cardId: Long,
    @SerialName("work_id") val workId: Long,
    val quote: String,
    @SerialName("script_excerpt") val scriptExcerpt: String,
    @SerialName("excerpt_description") val excerptDescription: String? = null,
    val significance: String? = null,
    val keywords: JsonElement,
    val temperature: Int,
    val intensity: Int,
    @SerialName("view_count") val viewCount: Int? = null,
    // --- Bilingual originals (English). Present only on bilingual cards; null otherwise. ---
    @SerialName("quote_original") val quoteOriginal: String? = null,
    @SerialName("script_excerpt_original") val scriptExcerptOriginal: String? = null,
    @SerialName("excerpt_description_original") val excerptDescriptionOriginal: String? = null,
    @SerialName("significance_original") val significanceOriginal: String? = null,
    @SerialName("keywords_original") val keywordsOriginal: JsonElement? = null,
    val works: WorkDto? = null,
) {
    fun keywordList(): List<String> = parseKeywords(keywords)

    /** EN keyword array, used when the language toggle is set to English. */
    fun keywordListOriginal(): List<String> = parseKeywords(keywordsOriginal)

    /**
     * True when any English original exists → the KO/EN toggle should be shown.
     * Mirrors the PWA's check (m-app.js:1300).
     */
    fun hasEnglish(): Boolean {
        val w = works
        return !quoteOriginal.isNullOrBlank() ||
            !w?.titleOriginal.isNullOrBlank() ||
            !w?.subtitleOriginal.isNullOrBlank() ||
            !w?.authorOriginal.isNullOrBlank()
    }

    private fun parseKeywords(k: JsonElement?): List<String> = when (k) {
        is JsonArray -> k.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        is JsonPrimitive -> listOf(k.contentOrNull.orEmpty())
        else -> emptyList()
    }
}
