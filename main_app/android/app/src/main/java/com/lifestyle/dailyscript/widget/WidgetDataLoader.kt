package com.lifestyle.dailyscript.widget

import com.lifestyle.dailyscript.BuildConfig
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * iOS의 WidgetDataLoader.swift 와 동일한 역할.
 * 위젯은 앱의 Supabase 클라이언트 의존성을 가져오지 않기 위해
 * REST API 를 직접 HTTPURLConnection 으로 호출한다.
 */
internal data class WidgetCard(val quote: String, val workTitle: String)

internal object WidgetDataLoader {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Row(
        val quote: String,
        val works: Work? = null,
    ) {
        @Serializable
        data class Work(val title: String = "")
    }

    fun fetchLatest(): WidgetCard? {
        val base = BuildConfig.SUPABASE_URL.trimEnd('/')
        val anon = BuildConfig.SUPABASE_ANON_KEY
        if (base.isBlank() || anon.isBlank()) return null

        val select = URLEncoder.encode("quote,works(title)", "UTF-8")
        val urlStr = "$base/rest/v1/cards?select=$select&order=card_id.desc&limit=1"
        val conn = (URL(urlStr).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("apikey", anon)
            setRequestProperty("Authorization", "Bearer $anon")
            setRequestProperty("Accept", "application/json")
            connectTimeout = 8000
            readTimeout = 8000
        }
        return try {
            if (conn.responseCode !in 200..299) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val rows = json.decodeFromString<List<Row>>(body)
            val row = rows.firstOrNull() ?: return null
            WidgetCard(quote = row.quote, workTitle = row.works?.title.orEmpty())
        } catch (_: Throwable) {
            null
        } finally {
            conn.disconnect()
        }
    }
}
