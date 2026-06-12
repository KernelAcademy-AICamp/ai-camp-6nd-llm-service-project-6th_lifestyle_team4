package com.lifestyle.dailyscript.ui.ozhouse

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.data.model.WorkDto
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.formatBookmarkDate
import com.lifestyle.dailyscript.ui.util.genreLabel
import com.lifestyle.dailyscript.ui.yarn.CalendarGrid
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

// ── 방 전용 팔레트(고정; 밤/낮은 시간 기반) ──
private val RWallDay = listOf(Color(0xFFFCF7EE), Color(0xFFF4ECDB), Color(0xFFEFE6D2))
private val RWallNight = listOf(Color(0xFF28324C), Color(0xFF303B56), Color(0xFF36415E))
private val RFloorDay = listOf(Color(0xFFDAC7A3), Color(0xFFCBB58D), Color(0xFFBFA77E))
private val RFloorNight = listOf(Color(0xFF6A5F48), Color(0xFF564D3A), Color(0xFF4A4231))
private val RWindowDay = listOf(Color(0xFFBFE0E8), Color(0xFFF3DEB0), Color(0xFFF6EAD0))
private val RWindowNight = listOf(Color(0xFF141D38), Color(0xFF1D2C52), Color(0xFF243353))
private val RWalnut = Color(0xFF6B5D4F)
private val RWoodDark = Color(0xFF5A4026)
private val RLatteC = Color(0xFFE8E1D3)
private val RCtaC = Color(0xFFD85A30)
private val REspC = Color(0xFF0E0C0A)
private val RPaperCard = Color(0xFFFBF6EC)
private val RGold = Color(0xFFC9A24B)
private val RBookSpines = listOf(
    Color(0xFFD85A30), Color(0xFFE8E1D3), Color(0xFFF4C20D),
    Color(0xFF6E8C4E), Color(0xFF8A6A45), Color(0xFF5E7A6B), Color(0xFF9C7B92),
)

private enum class OzSheet { ATTEND, BOOKMARKS, RECORDS }

private data class CatCase(
    val file: String, val aspect: Float, val cx: Float, val bottomPx: Float, val wFrac: Float, val flip: Boolean,
)

private val CAT_CASES = listOf(
    CatCase("cat_struck.png", 1.65f, 0.20f, 106f, 0.32f, false),
    CatCase("cat_confused.png", 1.68f, 0.21f, 106f, 0.31f, true),
    CatCase("cat_shelf_many.png", 1.63f, 0.20f, 106f, 0.32f, false),
    CatCase("cat_empty.png", 0.435f, 0.50f, 46f, 0.56f, false),
    CatCase("cat_idle.png", 0.698f, 0.50f, 48f, 0.42f, false),
    CatCase("cat_shelf_few.png", 0.595f, 0.50f, 50f, 0.42f, true),
    CatCase("cat_idle.png", 0.698f, 0.60f, 152f, 0.40f, false),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OzHouseScreen(userId: Long, onBack: () -> Unit, onOpenCard: (Long) -> Unit) {
    val vm: OzHouseViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }

    val night = remember { LocalTime.now().hour.let { it < 6 || it >= 19 } }
    var catCase by remember { mutableStateOf(CAT_CASES.random()) }
    var sheet by remember { mutableStateOf<OzSheet?>(null) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "뒤로", tint = Espresso)
            }
            Column(modifier = Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "OZ'S HOUSE",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                    color = Walnut,
                )
                Spacer(Modifier.height(2.dp))
                Text(text = "고양이 집", style = MaterialTheme.typography.bodyMedium, color = Espresso)
            }
            Spacer(Modifier.size(40.dp))
        }

        RoomScene(
            night = night,
            catCase = catCase,
            attendance = state.attendance,
            onReshuffleCat = { catCase = CAT_CASES.filter { it != catCase }.random() },
            onOpenAttend = { sheet = OzSheet.ATTEND },
            onOpenBookmarks = { sheet = OzSheet.BOOKMARKS },
            onOpenRecords = { sheet = OzSheet.RECORDS },
            modifier = Modifier.weight(1f),
        )
    }

    when (sheet) {
        OzSheet.ATTEND -> OzSheetContainer(onDismiss = { sheet = null }, title = "출석 달력") { AttendSheetBody(state) }
        OzSheet.BOOKMARKS -> OzSheetContainer(onDismiss = { sheet = null }, title = "내 북마크") {
            BookmarksSheetBody(state, onOpenCard = { sheet = null; onOpenCard(it) })
        }
        OzSheet.RECORDS -> OzSheetContainer(onDismiss = { sheet = null }, title = "나의 기록") {
            RecordsSheetBody(state, onOpenCard = { sheet = null; onOpenCard(it) })
        }
        null -> Unit
    }
}

// ════════════════════════ ROOM ════════════════════════

@Composable
private fun rememberAssetImage(path: String): ImageBitmap? {
    val context = LocalContext.current
    return remember(path) {
        runCatching { context.assets.open(path).use { BitmapFactory.decodeStream(it) }.asImageBitmap() }.getOrNull()
    }
}

@Composable
private fun RoomScene(
    night: Boolean,
    catCase: CatCase,
    attendance: Set<String>,
    onReshuffleCat: () -> Unit,
    onOpenAttend: () -> Unit,
    onOpenBookmarks: () -> Unit,
    onOpenRecords: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val s = maxWidth.value / 390f
        fun mx(v: Float): Dp = (v * s).dp

        Column(modifier = Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().weight(1f).background(Brush.verticalGradient(if (night) RWallNight else RWallDay)))
            Box(Modifier.fillMaxWidth().height(mx(300f)).background(Brush.verticalGradient(if (night) RFloorNight else RFloorDay)))
        }

        // 걸레받이 아래 바닥 그림자
        Box(
            modifier = Modifier.align(Alignment.BottomStart).offset(y = -mx(280f)).fillMaxWidth().height(mx(13f))
                .background(Brush.verticalGradient(listOf(Color(0x22000000), Color(0x00000000)))),
        )
        // 걸레받이(벽-바닥 턱)
        Box(
            modifier = Modifier.align(Alignment.BottomStart).offset(y = -mx(293f)).fillMaxWidth().height(mx(15f))
                .background(
                    Brush.verticalGradient(
                        if (night) listOf(Color(0xFF34406A), Color(0xFF2A3554), Color(0xFF222C46))
                        else listOf(Color(0xFFF5ECDC), Color(0xFFE7DBC2), Color(0xFFD2C09C)),
                    ),
                ),
        )

        Box(modifier = Modifier.align(Alignment.TopStart).offset(x = mx(16f), y = mx(8f))) {
            WindowPane(night = night, width = mx(98f), height = mx(118f))
        }
        // 창틀 선반 + 화분
        Box(
            modifier = Modifier.align(Alignment.TopStart).offset(x = mx(12f), y = mx(124f))
                .width(mx(106f)).height(mx(7f)).clip(RoundedCornerShape(3.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF7A5A3B), RWoodDark))),
        )
        Box(modifier = Modifier.align(Alignment.TopStart).offset(x = mx(88f), y = mx(86f))) {
            PottedPlant(width = mx(24f))
        }
        Box(modifier = Modifier.align(Alignment.TopStart).offset(x = mx(120f), y = mx(14f))) {
            WallBookshelf(width = mx(104f), onClick = onOpenBookmarks)
        }
        Box(modifier = Modifier.align(Alignment.TopStart).offset(x = mx(256f), y = mx(8f))) {
            WallCalendar(attendance = attendance, width = mx(102f), onClick = onOpenAttend)
        }
        Box(modifier = Modifier.align(Alignment.TopStart).offset(x = mx(274f), y = mx(152f))) {
            WallFrame(width = mx(76f), onClick = onOpenRecords)
        }

        // 소파 (중앙-우, 뒤)
        Box(modifier = Modifier.align(Alignment.BottomStart).offset(x = mx(138f), y = -mx(108f))) {
            Sofa(width = mx(200f), height = mx(102f))
        }
        // 러그 (중앙-앞)
        Rug(
            modifier = Modifier.align(Alignment.BottomStart).offset(x = mx(72f), y = -mx(36f))
                .width(mx(244f)).height(mx(58f)),
        )

        val cw = maxWidth * catCase.wFrac
        val ch = cw * catCase.aspect
        val catBmp = rememberAssetImage("cat/${catCase.file}")
        if (catBmp != null) {
            Image(
                bitmap = catBmp,
                contentDescription = "OZ",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .offset(x = maxWidth * catCase.cx - cw / 2f, y = -mx(catCase.bottomPx))
                    .width(cw).height(ch)
                    .graphicsLayer { scaleX = if (catCase.flip) -1f else 1f }
                    .clickable(onClick = onReshuffleCat),
            )
        }
    }
}

// ── 창문: 노을/달 + 빛무리 + 언덕 + 십자살 ──
@Composable
private fun WindowPane(night: Boolean, width: Dp, height: Dp) {
    val arch = RoundedCornerShape(topStartPercent = 46, topEndPercent = 46, bottomStartPercent = 7, bottomEndPercent = 7)
    Box(modifier = Modifier.width(width).height(height).clip(arch)) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(if (night) RWindowNight else RWindowDay)))
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height
            val sunColor = if (night) Color(0xFFF5EFD6) else Color(0xFFFFE39A)
            val sunC = if (night) Offset(w * 0.72f, h * 0.20f) else Offset(w * 0.5f, h * 0.26f)
            val sunR = if (night) w * 0.14f else w * 0.17f
            val glowR = sunR * (if (night) 2.4f else 2.9f)
            drawCircle(
                brush = Brush.radialGradient(listOf(sunColor.copy(alpha = if (night) 0.5f else 0.85f), Color.Transparent), center = sunC, radius = glowR),
                radius = glowR, center = sunC,
            )
            if (!night) {
                for (i in 0 until 8) {
                    val a = Math.toRadians((i * 45).toDouble())
                    drawLine(
                        sunColor.copy(alpha = 0.85f),
                        Offset(sunC.x + (Math.cos(a) * sunR * 1.35f).toFloat(), sunC.y + (Math.sin(a) * sunR * 1.35f).toFloat()),
                        Offset(sunC.x + (Math.cos(a) * sunR * 1.8f).toFloat(), sunC.y + (Math.sin(a) * sunR * 1.8f).toFloat()),
                        strokeWidth = w * 0.013f, cap = StrokeCap.Round,
                    )
                }
            }
            drawCircle(color = if (night) sunColor else Color(0xFFFFF1C2), radius = sunR, center = sunC)
            // 언덕
            val hill1 = if (night) Color(0xFF223056) else Color(0xFFC9A777)
            val hill2 = if (night) Color(0xFF1B2747) else Color(0xFFBD9A68)
            drawOval(hill1, topLeft = Offset(-w * 0.12f, h * 0.72f), size = Size(w * 0.72f, h * 0.55f))
            drawOval(hill2, topLeft = Offset(w * 0.38f, h * 0.76f), size = Size(w * 0.86f, h * 0.55f))
        }
        // 십자 살
        Box(Modifier.align(Alignment.Center).fillMaxHeight().width(2.dp).background(RWalnut))
        Box(Modifier.align(Alignment.Center).fillMaxWidth().height(2.dp).background(RWalnut))
        // 창틀
        Box(Modifier.fillMaxSize().border(width * 0.075f, RWalnut, arch))
    }
}

// ── 벽 책장: 두 선반 + 브래킷 + 책등 + 코랄 리본 ──
@Composable
private fun WallBookshelf(width: Dp, onClick: () -> Unit) {
    Column(modifier = Modifier.width(width).clickable(onClick = onClick)) {
        repeat(2) { shelf ->
            Box(modifier = Modifier.fillMaxWidth().height(width * 0.40f)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = width * 0.04f),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(width * 0.018f),
                ) {
                    val spines = if (shelf == 0) listOf(0, 1, 2, 3, 4) else listOf(5, 6, 0, 3, 1)
                    val heights = if (shelf == 0) listOf(0.78f, 0.92f, 0.66f, 0.84f, 0.74f) else listOf(0.86f, 0.7f, 0.9f, 0.76f, 0.82f)
                    val leans = if (shelf == 0) listOf(0f, 0f, 11f, 0f, 0f) else listOf(0f, -10f, 0f, 0f, 8f)
                    spines.forEachIndexed { i, idx ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight(heights[i])
                                .graphicsLayer {
                                    rotationZ = leans[i]
                                    transformOrigin = TransformOrigin(0.5f, 1f)
                                }
                                .clip(RoundedCornerShape(topStart = 1.5.dp, topEnd = 1.5.dp))
                                .background(RBookSpines[idx]),
                        )
                    }
                }
                // 코랄 북마크 리본 (윗 선반 책 사이로)
                if (shelf == 0) {
                    Box(
                        modifier = Modifier.align(Alignment.TopStart)
                            .offset(x = width * 0.34f, y = -width * 0.02f)
                            .width(width * 0.06f).height(width * 0.22f)
                            .background(RCtaC),
                    )
                }
            }
            // 선반(플랭크)
            Box(
                modifier = Modifier.fillMaxWidth().height(width * 0.05f)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF8A6A45), RWoodDark))),
            )
            // 브래킷
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = width * 0.12f), horizontalArrangement = Arrangement.SpaceBetween) {
                repeat(2) { Box(Modifier.width(width * 0.04f).height(width * 0.04f).background(Color(0xFF4A3420))) }
            }
            if (shelf == 0) Spacer(Modifier.height(width * 0.06f))
        }
    }
}

// ── 벽 달력: 고리 + 코랄 헤더 + 점 그리드 ──
@Composable
private fun WallCalendar(attendance: Set<String>, width: Dp, onClick: () -> Unit) {
    val today = remember { LocalDate.now() }
    val ym = remember { YearMonth.from(today) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // 걸이 고리
        Box(
            modifier = Modifier.width(width * 0.14f).height(width * 0.06f)
                .border(width * 0.018f, Color(0xFFA89272), RoundedCornerShape(topStartPercent = 60, topEndPercent = 60)),
        )
        Column(
            modifier = Modifier
                .width(width)
                .clip(RoundedCornerShape(8.dp))
                .background(RPaperCard)
                .border(0.5.dp, RLatteC, RoundedCornerShape(8.dp))
                .clickable(onClick = onClick),
        ) {
            Box(modifier = Modifier.fillMaxWidth().background(RCtaC).padding(vertical = 3.dp), contentAlignment = Alignment.Center) {
                Text(
                    text = "${today.monthValue}월",
                    style = TextStyle(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 11.sp),
                    color = RPaperCard,
                )
            }
            MiniMonthDots(attendance, today, ym, modifier = Modifier.padding(horizontal = 5.dp, vertical = 5.dp))
        }
    }
}

@Composable
private fun MiniMonthDots(history: Set<String>, today: LocalDate, ym: YearMonth, modifier: Modifier = Modifier) {
    val firstDow = ym.atDay(1).dayOfWeek
    val lead = if (firstDow == DayOfWeek.SUNDAY) 0 else firstDow.value
    val days = ym.lengthOfMonth()
    val rows = (lead + days + 6) / 7
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (r in 0 until rows) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.fillMaxWidth()) {
                for (c in 0 until 7) {
                    val day = r * 7 + c - lead + 1
                    val valid = day in 1..days
                    val on = valid && history.contains(ym.atDay(day).toString())
                    val isToday = valid && day == today.dayOfMonth
                    Box(modifier = Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                        if (valid) {
                            Box(
                                modifier = Modifier.fillMaxSize(0.66f).clip(CircleShape)
                                    .background(if (on) RCtaC else RLatteC)
                                    .then(if (isToday) Modifier.border(1.dp, REspC, CircleShape) else Modifier),
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── 나의 기록 액자: 만년필 + 코랄 잉크 + 명조 ──
@Composable
private fun WallFrame(width: Dp, onClick: () -> Unit) {
    Box(
        modifier = Modifier.width(width).height(width * 1.18f)
            .clip(RoundedCornerShape(3.dp))
            .background(Color(0xFF12100E))
            .clickable(onClick = onClick)
            .padding(width * 0.06f),
    ) {
        Column(
            modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(2.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFFFCF8EF), Color(0xFFF4ECDC))))
                .padding(horizontal = width * 0.06f, vertical = width * 0.05f),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Canvas(modifier = Modifier.fillMaxWidth(0.84f).aspectRatio(64f / 42f)) {
                val sc = size.width / 64f
                val ink = Path().apply {
                    moveTo(5 * sc, 34 * sc)
                    cubicTo(15 * sc, 27 * sc, 24 * sc, 37 * sc, 34 * sc, 31 * sc)
                    cubicTo(44 * sc, 25 * sc, 52 * sc, 25 * sc, 59 * sc, 29 * sc)
                }
                drawPath(ink, color = RCtaC, style = Stroke(width = 2.6f * sc, cap = StrokeCap.Round))
                rotate(degrees = 40f, pivot = Offset(40f * sc, 19f * sc)) {
                    drawRoundRect(Color(0xFF171411), Offset(36f * sc, 3f * sc), Size(8f * sc, 20f * sc), CornerRadius(4f * sc))
                    drawRect(RGold, Offset(36f * sc, 9.5f * sc), Size(8f * sc, 2.6f * sc))
                    drawRoundRect(Color(0xFF2C2620), Offset(36.5f * sc, 1.5f * sc), Size(7f * sc, 5f * sc), CornerRadius(3.5f * sc))
                    val nib = Path().apply {
                        moveTo(36.4f * sc, 22 * sc); lineTo(43.6f * sc, 22 * sc); lineTo(40f * sc, 33 * sc); close()
                    }
                    drawPath(nib, color = RGold)
                    drawLine(Color(0xFF171411), Offset(40f * sc, 24 * sc), Offset(40f * sc, 31.5f * sc), strokeWidth = 1f * sc)
                }
            }
            Spacer(Modifier.height(width * 0.05f))
            Text(
                text = "나의 기록",
                style = TextStyle(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 11.sp),
                color = Color(0xFF2C2620),
            )
        }
    }
}

// ── 러그: 동심 타원 링 + 점선 테두리 ──
@Composable
private fun Rug(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width; val h = size.height
        fun oval(frac: Float, c: Color) {
            drawOval(c, topLeft = Offset(w * (1 - frac) / 2f, h * (1 - frac) / 2f), size = Size(w * frac, h * frac))
        }
        oval(1f, Color(0xFFDED2B8))
        oval(0.70f, RWalnut)
        oval(0.64f, Color(0xFFE7DCC6))
        oval(0.36f, RCtaC)
        oval(0.30f, Color(0xFFEFE7D6))
        drawOval(
            color = RWalnut.copy(alpha = 0.4f),
            topLeft = Offset(1f, 1f), size = Size(w - 2f, h - 2f),
            style = Stroke(width = h * 0.03f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(h * 0.07f, h * 0.07f))),
        )
    }
}

// ── 소파: 등받이 + 팔걸이 + 방석 + 쿠션 + 다리 ──
@Composable
private fun Sofa(width: Dp, height: Dp) {
    val W = width; val H = height
    Box(modifier = Modifier.width(W).height(H)) {
        // 다리
        Box(Modifier.align(Alignment.BottomStart).offset(x = W * 0.12f).size(W * 0.05f, H * 0.10f).background(Color(0xFF43301C)))
        Box(Modifier.align(Alignment.BottomEnd).offset(x = -W * 0.12f).size(W * 0.05f, H * 0.10f).background(Color(0xFF43301C)))
        // 등받이
        Box(
            Modifier.align(Alignment.TopCenter).width(W * 0.84f).height(H * 0.56f)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 8.dp, bottomEnd = 8.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF7B5A3C), Color(0xFF6B4D32)))),
        )
        // 좌석 베이스
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = H * 0.08f).width(W * 0.88f).height(H * 0.46f)
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF8A6A45), RWoodDark))),
        )
        // 팔걸이
        Box(
            Modifier.align(Alignment.BottomStart).padding(bottom = H * 0.06f).width(W * 0.15f).height(H * 0.64f)
                .clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(listOf(Color(0xFF7B5A3C), Color(0xFF5F4329)))),
        )
        Box(
            Modifier.align(Alignment.BottomEnd).padding(bottom = H * 0.06f).width(W * 0.15f).height(H * 0.64f)
                .clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(listOf(Color(0xFF7B5A3C), Color(0xFF5F4329)))),
        )
        // 방석
        Row(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = H * 0.14f).width(W * 0.72f).height(H * 0.40f),
            horizontalArrangement = Arrangement.spacedBy(W * 0.02f),
        ) {
            repeat(2) {
                Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(10.dp)).background(Brush.verticalGradient(listOf(Color(0xFFF1E7D2), Color(0xFFE3D7BC)))))
            }
        }
        // 쿠션
        Box(
            Modifier.align(Alignment.BottomStart).offset(x = W * 0.22f, y = -H * 0.32f).size(W * 0.18f)
                .graphicsLayer { rotationZ = -7f }.clip(RoundedCornerShape(9.dp))
                .background(Brush.linearGradient(listOf(Color(0xFFF4C20D), Color(0xFFD9A800)))),
        )
        Box(
            Modifier.align(Alignment.BottomEnd).offset(x = -W * 0.22f, y = -H * 0.32f).size(W * 0.18f)
                .graphicsLayer { rotationZ = 8f }.clip(RoundedCornerShape(9.dp))
                .background(Brush.linearGradient(listOf(Color(0xFFE0683E), Color(0xFFC44E26)))),
        )
    }
}

// ════════════════════════ SHEETS ════════════════════════

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OzSheetContainer(onDismiss: () -> Unit, title: String, body: @Composable () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Paper) {
        Column(modifier = Modifier.fillMaxWidth().fillMaxHeight(0.9f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                color = Espresso,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 10.dp),
            )
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) { body() }
        }
    }
}

@Composable
private fun AttendSheetBody(state: OzHouseState) {
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatChip("${state.attendCount}일", "이번 달 출석", Modifier.weight(1f))
            StatChip("${state.attendStreak}일 🔥", "연속 출석", Modifier.weight(1f))
            StatChip("+5 / 일", "실타래 적립", Modifier.weight(1f))
        }
        Spacer(Modifier.height(16.dp))
        CalendarGrid(history = state.attendance)
        Spacer(Modifier.height(16.dp))
        Text(
            text = "매일 OZ의 집에 출석하면 실타래 5개가 적립돼요.",
            style = MaterialTheme.typography.bodySmall,
            color = Walnut,
        )
    }
}

@Composable
private fun StatChip(value: String, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clip(RoundedCornerShape(12.dp)).background(Sand.copy(alpha = 0.18f)).padding(vertical = 11.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = Espresso)
        Text(label, style = TextStyle(fontSize = 10.sp), color = Walnut)
    }
}

@Composable
private fun BookmarksSheetBody(state: OzHouseState, onOpenCard: (Long) -> Unit) {
    if (state.bookmarks.isEmpty()) {
        EmptyNote(if (state.loading) "불러오는 중⋯" else "아직 북마크한 한 줄이 없어요.")
        return
    }
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp)) {
        items(state.bookmarks, key = { it.bookmarkId }) { bm ->
            val card = bm.cards
            QuoteRow(card?.quote.orEmpty(), card?.works, bm.createdAt) { card?.let { onOpenCard(it.cardId) } }
        }
    }
}

@Composable
private fun RecordsSheetBody(state: OzHouseState, onOpenCard: (Long) -> Unit) {
    var tab by remember { mutableStateOf(0) }
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            RecTab("내 댓글", tab == 0, Modifier.weight(1f)) { tab = 0 }
            RecTab("내 한줄", tab == 1, Modifier.weight(1f)) { tab = 1 }
            RecTab("내 하이라이트", tab == 2, Modifier.weight(1f)) { tab = 2 }
        }
        Spacer(Modifier.height(6.dp))
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when (tab) {
                0 -> if (state.comments.isEmpty()) EmptyNote(emptyText(state, "아직 쓴 댓글이 없어요."))
                else LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 20.dp)) {
                    items(state.comments, key = { it.commentId }) { c ->
                        BodyRow(c.cards?.works, c.body, c.createdAt) { c.cards?.let { onOpenCard(it.cardId) } }
                    }
                }
                1 -> if (state.posts.isEmpty()) EmptyNote(emptyText(state, "아직 남긴 한줄이 없어요."))
                else LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 20.dp)) {
                    items(state.posts, key = { it.postId }) { p ->
                        BodyRow(p.cards?.works, p.body, p.createdAt) { p.cards?.let { onOpenCard(it.cardId) } }
                    }
                }
                else -> if (state.highlights.isEmpty()) EmptyNote(emptyText(state, "아직 만든 하이라이트가 없어요."))
                else LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 20.dp)) {
                    items(state.highlights, key = { it.highlightId }) { h ->
                        QuoteRow(h.selectedText, h.cards?.works, h.createdAt) { h.cards?.let { onOpenCard(it.cardId) } }
                    }
                }
            }
        }
    }
}

private fun emptyText(state: OzHouseState, normal: String) = if (state.loading) "불러오는 중⋯" else normal

@Composable
private fun RecTab(text: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier.clip(RoundedCornerShape(10.dp)).background(if (active) Espresso else Color.Transparent)
            .border(1.dp, if (active) Espresso else Sand, RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = if (active) Paper else Walnut, maxLines = 1)
    }
}

@Composable
private fun QuoteRow(quote: String, work: WorkDto?, createdAt: String, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp)) {
        Text(metaLine(work, createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        Spacer(Modifier.height(6.dp))
        Text(text = "“${quote.trim()}”", style = MaterialTheme.typography.titleLarge, color = Espresso, maxLines = 3)
        Spacer(Modifier.height(6.dp))
        Text(titleLine(work), style = MaterialTheme.typography.bodySmall, color = Sand)
    }
    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
}

@Composable
private fun BodyRow(work: WorkDto?, body: String, createdAt: String, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp)) {
        Text(metaLine(work, createdAt), style = MaterialTheme.typography.labelSmall, color = Walnut)
        Spacer(Modifier.height(6.dp))
        Text(titleLine(work), style = MaterialTheme.typography.titleLarge, color = Espresso)
        Spacer(Modifier.height(8.dp))
        Text(body.trim(), style = MaterialTheme.typography.bodyMedium, color = Espresso, maxLines = 4)
    }
    Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
}

@Composable
private fun EmptyNote(text: String) {
    Box(modifier = Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Walnut, textAlign = TextAlign.Center)
    }
}

private fun titleLine(w: WorkDto?): String = w?.title?.trim().orEmpty().ifBlank { "—" }

private fun metaLine(w: WorkDto?, createdAt: String): String =
    listOfNotNull(w?.format?.let { genreLabel(it) }, formatBookmarkDate(createdAt).ifBlank { null })
        .joinToString("  ·  ").uppercase()
