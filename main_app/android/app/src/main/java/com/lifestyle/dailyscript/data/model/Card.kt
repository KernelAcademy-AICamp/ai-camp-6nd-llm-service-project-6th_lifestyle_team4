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
    val works: WorkDto? = null,
) {
    fun keywordList(): List<String> = when (val k = keywords) {
        is JsonArray -> k.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        is JsonPrimitive -> listOf(k.contentOrNull.orEmpty())
        else -> emptyList()
    }
}
