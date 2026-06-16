package com.lifestyle.dailyscript.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand

private val BookCoverEasing = CubicBezierEasing(0.34f, 1.2f, 0.64f, 1f)

/**
 * 표지가 좌측 책등에서 펼쳐지는 책 모달의 공용 셸 (rotateY −100°→0° + scale 0.6→1, 약간의 오버슈트).
 * 애니메이션·다이얼로그·스윙 그래픽·룰드라인·가죽 책등이 동일하고 내용(헤더/본문)만 다른
 * 아카이브·라이브러리 두 모달을 합친 것. PWA .book-modal / .book 전환을 미러.
 *
 * @param onClose 즉시 닫기(아이템 열기 후처럼). 표지를 닫는 애니메이션은 [header]에 넘기는 dismiss 가 처리한다.
 * @param header  상단 책 머리말. 닫기(X) 버튼은 받은 dismiss 를 써야 표지가 스윙하며 닫힌다.
 * @param body    페이지 본문(명대사 항목들). Column 안에서 호출된다.
 */
@Composable
fun OpenedBookShell(
    leather: Color,
    onClose: () -> Unit,
    header: @Composable (dismiss: () -> Unit) -> Unit,
    body: @Composable ColumnScope.() -> Unit,
) {
    // progress 0→1 이 펼침을 구동. 닫을 땐 visible=false 로 닫힘 애니메이션이 끝난 뒤 진짜 onClose 호출.
    var visible by remember { mutableStateOf(true) }
    val progress = remember { Animatable(0f) }
    LaunchedEffect(visible) {
        progress.animateTo(
            targetValue = if (visible) 1f else 0f,
            animationSpec = tween(
                durationMillis = if (visible) 550 else 300,
                easing = if (visible) BookCoverEasing else LinearEasing,
            ),
        )
        if (!visible) onClose()
    }
    val dismiss: () -> Unit = { if (visible) visible = false }

    Dialog(
        onDismissRequest = dismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        // Drop the platform scrim — our own backdrop fades in step with the cover.
        (LocalView.current.parent as? DialogWindowProvider)?.window?.setDimAmount(0f)

        val p = progress.value
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0E0C0A).copy(alpha = 0.65f * p))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = dismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            val panelMaxHeight = maxHeight * 0.86f
            val panelWidth = if (maxWidth - 40.dp < 480.dp) maxWidth - 40.dp else 480.dp
            Box(
                modifier = Modifier
                    .width(panelWidth)
                    .heightIn(max = panelMaxHeight)
                    .graphicsLayer {
                        rotationY = -100f * (1f - p)
                        val s = 0.6f + 0.4f * p
                        scaleX = s
                        scaleY = s
                        alpha = (0.25f + 0.75f * p).coerceIn(0f, 1f)
                        transformOrigin = TransformOrigin(0f, 0.5f)
                        cameraDistance = 1500f * density
                    }
                    .background(Paper)
                    .drawBehind {
                        // Faint ruled lines down the page, then the leather spine edge.
                        val gap = 28.dp.toPx()
                        val stroke = 1.dp.toPx()
                        val rule = Color(0xFF6B5D4F).copy(alpha = 0.08f)
                        var y = gap
                        while (y < size.height) {
                            drawLine(rule, Offset(0f, y), Offset(size.width, y), stroke)
                            y += gap
                        }
                        drawRect(leather, Offset.Zero, Size(8.dp.toPx(), size.height))
                    }
                    // Swallow taps on the book so it doesn't dismiss the modal.
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .padding(start = 40.dp, top = 36.dp, end = 28.dp, bottom = 28.dp),
                ) {
                    header(dismiss)
                    Box(modifier = Modifier.height(20.dp))
                    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Sand))
                    Box(modifier = Modifier.height(12.dp))
                    body()
                    Box(modifier = Modifier.height(12.dp))
                    Text(
                        text = "— Daily Script · Limited Edition —",
                        style = TextStyle(fontSize = 10.sp, letterSpacing = 0.3.em, color = Sand),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
