package com.lifestyle.dailyscript.ui.yarn

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.lifestyle.dailyscript.ui.components.YarnIcon
import com.lifestyle.dailyscript.ui.theme.WordmarkSerif
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * 출석 보상 애니메이션 (PWA playAttendanceRewardAnim 이식).
 * 시퀀스: 어두운 백드롭 + 중앙 버스트(실타래 ×N, 통통 bounce) → 우상단 실타래 칩으로 축소·이동
 *        → 도착 시 칩 안 실타래 이미지 bounce([onBounce]) + 잔액 카운트업([onCountTo]) → 정리([onFinished]).
 *
 * 전체화면 [Popup] 으로 띄워 좌표계를 window 절대값으로 맞춘다([chipCenter] = 칩 중심 window px).
 * 칩 위치를 아직 못 받았으면(Offset.Zero) 우상단 근처로 폴백.
 */
@Composable
fun YarnRewardAnimation(
    amount: Int,
    startBalance: Int,
    finalBalance: Int,
    chipCenter: () -> Offset,
    onCountTo: (Int) -> Unit,
    onBounce: () -> Unit,
    onFinished: () -> Unit,
) {
    Popup(alignment = Alignment.TopStart, properties = PopupProperties(focusable = false)) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val density = LocalDensity.current
            val wPx = with(density) { maxWidth.toPx() }
            val hPx = with(density) { maxHeight.toPx() }
            val centerX = wPx / 2f
            val centerY = hPx / 2f
            val fallbackTarget = Offset(
                x = wPx - with(density) { 56.dp.toPx() },
                y = with(density) { 96.dp.toPx() },
            )

            val backdropAlpha = remember { Animatable(0f) }
            val burstScale = remember { Animatable(1f) }
            val burstAlpha = remember { Animatable(0f) }
            val offX = remember { Animatable(0f) }
            val offY = remember { Animatable(0f) }
            val yarnBob = remember { Animatable(0f) }

            LaunchedEffect(Unit) {
                // 1) 페이드 인 + 실타래 통통 bounce(hold).
                launch { backdropAlpha.animateTo(1f, tween(300)) }
                launch { burstAlpha.animateTo(1f, tween(300)) }
                val bob = launch {
                    while (isActive) {
                        yarnBob.animateTo(-12f, tween(560, easing = LinearOutSlowInEasing))
                        yarnBob.animateTo(0f, tween(560, easing = FastOutLinearInEasing))
                    }
                }
                delay(1000)
                bob.cancel()
                yarnBob.snapTo(0f)

                // 2) 칩으로 축소·이동.
                val target = chipCenter().takeIf { it != Offset.Zero } ?: fallbackTarget
                launch { burstScale.animateTo(0.16f, tween(1100, easing = FastOutSlowInEasing)) }
                launch { offX.animateTo(target.x - centerX, tween(1100, easing = FastOutSlowInEasing)) }
                offY.animateTo(target.y - centerY, tween(1100, easing = FastOutSlowInEasing))

                // 3) 도착 — 칩 bounce + 잔액 카운트업 + 백드롭/버스트 페이드아웃.
                onBounce()
                launch { burstAlpha.animateTo(0f, tween(280)) }
                launch { backdropAlpha.animateTo(0f, tween(420)) }
                val counter = Animatable(startBalance.toFloat())
                counter.animateTo(finalBalance.toFloat(), tween(700, easing = FastOutSlowInEasing)) {
                    onCountTo(value.roundToInt())
                }
                onCountTo(finalBalance)
                delay(90)
                onFinished()
            }

            // 백드롭(딤).
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = backdropAlpha.value }
                    .background(Color.Black.copy(alpha = 0.42f)),
            )

            // 버스트 — 중앙 정렬 후 graphicsLayer 로 이동/축소.
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.graphicsLayer {
                        translationX = offX.value
                        translationY = offY.value
                        scaleX = burstScale.value
                        scaleY = burstScale.value
                        alpha = burstAlpha.value
                    },
                ) {
                    Text(
                        text = "ATTENDANCE",
                        style = TextStyle(fontSize = 13.sp, letterSpacing = 0.2.em, fontWeight = FontWeight.Medium),
                        color = Color.White.copy(alpha = 0.78f),
                    )
                    YarnIcon(
                        contentDescription = null,
                        modifier = Modifier
                            .size(180.dp)
                            .graphicsLayer { translationY = yarnBob.value }
                            .shadow(16.dp, CircleShape),
                    )
                    Text(
                        text = "×$amount",
                        style = TextStyle(
                            fontFamily = WordmarkSerif,
                            fontSize = 64.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                        color = Color.White,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}
