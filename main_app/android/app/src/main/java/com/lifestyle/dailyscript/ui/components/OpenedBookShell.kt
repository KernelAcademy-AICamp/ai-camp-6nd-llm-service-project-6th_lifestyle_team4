package com.lifestyle.dailyscript.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut

private val BookCoverEasing = CubicBezierEasing(0.34f, 1.2f, 0.64f, 1f)

/**
 * 표지가 좌측 책등에서 펼쳐지는 책 모달의 공용 셸 (rotateY −100°→0° + scale 0.6→1, 약간의 오버슈트).
 * 애니메이션·다이얼로그·스윙 그래픽·룰드라인·가죽 책등이 동일하고 내용(헤더/본문)만 다른
 * 아카이브·라이브러리 두 모달을 합친 것. PWA .book-modal / .book 전환을 미러.
 *
 * @param onClose 즉시 닫기(아이템 열기 후처럼). 표지를 닫는 애니메이션은 [header]에 넘기는 dismiss 가 처리한다.
 * @param header  상단 책 머리말. 닫기(X) 버튼은 받은 dismiss 를 써야 표지가 스윙하며 닫힌다.
 * @param intro   작품 소개(works.intro). 비어있지 않으면 divider 와 본문 사이에 메모 박스로 노출 (PWA .book-intro).
 * @param body    페이지 본문(명대사 항목들). Column 안에서 호출된다.
 */
@Composable
fun OpenedBookShell(
    leather: Color,
    /** 펼쳐지며 사라지는 가죽 표지에 금박으로 새길 제목(한글 대표 제목). */
    coverTitle: String,
    /** 표지 하단 저자(대문자). 없으면 생략. */
    coverAuthor: String? = null,
    /** 표지 맨 아래 권수 라벨(예: "VOL. 3"). 라이브러리처럼 권수가 없으면 null → 생략. */
    coverVolumeLabel: String? = null,
    onClose: () -> Unit,
    header: @Composable (dismiss: () -> Unit) -> Unit,
    intro: String? = null,
    /**
     * true 면 별도 Dialog 창이 아니라 호출한 화면 레이아웃 안에 깔린다 — 떠 있는 하단 바가 책 위에 보여
     * 책을 닫지 않고도 바로 다른 탭으로 넘어갈 수 있다. 호출부가 화면 전체를 채우는 컨테이너 안에서 마지막에
     * 그려줘야 본문 위에 덮인다. (false = 기존 Dialog 창, 화면 전체를 덮음)
     */
    asOverlay: Boolean = false,
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

    // 책 본문(스크림 + 펼쳐지는 책). asOverlay 면 현재 레이아웃에, 아니면 별도 Dialog 창에 그린다.
    val shellContent = @Composable {
        val p = progress.value
        // 오버레이 모드에선 떠 있는 하단 바 높이만큼 아래를 비워, 책이 바에 가리지 않고 그 위 영역에서 중앙 정렬되게 한다.
        // (스크림·클릭 영역은 padding 앞이라 화면 전체를 그대로 덮어 바 뒤까지 어두워진다.)
        val bottomInset = if (asOverlay) BottomBarContentInset else 0.dp
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0E0C0A).copy(alpha = 0.65f * p))
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = dismiss,
                )
                .padding(bottom = bottomInset),
            contentAlignment = Alignment.Center,
        ) {
            val panelMaxHeight = maxHeight * 0.86f
            val panelWidth = if (maxWidth - 40.dp < 480.dp) maxWidth - 40.dp else 480.dp
            // 책 모양 — 모서리를 둥글게 + 우측·하단으로 책배(페이지 두께)를 비져나오게 (iOS OpenedBookView 미러).
            val bookShape = RoundedCornerShape(8.dp)
            Box(
                modifier = Modifier
                    .width(panelWidth)
                    .heightIn(max = panelMaxHeight)
                    // 책 전체는 가볍게 확대되며 나타난다(iOS scaleEffect 0.9→1 + opacity). 펼침(회전)은 가죽 표지가 담당.
                    .graphicsLayer {
                        val s = 0.9f + 0.1f * p
                        scaleX = s
                        scaleY = s
                        // 책은 빠르게 또렷해진다(≈p 0.2 에서 불투명). 표지가 페이드인과 겹쳐 흐려지지 않고
                        // 열림 내내 또렷이 스윙해 보이도록.
                        alpha = (p / 0.2f).coerceIn(0f, 1f)
                    },
            ) {
                // --- 펼쳐진 페이지(본문) — 표지가 열리면 그 아래에서 드러난다 ---
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        // 책배(페이지 단면) — 좌측 책등의 반대편(우측·아래)으로 3겹이 살짝 비져나와 두께감을 준다.
                        // clip 이전이라 패널 경계 밖까지 그려진다.
                        .drawBehind {
                            val r = 8.dp.toPx()
                            val edge = Color(0xFFEFE7D6)
                            val line = Color.Black.copy(alpha = 0.06f)
                            for (i in 1..3) {
                                val dx = (3 * i).dp.toPx()
                                val dy = (2 * i).dp.toPx()
                                drawRoundRect(edge, topLeft = Offset(dx, dy), size = size, cornerRadius = CornerRadius(r, r))
                                drawRoundRect(line, topLeft = Offset(dx, dy), size = size, cornerRadius = CornerRadius(r, r), style = Stroke(0.5.dp.toPx()))
                            }
                        }
                        .clip(bookShape)
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
                        intro?.trim()?.takeIf { it.isNotEmpty() }?.let { text ->
                            BookIntroNote(text)
                            Box(modifier = Modifier.height(16.dp))
                        }
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
                // --- 가죽 표지 — 좌측 책등을 경첩 삼아 펼쳐지며(rotateY −4°→−165°) 페이지를 드러내고 사라진다.
                // 다 열리면(alpha 0) 컴포지션에서 빼, 투명한 표지가 그 아래 카드 탭을 가로채지 않게 한다.
                if (p < 0.999f) {
                    BookFrontCover(
                        leather = leather,
                        title = coverTitle,
                        author = coverAuthor,
                        volumeLabel = coverVolumeLabel,
                        modifier = Modifier
                            .matchParentSize()
                            .graphicsLayer {
                                rotationY = -4f - 161f * p
                                transformOrigin = TransformOrigin(0f, 0.5f)
                                cameraDistance = 1500f * density
                                // 정면→옆면으로 펼쳐지는 절반 동안 또렷이 보이다가, 옆면(≈−90°, p≈0.53)을
                                // 지나기 직전 사라진다 — 뒷면의 거울상 글자가 비치는 것도 막는다.
                                alpha = ((0.53f - p) / 0.2f).coerceIn(0f, 1f)
                            },
                    )
                }
            }
        }
    }

    if (asOverlay) {
        // 별도 Dialog 창이 아니라 현재 화면 레이아웃에 깔린다 → 떠 있는 하단 바가 책 위에 보이고, 다른 탭으로 바로 전환된다.
        // 열려 있는 동안엔 뒤로가기로 책을 닫는다(탭에서 벗어나지 않게).
        BackHandler(enabled = visible, onBack = dismiss)
        shellContent()
    } else {
        Dialog(
            onDismissRequest = dismiss,
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            // Drop the platform scrim — our own backdrop fades in step with the cover.
            (LocalView.current.parent as? DialogWindowProvider)?.window?.setDimAmount(0f)
            shellContent()
        }
    }
}

/**
 * 닫힌 가죽 표지 — 좌측 책등을 경첩 삼아 펼쳐지며 페이지를 드러낸다(iOS BookCover 미러).
 * 책 제목별 가죽색 위에 금박 프레임 + 'DAILY SCRIPT' / 제목 / 저자 / 권수를 새긴다.
 * 회전·페이드는 호출부의 graphicsLayer 가 담당하고, 여기선 표지의 정지 모습만 그린다.
 */
@Composable
private fun BookFrontCover(
    leather: Color,
    title: String,
    author: String?,
    volumeLabel: String?,
    modifier: Modifier = Modifier,
) {
    val gold = Color(0xFFE6CC82)
    val gilt = Color(0xFFC9A24B)
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .clip(shape)
            // 가죽 질감 — 가장자리는 어둡게, 가운데는 살짝 밝게 (iOS LinearGradient 5-stop 근사).
            .background(
                Brush.horizontalGradient(
                    0f to lerp(leather, Color.Black, 0.30f),
                    0.12f to leather,
                    0.5f to lerp(leather, Color.White, 0.06f),
                    0.86f to leather,
                    1f to lerp(leather, Color.Black, 0.34f),
                ),
            )
            .border(0.5.dp, Color.Black.copy(alpha = 0.3f), shape),
    ) {
        // 좌측 책등의 어두운 경첩 띠.
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .width(14.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Black.copy(alpha = 0.42f), Color.Black.copy(alpha = 0.04f)),
                    ),
                ),
        )
        // 금박 프레임.
        Box(
            modifier = Modifier
                .matchParentSize()
                .padding(16.dp)
                .border(1.dp, gold.copy(alpha = 0.7f), RoundedCornerShape(3.dp)),
        )
        // 제목/저자/권수 — 표지 가운데 정렬.
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 34.dp, vertical = 46.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "DAILY SCRIPT",
                style = TextStyle(fontSize = 11.sp, letterSpacing = 0.32.em, fontWeight = FontWeight.Medium),
                color = gold,
            )
            Box(modifier = Modifier.height(22.dp))
            Box(modifier = Modifier.width(40.dp).height(1.dp).background(gilt.copy(alpha = 0.7f)))
            Box(modifier = Modifier.height(22.dp))
            Text(
                text = title,
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 28.sp, lineHeight = 36.sp, textAlign = TextAlign.Center),
                color = gold,
            )
            author?.takeIf { it.isNotBlank() }?.let {
                Box(modifier = Modifier.height(20.dp))
                Text(
                    text = it.uppercase(),
                    style = TextStyle(fontSize = 12.sp, letterSpacing = 0.2.em, fontWeight = FontWeight.Medium),
                    color = gold,
                )
            }
            volumeLabel?.takeIf { it.isNotBlank() }?.let {
                Box(modifier = Modifier.height(20.dp))
                Text(
                    text = it,
                    style = TextStyle(fontFamily = EditorialSerif, fontSize = 15.sp),
                    color = gold,
                )
            }
        }
    }
}

/**
 * 작품 소개 메모 박스 — PWA .book-intro 미러. 인용 카드와 구별되도록 따뜻한 종이톤(Latte)에
 * 살짝 떠 있는 그림자를 주고, 위에 '작품 소개' 라벨을 붙여 설명임을 명확히 한다.
 */
@Composable
private fun BookIntroNote(intro: String) {
    val shape = RoundedCornerShape(3.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(6.dp, shape)
            .background(Latte, shape)
            .border(0.5.dp, Sand, shape)
            .padding(horizontal = 15.dp, vertical = 13.dp),
    ) {
        Text(
            text = "작품 소개",
            style = TextStyle(
                fontSize = 9.sp,
                letterSpacing = 0.22.em,
                fontWeight = FontWeight.Bold,
                color = Walnut,
            ),
        )
        Box(modifier = Modifier.height(7.dp))
        Text(
            text = intro,
            // PWA: font-size 13 / line-height 1.75 (≈ 22.75sp), 본문 기본 산세리프.
            style = TextStyle(fontSize = 13.sp, lineHeight = 22.75.sp, color = Espresso),
        )
    }
}
