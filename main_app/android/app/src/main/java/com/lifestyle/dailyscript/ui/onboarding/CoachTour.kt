package com.lifestyle.dailyscript.ui.onboarding

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Roast
import com.lifestyle.dailyscript.ui.theme.Walnut
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/**
 * Interactive spotlight onboarding tour — a native port of the PWA's onboarding.js coachmark.
 * Dims the screen, cuts a spotlight hole over a real on-screen element, shows a numbered badge
 * + tooltip, and advances when the highlighted element is tapped (or 건너뛰기 to skip).
 *
 * Scope: the HOME sequence (5 steps) + a closing card, mirroring the PWA's 홈 steps.
 */

data class CoachStep(
    val anchorId: String?,
    val scr: String,
    val n: Int,
    val tot: Int,
    val title: String,
    val desc: String,
    val final: Boolean = false,
    val cta: String? = null,
    val action: String? = null, // "openDetail" → run controller.onAction before advancing
    val advanceAfterAction: Boolean = true,
    val advanceOnSelect: Boolean = false, // pass touches through; advance when the script gets selected
    val requiresMember: Boolean = false,
)

val TOUR_STEPS: List<CoachStep> = listOf(
    // ── 홈 ──
    CoachStep("nav_home", "홈", 1, 5, "HOME", "여기가 홈이에요. 매일 새로운 고전 명대사 한 장이 도착해요."),
    CoachStep("home_refresh", "홈", 2, 5, "다른 명대사 보기", "지금 카드가 안 끌리면, 이 버튼을 누를 때마다 다른 명대사로 바뀌어요."),
    CoachStep("today_bookmark", "홈", 3, 5, "북마크해 두기", "마음에 들었다면 이 책갈피를 탭하세요. 나중에 다시 꺼내볼 수 있어요."),
    CoachStep("nav_archive", "홈", 4, 5, "내 서재(LIBRARY)", "북마크한 명대사는 여기 LIBRARY에 작품별 책으로 모여요."),
    CoachStep("today_read", "홈", 5, 5, "전문 읽으러 가기", "한 줄만으론 아쉽죠. 이 버튼을 누르면 그 장면 전체가 펼쳐져요.", action = "openDetail"),
    // ── 전문(상세) — 카드 안의 정보 + 하이라이트 ──
    CoachStep("detail_scene", "전문", 1, 5, "장면 설명(SCENE)", "이 명대사가 언제·어떤 상황에서 나온 말인지 먼저 짚어줘요."),
    CoachStep("detail_script", "전문", 2, 5, "명대사가 나온 장면", "그 장면의 대본을 그대로 옮겼어요. 명대사를 맥락 속에서 읽어보세요."),
    CoachStep("detail_significance", "전문", 3, 5, "작품의 의의", "이 작품이 왜 오래 사랑받는 고전인지, 그 의미까지 담았어요."),
    CoachStep("detail_script", "전문", 4, 5, "구절 하이라이트", "대본에서 마음에 닿는 문장을 길게 눌러 보세요. 노란 형광펜으로 표시되며 그 구절을 하이라이트할 수 있어요.", advanceOnSelect = true),
    CoachStep("detail_hl_button", "전문", 5, 5, "하이라이트 추가", "선택하면 오른쪽 아래에 뜨는 이 [하이라이트 추가] 버튼을 누르면 나만의 하이라이트로 저장돼요.", action = "saveHighlight", advanceAfterAction = false),
    // ── 피드 ──
    CoachStep("nav_feed", "피드", 1, 3, "피드에 담겼어요", "저장한 하이라이트는 여기 FEED에 모여요. 다른 독자들의 명장면도 함께 볼 수 있어요."),
    CoachStep("feed_today_chip", "피드", 2, 3, "오늘의 한줄", "이 ‘오늘의 한줄’ 탭을 눌러보세요. 북마크한 명대사에 짧은 한 줄 감상을 남기는 곳이에요.", action = "setFeedToday"),
    CoachStep("feed_fab", "피드", 3, 3, "한 줄 남기기", "이제 오른쪽 아래 + 버튼을 눌러보세요. 북마크한 명대사를 골라 오늘의 한줄을 남길 수 있어요.", action = "openFeedComposer", requiresMember = true),
    // ── 마침 ──
    CoachStep(null, "", 0, 0, "오늘의 명대사", "준비 끝!\n이제 오늘의 고전 명작을 만나러 가볼까요?", final = true, cta = "읽으러 가기"),
)

class CoachController {
    var active by mutableStateOf(false)
    var index by mutableStateOf(0)
    var pending by mutableStateOf(false)
    var memberActionsEnabled by mutableStateOf(true)
    val anchors = mutableStateMapOf<String, Rect>()
    private val actionHandlers = mutableMapOf<String, () -> Unit>()
    val steps: List<CoachStep>
        get() = numberedSteps(TOUR_STEPS.filter { memberActionsEnabled || !it.requiresMember })
    val current: CoachStep? get() = steps.getOrNull(index)

    /** The today card id, so the tour can open its detail (set from HomeScreen). */
    var tourCardId: Long? = null

    /** Host-provided hooks: run a step action (e.g. open detail), and clean up on finish/skip. */
    var onAction: ((String) -> Unit)? = null
    var onEnd: (() -> Unit)? = null

    /** Defer the tour until HOME is the current route (used from the MY tab). */
    fun configure(memberActionsEnabled: Boolean) {
        this.memberActionsEnabled = memberActionsEnabled
        if (index > steps.lastIndex) index = steps.lastIndex.coerceAtLeast(0)
    }
    fun requestStart() { pending = true }
    fun start() {
        pending = false
        index = 0
        active = true
        AppAnalytics.track("onboarding_start")
    }
    fun next() { if (index < steps.lastIndex) index++ else end() }
    fun end() { active = false; index = 0; pending = false; onEnd?.invoke() }
    fun setActionHandler(action: String, handler: (() -> Unit)?) {
        if (handler == null) actionHandlers.remove(action) else actionHandlers[action] = handler
    }
    fun performAction(action: String) {
        actionHandlers[action]?.invoke() ?: onAction?.invoke(action)
    }
}

private fun numberedSteps(steps: List<CoachStep>): List<CoachStep> {
    val totals = steps
        .filter { !it.final && it.scr.isNotBlank() }
        .groupingBy { it.scr }
        .eachCount()
    val seen = mutableMapOf<String, Int>()
    return steps.map { step ->
        if (step.final || step.scr.isBlank()) {
            step
        } else {
            val n = (seen[step.scr] ?: 0) + 1
            seen[step.scr] = n
            step.copy(n = n, tot = totals[step.scr] ?: step.tot)
        }
    }
}

val LocalCoachController = staticCompositionLocalOf<CoachController?> { null }

/** Report a composable's window bounds so the tour can spotlight it. No-op without a controller. */
fun Modifier.coachAnchor(controller: CoachController?, id: String): Modifier =
    if (controller == null) this
    else this.onGloballyPositioned { controller.anchors[id] = it.boundsInWindow() }

private val ScrimColor = Color(0xAD0E0C0A) // fixed dark dim (matches PWA rgba(14,12,10,0.68)), theme-independent

@Composable
fun CoachTourOverlay(controller: CoachController) {
    if (!controller.active) return
    val step = controller.current ?: return

    val density = LocalDensity.current
    val cta = Cta
    val padPx = with(density) { 8.dp.toPx() }
    val holeRadiusPx = with(density) { 12.dp.toPx() }
    val ringStrokePx = with(density) { 2.dp.toPx() }
    val ringMaxInsetPx = with(density) { 8.dp.toPx() }

    val pulse by rememberInfiniteTransition(label = "cmPulse").animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Restart), label = "cmPulseV",
    )

    var overlayOrigin by remember { mutableStateOf(Offset.Zero) }
    var tipHeight by remember { mutableStateOf(0) }

    val anchorRect = step.anchorId?.let { controller.anchors[it] }
    val hole: Rect? = if (!step.final && anchorRect != null) {
        Rect(
            anchorRect.left - overlayOrigin.x - padPx,
            anchorRect.top - overlayOrigin.y - padPx,
            anchorRect.right - overlayOrigin.x + padPx,
            anchorRect.bottom - overlayOrigin.y + padPx,
        )
    } else null

    val currentStep by rememberUpdatedState(step)
    val currentHole by rememberUpdatedState(hole)

    // A step whose target never appears (e.g. a card without a 작품의 의의 block) is skipped,
    // matching the PWA which advances past missing targets.
    LaunchedEffect(controller.index) {
        val s = controller.current ?: return@LaunchedEffect
        if (s.final || s.anchorId == null) return@LaunchedEffect
        var waited = 0
        while (waited < 1500 && controller.anchors[s.anchorId] == null) { delay(100); waited += 100 }
        if (controller.active && controller.anchors[s.anchorId] == null) controller.next()
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .onGloballyPositioned { overlayOrigin = it.boundsInWindow().topLeft }
            // advanceOnSelect steps (구절 하이라이트) let touches reach the real script so the user
            // can long-press to highlight; the step advances when a selection is made. Other steps
            // swallow touches and advance on a tap/long-press of the spotlight.
            .then(
                if (step.advanceOnSelect) Modifier
                else Modifier.pointerInput(Unit) {
                    val advance: (Offset) -> Unit = { pos ->
                        val s = currentStep
                        if (!s.final) {
                            val h = currentHole
                            if (h != null && h.contains(pos)) {
                                s.action?.let { controller.performAction(it) }
                                if (s.advanceAfterAction) controller.next()
                            }
                        }
                    }
                    detectTapGestures(onTap = advance, onLongPress = advance)
                },
            ),
    ) {
        val wPx = constraints.maxWidth.toFloat()
        val hPx = constraints.maxHeight.toFloat()

        // 1) Scrim with a punched spotlight hole + pulsing ring.
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen },
        ) {
            drawRect(ScrimColor)
            val h = hole
            if (h != null) {
                drawRoundRect(
                    color = Color.Black,
                    topLeft = h.topLeft,
                    size = h.size,
                    cornerRadius = CornerRadius(holeRadiusPx, holeRadiusPx),
                    blendMode = BlendMode.Clear,
                )
                val inset = ringMaxInsetPx * pulse
                drawRoundRect(
                    color = cta.copy(alpha = 0.85f * (1f - pulse)),
                    topLeft = Offset(h.left - inset, h.top - inset),
                    size = Size(h.width + inset * 2, h.height + inset * 2),
                    cornerRadius = CornerRadius(holeRadiusPx + inset, holeRadiusPx + inset),
                    style = Stroke(width = ringStrokePx),
                )
            }
        }

        if (step.advanceOnSelect) {
            TouchBlockersAround(hole = hole, widthPx = wPx, heightPx = hPx)
        }

        // 2) Step-number badge at the hole's top-left.
        if (hole != null) {
            val badge = with(density) { 30.dp.toPx() }
            val bx = (hole.left - badge * 0.5f).coerceIn(6f, wPx - badge - 6f)
            val by = (hole.top - badge * 0.5f).coerceIn(6f, hPx - badge - 6f)
            Box(
                modifier = Modifier
                    .offset { IntOffset(bx.roundToInt(), by.roundToInt()) }
                    .size(30.dp)
                    .background(cta, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = step.n.toString(),
                    color = Color.White,
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Black, fontSize = 15.sp),
                )
            }
        }

        // 3) Tooltip card — positioned below the target (top-half) or above it (bottom-half); centered when final.
        val belowTarget = hole != null && hole.center.y < hPx / 2f
        val gapPx = with(density) { 18.dp.toPx() }
        val edgePx = with(density) { 16.dp.toPx() }
        val tipY = when {
            step.final || hole == null -> ((hPx - tipHeight) / 2f).coerceAtLeast(edgePx)
            belowTarget -> (hole.bottom + gapPx).coerceAtMost(hPx - tipHeight - edgePx)
            else -> (hole.top - tipHeight - gapPx).coerceAtLeast(edgePx)
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(0, tipY.roundToInt()) }
                .padding(horizontal = 16.dp)
                .onGloballyPositioned { tipHeight = it.size.height },
        ) {
            CoachTooltip(step = step, onSkip = { controller.end() }, onCta = { controller.end() })
        }
    }
}

@Composable
private fun TouchBlockersAround(hole: Rect?, widthPx: Float, heightPx: Float) {
    if (hole == null) {
        TouchBlocker(0f, 0f, widthPx, heightPx)
        return
    }

    val left = hole.left.coerceIn(0f, widthPx)
    val top = hole.top.coerceIn(0f, heightPx)
    val right = hole.right.coerceIn(0f, widthPx)
    val bottom = hole.bottom.coerceIn(0f, heightPx)

    TouchBlocker(0f, 0f, widthPx, top)
    TouchBlocker(0f, bottom, widthPx, heightPx - bottom)
    TouchBlocker(0f, top, left, bottom - top)
    TouchBlocker(right, top, widthPx - right, bottom - top)
}

@Composable
private fun TouchBlocker(xPx: Float, yPx: Float, widthPx: Float, heightPx: Float) {
    if (widthPx <= 0f || heightPx <= 0f) return
    val density = LocalDensity.current
    Box(
        modifier = Modifier
            .offset { IntOffset(xPx.roundToInt(), yPx.roundToInt()) }
            .size(
                width = with(density) { widthPx.toDp() },
                height = with(density) { heightPx.toDp() },
            )
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        event.changes.forEach { it.consume() }
                    }
                }
            },
    )
}

@Composable
private fun CoachTooltip(step: CoachStep, onSkip: () -> Unit, onCta: () -> Unit) {
    val shape = RoundedCornerShape(if (step.final) 20.dp else 14.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .padding(
                horizontal = if (step.final) 30.dp else 18.dp,
                vertical = if (step.final) 30.dp else 16.dp,
            ),
        horizontalAlignment = if (step.final) Alignment.CenterHorizontally else Alignment.Start,
    ) {
        Text(
            text = (if (step.final) "사용법" else "사용법 · ${step.scr}").uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.24.em, fontWeight = FontWeight.Bold),
            color = Cta,
            textAlign = if (step.final) TextAlign.Center else TextAlign.Start,
        )
        Box(modifier = Modifier.height(if (step.final) 14.dp else 8.dp))
        Text(
            text = step.title,
            style = MaterialTheme.typography.titleLarge.copy(
                fontFamily = EditorialSerif,
                fontWeight = FontWeight.Bold,
                fontSize = if (step.final) 26.sp else 19.sp,
            ),
            color = Espresso,
            textAlign = if (step.final) TextAlign.Center else TextAlign.Start,
        )
        Box(modifier = Modifier.height(if (step.final) 16.dp else 7.dp))
        Text(
            text = step.desc,
            style = MaterialTheme.typography.bodyMedium.copy(
                lineHeight = if (step.final) 27.sp else 22.sp,
                fontSize = if (step.final) 16.sp else 14.sp,
            ),
            color = Roast,
            textAlign = if (step.final) TextAlign.Center else TextAlign.Start,
        )

        if (step.final) {
            Box(modifier = Modifier.height(24.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Espresso, RoundedCornerShape(12.dp))
                    .clickable(onClick = onCta)
                    .padding(vertical = 18.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = step.cta ?: "읽으러 가기",
                    style = MaterialTheme.typography.titleMedium.copy(fontFamily = EditorialSerif, fontSize = 18.sp),
                    color = Paper,
                )
            }
            Box(modifier = Modifier.height(14.dp))
            Text(
                text = "건너뛰기".uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.16.em),
                color = Walnut,
                modifier = Modifier.clickable(onClick = onSkip).padding(4.dp),
            )
        } else {
            Box(modifier = Modifier.height(12.dp))
            Text(
                text = "✋ 강조된 버튼을 눌러보세요",
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                color = Cta,
            )
            Box(modifier = Modifier.height(14.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "${step.scr} ${step.n} / ${step.tot}",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.16.em, fontWeight = FontWeight.Bold),
                    color = Walnut,
                )
                Text(
                    text = "건너뛰기".uppercase(),
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.16.em),
                    color = Walnut,
                    modifier = Modifier.clickable(onClick = onSkip).padding(4.dp),
                )
            }
        }
    }
}
