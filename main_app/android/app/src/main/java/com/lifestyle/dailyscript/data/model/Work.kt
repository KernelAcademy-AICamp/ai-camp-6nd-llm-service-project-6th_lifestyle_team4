package com.lifestyle.dailyscript.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class WorkDto(
    @SerialName("work_id") val workId: Long = 0,
    val title: String,
    val format: String,
    val author: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
)
