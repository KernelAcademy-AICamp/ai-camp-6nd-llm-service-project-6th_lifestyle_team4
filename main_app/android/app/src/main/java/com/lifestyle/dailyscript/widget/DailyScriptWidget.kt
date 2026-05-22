package com.lifestyle.dailyscript.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.text.FontFamily
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

/**
 * iOS의 CurtaincallWidget 과 동일한 룩.
 *  - Paper(#FAF8F2) 배경
 *  - Espresso(#0E0C0A) 본문 (serif 명조체)
 *  - Walnut(#6B5D4F) 작품명 (uppercase + tracking)
 */
internal object DailyScriptWidget : GlanceAppWidget() {

    private val Paper = Color(0xFFFAF8F2)
    private val Espresso = Color(0xFF0E0C0A)
    private val Walnut = Color(0xFF6B5D4F)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        // 네트워크는 메인 스레드 금지 — withContext로 IO 디스패처에서 호출
        val card = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            WidgetDataLoader.fetchLatest()
        }
        provideContent {
            GlanceTheme {
                WidgetBody(card)
            }
        }
    }

    @Composable
    private fun WidgetBody(card: WidgetCard?) {
        Box(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(Paper)
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Column(modifier = GlanceModifier.fillMaxSize()) {
                val displayQuote = card?.quote?.let { "“${it}”" }
                    ?: "오늘의 한 줄을 불러오는 중"
                Text(
                    text = displayQuote,
                    style = TextStyle(
                        color = androidx.glance.color.ColorProvider(Espresso),
                        fontSize = 16.sp,
                        fontFamily = FontFamily.Serif,
                    ),
                    maxLines = 4,
                )
                Spacer(modifier = GlanceModifier.defaultWeight())
                if (!card?.workTitle.isNullOrBlank()) {
                    Text(
                        text = card!!.workTitle.uppercase(),
                        style = TextStyle(
                            color = androidx.glance.color.ColorProvider(Walnut),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.SansSerif,
                        ),
                    )
                }
            }
        }
    }
}
