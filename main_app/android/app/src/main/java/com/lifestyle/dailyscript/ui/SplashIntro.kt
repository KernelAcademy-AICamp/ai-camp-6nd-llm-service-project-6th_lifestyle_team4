package com.lifestyle.dailyscript.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.LastBaseline
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.R

/**
 * 로고 인트로 스플래시 — 웹(PWA) 스플래시와 동일 컨셉.
 *  「Daily / Script.」 워드마크(양쪽 i = 동일 책등) → 가운데로 확 모이며 → 심볼(책등+점)로.
 * 약 3초 재생 후 페이드아웃하며 onFinished() 호출.
 *
 * 색·모션은 브랜드 고정값(다크 카드 + 주황 포인트). 테마 무관하게 항상 검정 배경.
 */
private val Ink = Color(0xFF0E0C0A)
private val Cream = Color(0xFFFAF8F2)
private val Accent = Color(0xFFD85A30)

private fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t.coerceIn(0f, 1f)
private fun seg(p: Float, start: Float, end: Float): Float = ((p - start) / (end - start)).coerceIn(0f, 1f)

@Composable
fun SplashIntro(onFinished: () -> Unit) {
    val p = remember { Animatable(0f) }
    val rootAlpha = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        p.animateTo(1f, animationSpec = tween(durationMillis = 3000, easing = LinearEasing))
        rootAlpha.animateTo(0f, animationSpec = tween(durationMillis = 450))
        onFinished()
    }

    val prog = p.value
    // 타임라인 (전체 3000ms의 비율)
    val wordIn = seg(prog, 0.00f, 0.30f)   // 0 ~ 0.9s  워드마크 등장
    val gather = seg(prog, 0.58f, 0.75f)   // 1.74 ~ 2.25s  중앙으로 수축
    val symUp = seg(prog, 0.62f, 0.84f)    // 1.86 ~ 2.52s  심볼 솟음
    val dotPop = seg(prog, 0.80f, 0.95f)   // 2.4 ~ 2.85s  점 팝

    val wordAlpha = wordIn * (1f - gather)
    val wordScaleX = lerp(1f, 0.05f, gather)
    val wordTransY = lerp(16f, 0f, wordIn)
    val symAlpha = symUp
    val symScaleY = lerp(0.16f, 1f, symUp)
    val dotScale = if (dotPop < 0.7f) lerp(0f, 1.12f, dotPop / 0.7f) else lerp(1.12f, 1f, (dotPop - 0.7f) / 0.3f)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = rootAlpha.value }
            .background(Ink),
        contentAlignment = Alignment.Center,
    ) {
        // ── 워드마크 레이어 ──
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.graphicsLayer {
                alpha = wordAlpha
                scaleX = wordScaleX
                translationY = wordTransY
            },
        ) {
            WordLine(pre = "Da", post = "ly", withDot = false)
            Spacer(Modifier.height(2.dp))
            WordLine(pre = "Scr", post = "pt", withDot = true)
        }

        // ── 심볼 레이어 (책등 + 점) ──
        Row(
            verticalAlignment = Alignment.Bottom,
            modifier = Modifier.graphicsLayer {
                alpha = symAlpha
                scaleY = symScaleY
            },
        ) {
            Spine(width = 26.dp, height = 94.dp)
            Spacer(Modifier.width(11.dp))
            Box(
                modifier = Modifier
                    .padding(bottom = 2.dp)
                    .size(12.dp)
                    .graphicsLayer { scaleX = dotScale; scaleY = dotScale }
                    .clip(CircleShape)
                    .background(Accent),
            )
        }
    }
}

private val BodoniModa = FontFamily(Font(R.font.bodoni_moda))

private val wordStyle = TextStyle(
    fontFamily = BodoniModa,
    fontWeight = FontWeight.Normal,
    fontSize = 50.sp,
    color = Cream,
)

/** 책등(Box) 바닥을 텍스트 베이스라인에 맞추기 위해 baseline = 높이(=바닥)로 지정. */
private fun Modifier.baselineAtBottom(): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    layout(
        placeable.width,
        placeable.height,
        alignmentLines = mapOf(FirstBaseline to placeable.height, LastBaseline to placeable.height),
    ) {
        placeable.place(0, 0)
    }
}

@Composable
private fun WordLine(pre: String, post: String, withDot: Boolean) {
    // in-text 책등: 웹과 동일(높이 ≈ 0.64em). 책등 바닥을 텍스트 baseline에 정렬.
    Row(verticalAlignment = Alignment.Bottom) {
        Text(text = pre, style = wordStyle, modifier = Modifier.alignByBaseline())
        Spacer(Modifier.width(2.dp))
        Spine(width = 6.dp, height = 32.dp, modifier = Modifier.alignByBaseline().baselineAtBottom())
        Spacer(Modifier.width(2.dp))
        Text(text = post, style = wordStyle, modifier = Modifier.alignByBaseline())
        if (withDot) {
            Spacer(Modifier.width(2.dp))
            Text(text = ".", style = wordStyle.copy(color = Accent), modifier = Modifier.alignByBaseline())
        }
    }
}

/** 책등 — 주황 둥근 막대 + 크림 라벨 라인 2줄(두께 다름). */
@Composable
private fun Spine(width: Dp, height: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .width(width)
            .height(height)
            .clip(RoundedCornerShape(percent = 14))
            .background(Accent),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = width * 0.16f, end = width * 0.16f, top = height * 0.24f),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(height * 0.05f)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(Cream),
            )
            Spacer(Modifier.height(height * 0.07f))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(height * 0.032f)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(Cream.copy(alpha = 0.8f)),
            )
        }
    }
}
