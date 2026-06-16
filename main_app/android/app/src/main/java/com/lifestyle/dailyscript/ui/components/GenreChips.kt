package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.util.GENRE_ORDER
import com.lifestyle.dailyscript.ui.util.genreLabel

/**
 * 장르 필터 칩 줄 — 항목을 format 별로 집계해 'All · n / <장르> · n / 기타 · n' 칩을 가로 스크롤로 보여준다.
 * 아카이브(ShelfBook)와 라이브러리(LibraryBook)가 공유하며, 항목별 format 추출만 [formatOf]로 주입한다.
 */
@Composable
fun <T> GenreChips(
    items: List<T>,
    selected: String?,
    formatOf: (T) -> String?,
    onSelect: (String?) -> Unit,
) {
    val counts = items.groupingBy { formatOf(it)?.lowercase() ?: "other" }.eachCount()
    val present = GENRE_ORDER.filter { counts.containsKey(it) }
    val otherCount = counts.filterKeys { it !in GENRE_ORDER }.values.sum()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Chip(text = "All · ${items.size}", active = selected == null) { onSelect(null) }
        present.forEach { g ->
            Chip(text = "${genreLabel(g)} · ${counts[g]}", active = selected == g) { onSelect(g) }
        }
        if (otherCount > 0) {
            Chip(text = "기타 · $otherCount", active = selected == "other") { onSelect("other") }
        }
    }
}
