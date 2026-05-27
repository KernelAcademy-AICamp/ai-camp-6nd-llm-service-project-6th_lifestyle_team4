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
    val format: String,
    val author: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
    // jsonb array of character names — used for speaker bolding in the detail view.
    val characters: JsonElement? = null,
) {
    fun characterList(): List<String> = when (val c = characters) {
        is JsonArray -> c.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotEmpty) }
        else -> emptyList()
    }
}
