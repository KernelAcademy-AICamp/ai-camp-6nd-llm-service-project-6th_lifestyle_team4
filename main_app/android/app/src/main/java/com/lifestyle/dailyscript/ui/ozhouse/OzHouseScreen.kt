package com.lifestyle.dailyscript.ui.ozhouse

import android.graphics.BitmapFactory
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
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
import com.lifestyle.dailyscript.ui.yarn.SpendResult
import com.lifestyle.dailyscript.ui.yarn.YarnViewModel
import java.time.LocalTime
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

// ── 방 전용 팔레트(고정; 밤/낮은 시간/수동 토글 기반) ──
private val RWallDay = listOf(Color(0xFFFCF7EE), Color(0xFFF4ECDB), Color(0xFFEFE6D2))
private val RWallNight = listOf(Color(0xFF28324C), Color(0xFF303B56), Color(0xFF36415E))
private val RFloorDay = listOf(Color(0xFFDAC7A3), Color(0xFFCBB58D), Color(0xFFBFA77E))
private val RFloorNight = listOf(Color(0xFF6A5F48), Color(0xFF564D3A), Color(0xFF4A4231))
private val RWindowDay = listOf(Color(0xFFBFE0E8), Color(0xFFF3DEB0), Color(0xFFF6EAD0))
private val RWindowNight = listOf(Color(0xFF141D38), Color(0xFF1D2C52), Color(0xFF243353))
private val RWalnut = Color(0xFF6B5D4F)
private val RWoodDark = Color(0xFF5A4026)
private val RCtaC = Color(0xFFD85A30)
private val REspC = Color(0xFF0E0C0A)

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

// ════════════════ 꾸미기 카탈로그 (PWA oz-house DECOR) ════════════════

/** 테마 — 'default' 는 기본 보유, 'moby-dick' 은 구매(이미지) 가능, 나머지는 잠금(책 완독 해금). */
private data class OzThemeOpt(
    val id: String, val name: String, val nameEn: String,
    val locked: Boolean, val price: Int, val image: String? = null,
)

private val OZ_THEMES = listOf(
    OzThemeOpt("default", "기본", "Normal", false, 0),
    OzThemeOpt("moby-dick", "모비딕", "Moby-Dick", false, 200, "oz-themes/Mobydick.png"),
    OzThemeOpt("demian", "데미안", "Demian", true, 200),
    OzThemeOpt("gatsby", "위대한 개츠비", "The Great Gatsby", true, 200),
    OzThemeOpt("around-world", "80일 간의 세계일주", "Around the World in 80 Days", true, 200),
    OzThemeOpt("gullivers", "걸리버 여행기", "Gulliver's Travels", true, 200),
    OzThemeOpt("notre-dame", "노트르담 드 파리", "Notre-Dame de Paris", true, 200),
    OzThemeOpt("metamorphosis", "변신", "The Metamorphosis", true, 200),
    OzThemeOpt("sherlock", "셜록 홈즈", "Sherlock Holmes", true, 200),
    OzThemeOpt("divine-comedy", "신곡", "Divine Comedy", true, 200),
    OzThemeOpt("siddhartha", "싯다르타", "Siddhartha", true, 200),
    OzThemeOpt("phantom-opera", "오페라의 유령", "The Phantom of the Opera", true, 200),
    OzThemeOpt("romeo-juliet", "로미오와 줄리엣", "Romeo and Juliet", true, 200),
    OzThemeOpt("alice", "이상한 나라의 앨리스", "Alice in Wonderland", true, 200),
    OzThemeOpt("jungle-book", "정글북", "The Jungle Book", true, 200),
    OzThemeOpt("king-arthur", "아서왕", "King Arthur", true, 200),
    OzThemeOpt("frankenstein", "프랑켄슈타인", "Frankenstein", true, 200),
    OzThemeOpt("peter-pan", "피터 팬", "Peter Pan", true, 200),
    OzThemeOpt("midsummer", "한여름 밤의 꿈", "A Midsummer Night's Dream", true, 200),
)

/** 소파 변형 — 프레임/방석/쿠션 색 (PWA DECOR.sofa). */
private data class OzSofaOpt(
    val id: String, val name: String,
    val frame: Color, val frameD: Color, val seat: Color, val seatD: Color,
    val cushion: Color, val cushionD: Color,
    val pA: Color, val pAd: Color, val pB: Color, val pBd: Color,
)

private val OZ_SOFAS = listOf(
    OzSofaOpt("cream", "크림", Color(0xFF7B5A3C), Color(0xFF6E4F30), Color(0xFF8A6A45), Color(0xFF6E4F30), Color(0xFFF1E7D2), Color(0xFFE3D7BC), Color(0xFFF4C20D), Color(0xFFD9A800), Color(0xFFE0683E), Color(0xFFC44E26)),
    OzSofaOpt("coral", "코랄", Color(0xFFB5663B), Color(0xFF9A5230), Color(0xFFC2774A), Color(0xFFA8612F), Color(0xFFF6E3D3), Color(0xFFEBCBB2), Color(0xFF6E8C4E), Color(0xFF566F3C), Color(0xFFD85A30), Color(0xFFB8431F)),
    OzSofaOpt("sage", "세이지", Color(0xFF5E6E55), Color(0xFF4C5A45), Color(0xFF6E7E63), Color(0xFF566048), Color(0xFFE6E9D8), Color(0xFFD3D8BE), Color(0xFFE0683E), Color(0xFFC44E26), Color(0xFF9C8B79), Color(0xFF7E6F5E)),
    OzSofaOpt("ink", "잉크", Color(0xFF3A332C), Color(0xFF2A241F), Color(0xFF403933), Color(0xFF332D27), Color(0xFFD8CDBA), Color(0xFFC2B6A0), Color(0xFFF4C20D), Color(0xFFD9A800), Color(0xFFD85A30), Color(0xFFB8431F)),
)

private enum class RugKind { CORAL, SAND, SAGE, MONO }

private val OZ_RUGS = listOf(
    Triple("coral", "코랄 링", RugKind.CORAL),
    Triple("sand", "샌드", RugKind.SAND),
    Triple("sage", "세이지 링", RugKind.SAGE),
    Triple("mono", "모노", RugKind.MONO),
)

private val OZ_TOWERS = listOf("mini" to "미니", "cozy" to "코지", "tall" to "타워")

/** 빛무리(lightbeam) 모양 — 창에서 바닥으로 비스듬히 내려가는 평행사변형 (PWA clip-path polygon). */
private val LightBeamShape = GenericShape { size, _ ->
    moveTo(size.width * 0.30f, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width * 0.70f, size.height)
    lineTo(0f, size.height)
    close()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OzHouseScreen(userId: Long, yarnVm: YarnViewModel, onBack: () -> Unit, onOpenCard: (Long) -> Unit) {
    val vm: OzHouseViewModel = viewModel()
    val state by vm.state.collectAsState()
    LaunchedEffect(userId) { vm.load(userId) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // 낮/밤 — auto 면 시간 기반, 아니면 수동 토글값.
    val autoNight = remember { LocalTime.now().hour.let { it < 6 || it >= 19 } }
    val night = when (state.nightMode) {
        "day" -> false
        "night" -> true
        else -> autoNight
    }

    // 테마 — 이미지가 있는 비-default 테마면 배경 이미지로 방을 덮는다.
    val themeImagePath = OZ_THEMES.firstOrNull { it.id == state.theme }?.image
    val themeBmp = if (themeImagePath != null) rememberAssetImage(themeImagePath) else null
    val themed = state.theme != "default" && themeBmp != null
    val themeLabel = OZ_THEMES.firstOrNull { it.id == state.theme }?.nameEn ?: "Normal"

    // 고양이 자세 — 위치를 저장해 둔 포즈가 있으면 그 중 하나로 시작(따뜻한 캐시), 없으면 랜덤.
    var catIdx by remember {
        val saved = state.catPositions.keys.filter { it in CAT_CASES.indices }
        mutableStateOf(saved.randomOrNull() ?: CAT_CASES.indices.random())
    }
    // 콜드 캐시(시드 실패) 대비: load 후 저장 포즈가 생겼는데 현재 포즈가 미저장이면 저장된 포즈로 보정.
    LaunchedEffect(state.loading) {
        if (!state.loading) {
            val saved = state.catPositions.keys.filter { it in CAT_CASES.indices }
            if (saved.isNotEmpty() && catIdx !in saved) catIdx = saved.random()
        }
    }
    val idx = catIdx
    val catCase = CAT_CASES[idx]

    var editing by remember { mutableStateOf(false) }
    var trayExpanded by remember { mutableStateOf(true) }
    LaunchedEffect(editing) { if (editing) trayExpanded = true } // 편집 시작 땐 펼친 상태로.
    var activeTab by remember { mutableStateOf("theme") }
    var sheet by remember { mutableStateOf<OzSheet?>(null) }
    var themeDialog by remember { mutableStateOf<OzThemeOpt?>(null) }

    // 트레이 테마 스와치용 모비딕 미니어처 — 편집 중에만 로드.
    val mobyBmp = if (editing) rememberAssetImage("oz-themes/Mobydick.png") else null

    val showFurniture = !themed
    val sofaOptScene = if (showFurniture) OZ_SOFAS.firstOrNull { it.id == state.sofa } else null
    val rugKindScene = if (showFurniture) OZ_RUGS.firstOrNull { it.first == state.rug }?.third else null
    val towerScene = if (showFurniture) state.tower else "none"

    Box(modifier = Modifier.fillMaxSize().background(Paper)) {
        Column(modifier = Modifier.fillMaxSize()) {
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
                    Text(text = "오즈의 집", style = MaterialTheme.typography.bodyMedium, color = Espresso)
                }
                Text(
                    text = if (editing) "완료" else "꾸미기",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (editing) RCtaC else Espresso,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { editing = !editing }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                )
            }

            val catSavedPos = state.catPositions[idx]
            RoomScene(
                night = night,
                themed = themed,
                themeBmp = themeBmp,
                themeLabel = themeLabel,
                catCase = catCase,
                poseIndex = idx,
                savedX = catSavedPos?.first ?: -1f,
                savedY = catSavedPos?.second ?: -1f,
                sofaOpt = sofaOptScene,
                rugKind = rugKindScene,
                towerVariant = towerScene,
                sofaX = state.sofaX, sofaY = state.sofaY,
                rugX = state.rugX, rugY = state.rugY,
                towerX = state.towerX, towerY = state.towerY,
                editing = editing,
                onReshuffleCat = {
                    var n = CAT_CASES.indices.random()
                    if (CAT_CASES.size > 1) while (n == idx) n = CAT_CASES.indices.random()
                    catIdx = n
                    // 각 포즈는 자기 저장 위치(없으면 프리셋)로 복원 — 더는 위치를 지우지 않는다.
                },
                onCatMoved = { pose, x, y -> vm.setCatPos(pose, x, y) },
                onSofaMoved = { x, y -> vm.setSofaPos(x, y) },
                onRugMoved = { x, y -> vm.setRugPos(x, y) },
                onTowerMoved = { x, y -> vm.setTowerPos(x, y) },
                onToggleNight = { vm.setNightMode(if (night) "day" else "night") },
                onOpenAttend = { sheet = OzSheet.ATTEND },
                onOpenBookmarks = { sheet = OzSheet.BOOKMARKS },
                onOpenRecords = { sheet = OzSheet.RECORDS },
                modifier = Modifier.weight(1f),
            )
        }

        // 트레이 = 방 위에 떠 있는 바텀시트(오버레이). 방 크기를 바꾸지 않아 가구 위치가 어긋나지 않는다.
        // 핸들을 탭하면 접었다 펴서, 트레이에 가린 가구(러그 등)에 닿을 수 있다 (PWA tray-handle).
        if (editing) {
            DecorTray(
                state = state,
                activeTab = activeTab,
                onTab = { activeTab = it },
                mobyBmp = mobyBmp,
                themed = themed,
                catIdx = idx,
                onSelectCat = { catIdx = it },
                onSelectTheme = { opt ->
                    when {
                        opt.id == "default" -> vm.setTheme("default")
                        opt.id in state.purchasedThemes -> vm.setTheme(opt.id)
                        else -> themeDialog = opt // 구매(locked=false) 또는 해금 안내(locked=true)
                    }
                },
                onSelectSofa = { if (!themed) vm.setSofa(it) },
                onSelectRug = { if (!themed) vm.setRug(it) },
                onSelectTower = { if (!themed) vm.setTower(it) },
                expanded = trayExpanded,
                onToggleExpand = { trayExpanded = !trayExpanded },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
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

    // 테마 구매 / 해금 안내 (PWA openPromptModal).
    themeDialog?.let { opt ->
        val purchasable = !opt.locked
        AlertDialog(
            onDismissRequest = { themeDialog = null },
            confirmButton = {
                if (purchasable) {
                    TextButton(onClick = {
                        val id = opt.id
                        val price = opt.price
                        themeDialog = null
                        // 서버 실타래를 먼저 차감하고, 성공했을 때만 테마를 보유/적용한다.
                        scope.launch {
                            when (yarnVm.spend(price)) {
                                SpendResult.SUCCESS -> vm.purchaseTheme(id)
                                SpendResult.INSUFFICIENT -> Toast.makeText(context, "실타래가 부족해요", Toast.LENGTH_SHORT).show()
                                SpendResult.ERROR -> Toast.makeText(context, "구매에 실패했어요", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }) { Text("구매하기", color = RCtaC) }
                } else {
                    TextButton(onClick = { themeDialog = null }) { Text("확인", color = RCtaC) }
                }
            },
            dismissButton = if (purchasable) {
                ({ TextButton(onClick = { themeDialog = null }) { Text("취소", color = Walnut) } })
            } else {
                null
            },
            title = { Text(if (purchasable) "테마 구매" else "해금 안내", color = Espresso) },
            text = {
                Text(
                    text = if (purchasable) {
                        "'${opt.name}' 을(를) 구매하시겠습니까?\n실타래 ${opt.price}개가 사용됩니다."
                    } else {
                        "'${opt.name}' 은(는) 아직 해금되지 않았어요.\n책의 모든 카드를 다 읽으면 해금돼요."
                    },
                    color = Walnut,
                    style = MaterialTheme.typography.bodyMedium,
                )
            },
            containerColor = Paper,
        )
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
    themed: Boolean,
    themeBmp: ImageBitmap?,
    themeLabel: String,
    catCase: CatCase,
    poseIndex: Int,
    savedX: Float,
    savedY: Float,
    sofaOpt: OzSofaOpt?,
    rugKind: RugKind?,
    towerVariant: String,
    sofaX: Float,
    sofaY: Float,
    rugX: Float,
    rugY: Float,
    towerX: Float,
    towerY: Float,
    editing: Boolean,
    onReshuffleCat: () -> Unit,
    onCatMoved: (Int, Float, Float) -> Unit,
    onSofaMoved: (Float, Float) -> Unit,
    onRugMoved: (Float, Float) -> Unit,
    onTowerMoved: (Float, Float) -> Unit,
    onToggleNight: () -> Unit,
    onOpenAttend: () -> Unit,
    onOpenBookmarks: () -> Unit,
    onOpenRecords: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val s = maxWidth.value / 390f
        fun mx(v: Float): Dp = (v * s).dp
        val density = LocalDensity.current
        val wPx = with(density) { maxWidth.toPx() }
        val hPx = with(density) { maxHeight.toPx() }

        if (themed && themeBmp != null) {
            Image(
                bitmap = themeBmp,
                contentDescription = themeLabel,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            if (night) Box(Modifier.fillMaxSize().background(Color(0x55101A33)))
        } else {
            Column(modifier = Modifier.fillMaxSize()) {
                Box(Modifier.fillMaxWidth().weight(1f).background(Brush.verticalGradient(if (night) RWallNight else RWallDay)))
                // 마루 바닥 — 세로 마루널 줄 (PWA repeating-linear-gradient 90deg, 52px 간격).
                Box(
                    modifier = Modifier.fillMaxWidth().height(mx(300f))
                        .background(Brush.verticalGradient(if (night) RFloorNight else RFloorDay)),
                ) {
                    val plankStep = with(density) { mx(52f).toPx() }
                    val plankColor = if (night) Color(0x290A0F23) else Color(0x1A5A3A1E)
                    Canvas(Modifier.fillMaxSize()) {
                        var x = plankStep
                        while (x < size.width) {
                            drawLine(plankColor, start = Offset(x, 0f), end = Offset(x, size.height), strokeWidth = 1f)
                            x += plankStep
                        }
                    }
                }
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

            // 창에서 비스듬히 들어오는 햇/달빛 — 창 폭에 맞춘 좁은 빛줄기, 바닥 위·가구 뒤 (PWA .lightbeam).
            Box(
                modifier = Modifier.align(Alignment.TopCenter).offset(x = -mx(18f), y = mx(150f))
                    .width(mx(140f)).height(mx(230f))
                    .clip(LightBeamShape)
                    .background(
                        Brush.verticalGradient(
                            *(if (night) arrayOf(0f to Color(0x3896B4FF), 0.62f to Color(0x0096B4FF))
                              else arrayOf(0f to Color(0x4DF7D2A0), 0.62f to Color(0x00F7D2A0)))
                        ),
                    ),
            )

            // 창문 — 가운데 상단. 기본 테마에서 탭하면 낮/밤 토글 (PWA: 창문 그림을 직접 누름).
            Box(
                modifier = Modifier.align(Alignment.TopCenter).offset(y = mx(36f))
                    .clip(RoundedCornerShape(topStartPercent = 46, topEndPercent = 46))
                    .clickable(onClick = onToggleNight),
            ) {
                WindowPane(night = night, width = mx(108f), height = mx(126f))
            }
            // 창틀 선반 + 화분 — 창 아래 가운데 (PWA .sill / .sill-pot).
            Box(
                modifier = Modifier.align(Alignment.TopCenter).offset(y = mx(150f))
                    .width(mx(124f)).height(mx(8f)).clip(RoundedCornerShape(3.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF7A5A3B), RWoodDark))),
            )
            Box(modifier = Modifier.align(Alignment.TopCenter).offset(x = mx(34f), y = mx(118f))) {
                PottedPlant(width = mx(24f))
            }
            // 벽 책장·달력·액자 그림은 PWA처럼 그리지 않는다 — 진입은 우측 이모지 패널로 통일.

            // 캣타워 (우, 뒤) — 편집 모드에서 드래그.
            if (towerVariant != "none") {
                val tW = mx(72f); val tH = tW * 2.4f
                DraggableObject(
                    contentWidth = tW, contentHeight = tH,
                    presetLeftPx = wPx - with(density) { tW.toPx() } - with(density) { mx(6f).toPx() },
                    presetTopPx = hPx - with(density) { tH.toPx() } - with(density) { mx(110f).toPx() },
                    wPx = wPx, hPx = hPx, savedX = towerX, savedY = towerY,
                    editing = editing, dragKey = "tower-$towerVariant", onMoved = onTowerMoved,
                ) { Tower(width = tW, variant = towerVariant) }
            }
            // 소파 (중앙-우, 뒤)
            if (sofaOpt != null) {
                val sW = mx(200f); val sH = mx(102f)
                DraggableObject(
                    contentWidth = sW, contentHeight = sH,
                    presetLeftPx = with(density) { mx(138f).toPx() },
                    presetTopPx = hPx - with(density) { sH.toPx() } - with(density) { mx(108f).toPx() },
                    wPx = wPx, hPx = hPx, savedX = sofaX, savedY = sofaY,
                    editing = editing, dragKey = "sofa-${sofaOpt.id}", onMoved = onSofaMoved,
                ) { Sofa(opt = sofaOpt, width = sW, height = sH) }
            }
            // 러그 (중앙-앞)
            if (rugKind != null) {
                val rW = mx(244f); val rH = mx(58f)
                DraggableObject(
                    contentWidth = rW, contentHeight = rH,
                    presetLeftPx = with(density) { mx(72f).toPx() },
                    presetTopPx = hPx - with(density) { rH.toPx() } - with(density) { mx(36f).toPx() },
                    wPx = wPx, hPx = hPx, savedX = rugX, savedY = rugY,
                    editing = editing, dragKey = "rug-$rugKind", onMoved = onRugMoved,
                ) { Rug(modifier = Modifier.width(rW).height(rH), kind = rugKind) }
            }
        }

        // 좌상단 현재 테마 영문 라벨 (PWA oz-theme-label)
        Text(
            text = themeLabel,
            style = TextStyle(fontFamily = EditorialSerif, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = 0.08.em),
            color = if (themed || night) Color(0xFFF3EEDE) else REspC.copy(alpha = 0.72f),
            modifier = Modifier.align(Alignment.TopStart).offset(x = mx(14f), y = mx(12f)),
        )

        // 고양이 — 편집 중엔 드래그로 자리 옮김(저장), 평소엔 탭하면 새 자세. 가구와 동일한
        // 프리셋/오버라이드/드래그 로직이므로 DraggableObject 를 재사용한다. flip 은 content
        // 안쪽 Image 에만 걸어 바깥 박스의 드래그 좌표가 반전되지 않게 한다(드래그 방향 정상).
        val cw = maxWidth * catCase.wFrac
        val ch = cw * catCase.aspect
        val presetLeft = with(density) { (maxWidth * catCase.cx - cw / 2f).toPx() }
        val presetTop = hPx - with(density) { ch.toPx() } - with(density) { mx(catCase.bottomPx).toPx() }

        val catBmp = rememberAssetImage("cat/${catCase.file}")
        if (catBmp != null) {
            DraggableObject(
                contentWidth = cw, contentHeight = ch,
                presetLeftPx = presetLeft, presetTopPx = presetTop,
                wPx = wPx, hPx = hPx, savedX = savedX, savedY = savedY,
                editing = editing, dragKey = "cat-$poseIndex-$themed",
                onMoved = { x, y -> onCatMoved(poseIndex, x, y) },
                onTapWhenIdle = onReshuffleCat,
            ) {
                Image(
                    bitmap = catBmp,
                    contentDescription = "OZ",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .width(cw).height(ch)
                        .graphicsLayer { scaleX = if (catCase.flip) -1f else 1f },
                )
            }
        }

        // 우측 이모지 패널 — 북마크/출석/기록 시트 진입 (기본·테마 화면 공통, PWA wall-icons).
        Column(
            modifier = Modifier.align(Alignment.TopEnd).padding(top = mx(56f), end = mx(12f)),
            verticalArrangement = Arrangement.spacedBy(mx(12f)),
        ) {
            WallIconBtn("📚", "북마크", onOpenBookmarks)
            WallIconBtn("📅", "출석", onOpenAttend)
            WallIconBtn("📝", "기록", onOpenRecords)
        }
    }
}

/**
 * 편집 모드에서 드래그로 옮기는 방 안 오브젝트(가구). 위치는 중심 비율(0~1)로 저장 — PWA layout[selector].
 * 저장값이 없으면(savedX<0) 프리셋 위치(presetLeftPx/presetTopPx) 사용.
 */
@Composable
private fun BoxScope.DraggableObject(
    contentWidth: Dp,
    contentHeight: Dp,
    presetLeftPx: Float,
    presetTopPx: Float,
    wPx: Float,
    hPx: Float,
    savedX: Float,
    savedY: Float,
    editing: Boolean,
    dragKey: Any,
    onMoved: (Float, Float) -> Unit,
    onTapWhenIdle: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val cwPx = with(density) { contentWidth.toPx() }
    val chPx = with(density) { contentHeight.toPx() }
    val hasOverride = savedX in 0f..1f && savedY in 0f..1f
    val initLeft = if (hasOverride) savedX * wPx - cwPx / 2f else presetLeftPx
    val initTop = if (hasOverride) savedY * hPx - chPx / 2f else presetTopPx
    var pos by remember(dragKey, hasOverride, wPx, hPx) { mutableStateOf(Offset(initLeft, initTop)) }
    Box(
        modifier = Modifier
            .align(Alignment.TopStart)
            .offset { IntOffset(pos.x.roundToInt(), pos.y.roundToInt()) }
            .then(
                if (editing) {
                    Modifier
                        .border(2.dp, RCtaC, RoundedCornerShape(8.dp))
                        .pointerInput(dragKey, wPx, hPx) {
                            detectDragGestures(
                                onDragEnd = {
                                    val cx = ((pos.x + cwPx / 2f) / wPx).coerceIn(0f, 1f)
                                    val cy = ((pos.y + chPx / 2f) / hPx).coerceIn(0f, 1f)
                                    onMoved(cx, cy)
                                },
                            ) { change, drag ->
                                change.consume()
                                pos = Offset(
                                    (pos.x + drag.x).coerceIn(0f, (wPx - cwPx).coerceAtLeast(0f)),
                                    (pos.y + drag.y).coerceIn(0f, (hPx - chPx).coerceAtLeast(0f)),
                                )
                            }
                        }
                } else if (onTapWhenIdle != null) {
                    // 평소(비편집)엔 탭 동작이 있는 오브젝트(예: 고양이 자세 바꾸기)에만 클릭을 단다.
                    Modifier.clickable(onClick = onTapWhenIdle)
                } else {
                    Modifier
                },
            ),
    ) { content() }
}

// ── 창턱 화분 ──
@Composable
private fun PottedPlant(width: Dp) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(modifier = Modifier.width(width).height(width * 0.9f)) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width; val h = size.height
                val leaf = Color(0xFF6E8C4E)
                drawOval(leaf, topLeft = Offset(w * 0.30f, 0f), size = Size(w * 0.40f, h * 0.85f))
                rotate(degrees = -26f, pivot = Offset(w * 0.5f, h)) {
                    drawOval(leaf.copy(alpha = 0.92f), topLeft = Offset(w * 0.08f, h * 0.18f), size = Size(w * 0.36f, h * 0.7f))
                }
                rotate(degrees = 26f, pivot = Offset(w * 0.5f, h)) {
                    drawOval(leaf.copy(alpha = 0.92f), topLeft = Offset(w * 0.56f, h * 0.18f), size = Size(w * 0.36f, h * 0.7f))
                }
            }
        }
        Box(
            modifier = Modifier.width(width * 0.62f).height(width * 0.5f)
                .clip(RoundedCornerShape(topStart = 2.dp, topEnd = 2.dp, bottomStart = 6.dp, bottomEnd = 6.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFFC77B4A), Color(0xFFA85F33)))),
        )
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

// ── 러그: 변형별 동심 타원 + 점선 테두리 ──
@Composable
private fun Rug(modifier: Modifier = Modifier, kind: RugKind) {
    Canvas(modifier = modifier) {
        val w = size.width; val h = size.height
        fun oval(frac: Float, c: Color) {
            drawOval(c, topLeft = Offset(w * (1 - frac) / 2f, h * (1 - frac) / 2f), size = Size(w * frac, h * frac))
        }
        when (kind) {
            RugKind.CORAL -> {
                oval(1f, Color(0xFFDED2B8)); oval(0.70f, RWalnut); oval(0.64f, Color(0xFFE7DCC6)); oval(0.36f, RCtaC); oval(0.30f, Color(0xFFEFE7D6))
            }
            RugKind.SAGE -> {
                oval(1f, Color(0xFFDCE2CC)); oval(0.70f, Color(0xFF5E7A55)); oval(0.64f, Color(0xFFE2E6D2)); oval(0.36f, Color(0xFF8FA968)); oval(0.30f, Color(0xFFE9ECDB))
            }
            RugKind.MONO -> {
                oval(1f, Color(0xFFE7DECB)); oval(0.58f, Color(0xFF2C2620)); oval(0.54f, Color(0xFFF1ECE0))
            }
            RugKind.SAND -> {
                oval(1f, Color(0xFFD8C9A6)); oval(0.85f, Color(0xFFE9DEC9)); oval(0.70f, Color(0xFFD8C9A6)); oval(0.55f, Color(0xFFE9DEC9)); oval(0.40f, Color(0xFFD8C9A6)); oval(0.25f, Color(0xFFE9DEC9))
            }
        }
        drawOval(
            color = RWalnut.copy(alpha = 0.4f),
            topLeft = Offset(1f, 1f), size = Size(w - 2f, h - 2f),
            style = Stroke(width = h * 0.03f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(h * 0.07f, h * 0.07f))),
        )
    }
}

// ── 소파: 등받이 + 팔걸이 + 방석 + 쿠션 + 다리 (변형 색상 OzSofaOpt) ──
@Composable
private fun Sofa(opt: OzSofaOpt, width: Dp, height: Dp) {
    val W = width; val H = height
    Box(modifier = Modifier.width(W).height(H)) {
        // 다리
        Box(Modifier.align(Alignment.BottomStart).offset(x = W * 0.12f).size(W * 0.05f, H * 0.10f).background(Color(0xFF43301C)))
        Box(Modifier.align(Alignment.BottomEnd).offset(x = -W * 0.12f).size(W * 0.05f, H * 0.10f).background(Color(0xFF43301C)))
        // 등받이
        Box(
            Modifier.align(Alignment.TopCenter).width(W * 0.84f).height(H * 0.56f)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 8.dp, bottomEnd = 8.dp))
                .background(Brush.verticalGradient(listOf(opt.frame, opt.frameD))),
        )
        // 좌석 베이스
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = H * 0.08f).width(W * 0.88f).height(H * 0.46f)
                .clip(RoundedCornerShape(12.dp))
                .background(Brush.verticalGradient(listOf(opt.seat, opt.seatD))),
        )
        // 팔걸이
        Box(
            Modifier.align(Alignment.BottomStart).padding(bottom = H * 0.06f).width(W * 0.15f).height(H * 0.64f)
                .clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(listOf(opt.frame, opt.frameD))),
        )
        Box(
            Modifier.align(Alignment.BottomEnd).padding(bottom = H * 0.06f).width(W * 0.15f).height(H * 0.64f)
                .clip(RoundedCornerShape(14.dp)).background(Brush.verticalGradient(listOf(opt.frame, opt.frameD))),
        )
        // 방석
        Row(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = H * 0.14f).width(W * 0.72f).height(H * 0.40f),
            horizontalArrangement = Arrangement.spacedBy(W * 0.02f),
        ) {
            repeat(2) {
                Box(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(10.dp)).background(Brush.verticalGradient(listOf(opt.cushion, opt.cushionD))))
            }
        }
        // 쿠션
        Box(
            Modifier.align(Alignment.BottomStart).offset(x = W * 0.22f, y = -H * 0.32f).size(W * 0.18f)
                .graphicsLayer { rotationZ = -7f }.clip(RoundedCornerShape(9.dp))
                .background(Brush.linearGradient(listOf(opt.pA, opt.pAd))),
        )
        Box(
            Modifier.align(Alignment.BottomEnd).offset(x = -W * 0.22f, y = -H * 0.32f).size(W * 0.18f)
                .graphicsLayer { rotationZ = 8f }.clip(RoundedCornerShape(9.dp))
                .background(Brush.linearGradient(listOf(opt.pB, opt.pBd))),
        )
    }
}

// ── 캣타워: 베이스 + 기둥 + 선반 + 집(구멍) + 방석 (변형 mini/cozy/tall) ──
@Composable
private fun Tower(width: Dp, variant: String) {
    val H = width * 2.4f
    val wood = Brush.verticalGradient(listOf(Color(0xFFDAC79E), Color(0xFFC9B184)))
    val plank = Color(0xFF8A6A45)
    val house = Color(0xFF8A6A45)
    Column(
        modifier = Modifier.width(width).height(H),
        verticalArrangement = Arrangement.Bottom,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // 방석 (맨 위)
        Box(Modifier.width(width * 0.42f).height(H * 0.05f).clip(RoundedCornerShape(4.dp)).background(RCtaC))
        when (variant) {
            "mini" -> {
                Box(Modifier.width(width * 0.78f).height(H * 0.04f).clip(RoundedCornerShape(3.dp)).background(plank))
                Box(Modifier.width(width * 0.2f).height(H * 0.42f).background(wood))
            }
            "cozy" -> {
                Box(Modifier.width(width * 0.6f).height(H * 0.035f).clip(RoundedCornerShape(3.dp)).background(plank))
                TowerHouse(width, H, house)
                Box(Modifier.width(width * 0.2f).height(H * 0.28f).background(wood))
            }
            else -> { // tall
                Box(Modifier.width(width * 0.6f).height(H * 0.035f).clip(RoundedCornerShape(3.dp)).background(plank))
                TowerHouse(width, H, house)
                Box(Modifier.width(width * 0.2f).height(H * 0.10f).background(wood))
                Box(Modifier.width(width * 0.78f).height(H * 0.04f).clip(RoundedCornerShape(3.dp)).background(plank))
                Box(Modifier.width(width * 0.2f).height(H * 0.24f).background(wood))
            }
        }
        // 베이스
        Box(Modifier.width(width).height(H * 0.05f).clip(RoundedCornerShape(6.dp)).background(plank))
    }
}

@Composable
private fun TowerHouse(width: Dp, H: Dp, color: Color) {
    Box(
        modifier = Modifier.width(width * 0.72f).height(H * 0.20f).clip(RoundedCornerShape(8.dp)).background(color),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(width * 0.28f).clip(CircleShape).background(Color(0xFF3A2A1A)))
    }
}

// ── 우측 이모지 진입 버튼 (테마 적용 시 벽 소품 대체) ──
@Composable
private fun WallIconBtn(emoji: String, label: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .size(width = 52.dp, height = 52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xF0FBF6EC))
            .border(1.dp, Sand, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(emoji, fontSize = 20.sp)
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontSize = 8.sp, fontWeight = FontWeight.Bold), color = Walnut, maxLines = 1)
    }
}

// ════════════════════════ 꾸미기 트레이 ════════════════════════

@Composable
private fun DecorTray(
    state: OzHouseState,
    activeTab: String,
    onTab: (String) -> Unit,
    mobyBmp: ImageBitmap?,
    themed: Boolean,
    catIdx: Int,
    onSelectCat: (Int) -> Unit,
    onSelectTheme: (OzThemeOpt) -> Unit,
    onSelectSofa: (String) -> Unit,
    onSelectRug: (String) -> Unit,
    onSelectTower: (String) -> Unit,
    expanded: Boolean,
    onToggleExpand: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .shadow(12.dp, shape)
            .clip(shape)
            .background(Paper),
    ) {
        // 핸들 — 탭하면 접기/펴기 (PWA tray-handle). 접으면 가린 가구를 드래그할 수 있다.
        Column(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onToggleExpand).padding(vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.width(40.dp).height(4.dp).clip(CircleShape).background(Sand))
            Spacer(Modifier.height(5.dp))
            Text(
                text = if (expanded) "꾸미기  ▾" else "꾸미기  ▴",
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                color = Walnut,
            )
        }
        if (expanded) {
            Column(modifier = Modifier.fillMaxWidth().padding(start = 13.dp, end = 13.dp, bottom = 16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("theme" to "테마", "cat" to "고양이", "sofa" to "소파", "rug" to "러그", "tower" to "캣타워").forEach { (id, label) ->
                        TrayTab(label, activeTab == id) { onTab(id) }
                    }
                    Spacer(Modifier.weight(1f))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(RCtaC.copy(alpha = 0.1f)).padding(horizontal = 10.dp, vertical = 4.dp),
                    ) {
                        Box(Modifier.size(11.dp).clip(CircleShape).background(RCtaC))
                        Spacer(Modifier.width(5.dp))
                        Text("실타래", style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold), color = RCtaC)
                    }
                }
                Spacer(Modifier.height(11.dp))
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    when (activeTab) {
                        "theme" -> OZ_THEMES.forEach { opt ->
                            val owned = opt.id == "default" || opt.id in state.purchasedThemes
                            val lockedVisual = opt.locked && !owned
                            TrayOption(label = opt.name, active = state.theme == opt.id, onClick = { onSelectTheme(opt) }) {
                                ThemeSwatch(opt, lockedVisual, mobyBmp)
                            }
                        }
                        "cat" -> CAT_CASES.forEachIndexed { i, case ->
                            // 자세를 탭하면 방에 그 고양이가 표시되고, 방에서 드래그해 위치를 지정 → 포즈별 저장.
                            TrayOption(label = "오즈 ${i + 1}", active = catIdx == i, onClick = { onSelectCat(i) }) {
                                CatSwatch(case)
                            }
                        }
                        "sofa" -> {
                            TrayOption("적용 안함", state.sofa == "none", { onSelectSofa("none") }) { NoneSwatch() }
                            OZ_SOFAS.forEach { opt -> TrayOption(opt.name, state.sofa == opt.id, { onSelectSofa(opt.id) }) { SofaSwatch(opt) } }
                        }
                        "rug" -> {
                            TrayOption("적용 안함", state.rug == "none", { onSelectRug("none") }) { NoneSwatch() }
                            OZ_RUGS.forEach { (id, label, kind) -> TrayOption(label, state.rug == id, { onSelectRug(id) }) { RugSwatch(kind) } }
                        }
                        "tower" -> {
                            TrayOption("적용 안함", state.tower == "none", { onSelectTower("none") }) { NoneSwatch() }
                            OZ_TOWERS.forEach { (id, label) -> TrayOption(label, state.tower == id, { onSelectTower(id) }) { TowerSwatch() } }
                        }
                    }
                }
                if (themed && activeTab != "theme") {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "테마 적용 중엔 가구를 바꿀 수 없어요. 기본 테마로 돌아가면 가능해요.",
                        style = MaterialTheme.typography.labelSmall,
                        color = Walnut,
                    )
                }
            }
        }
    }
}

@Composable
private fun TrayTab(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (active) Espresso else Color.Transparent)
            .border(1.dp, if (active) Espresso else Sand, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 5.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp),
            color = if (active) Paper else Walnut,
        )
    }
}

@Composable
private fun TrayOption(label: String, active: Boolean, onClick: () -> Unit, swatch: @Composable BoxScope.() -> Unit) {
    Column(
        modifier = Modifier.width(64.dp).clickable(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(width = 64.dp, height = 46.dp)
                .clip(RoundedCornerShape(10.dp))
                .border(2.dp, if (active) RCtaC else Color.Transparent, RoundedCornerShape(10.dp))
                .background(Color(0xFFF3EAD8)),
            contentAlignment = Alignment.Center,
            content = swatch,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.5.sp),
            color = if (active) RCtaC else Walnut,
            maxLines = 1,
        )
    }
}

@Composable
private fun BoxScope.ThemeSwatch(opt: OzThemeOpt, lockedVisual: Boolean, mobyBmp: ImageBitmap?) {
    when {
        opt.id == "default" -> Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFFFBF6EC), Color(0xFFEFE6D2)))))
        !lockedVisual && opt.image != null && mobyBmp != null ->
            Image(bitmap = mobyBmp, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        lockedVisual -> {
            Box(Modifier.fillMaxSize().background(Color(0x2E3C2612)), contentAlignment = Alignment.Center) {
                Text("🔒", fontSize = 16.sp)
            }
            Row(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp)
                    .clip(RoundedCornerShape(8.dp)).background(Color(0xC70E0C0A)).padding(horizontal = 5.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(RCtaC))
                Spacer(Modifier.width(3.dp))
                Text("${opt.price}", color = Paper, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        }
        else -> Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFFEFE6D2), Color(0xFFDDD2B8)))))
    }
}

@Composable
private fun BoxScope.SofaSwatch(opt: OzSofaOpt) {
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(opt.frame, opt.frameD)))) {
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).fillMaxWidth(0.8f).height(15.dp).clip(RoundedCornerShape(4.dp)).background(opt.cushion))
        Box(Modifier.align(Alignment.BottomStart).padding(start = 11.dp, bottom = 12.dp).size(9.dp).clip(RoundedCornerShape(2.dp)).background(opt.pA))
        Box(Modifier.align(Alignment.BottomEnd).padding(end = 11.dp, bottom = 12.dp).size(9.dp).clip(RoundedCornerShape(2.dp)).background(opt.pB))
    }
}

@Composable
private fun BoxScope.RugSwatch(kind: RugKind) {
    val c = when (kind) {
        RugKind.CORAL -> RCtaC
        RugKind.SAND -> Color(0xFFD8C9A6)
        RugKind.SAGE -> Color(0xFF8FA968)
        RugKind.MONO -> Color(0xFF2C2620)
    }
    Box(Modifier.fillMaxSize().padding(7.dp).clip(CircleShape).background(c))
}

@Composable
private fun BoxScope.TowerSwatch() {
    Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp).width(9.dp).height(24.dp).background(Brush.verticalGradient(listOf(Color(0xFFDAC79E), Color(0xFFC9B184)))))
    Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 28.dp).width(26.dp).height(7.dp).clip(RoundedCornerShape(3.dp)).background(Color(0xFF8A6A45)))
    Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 33.dp).width(13.dp).height(6.dp).clip(RoundedCornerShape(3.dp)).background(RCtaC))
}

@Composable
private fun BoxScope.NoneSwatch() {
    Text("⊘", fontSize = 20.sp, color = Walnut)
}

@Composable
private fun BoxScope.CatSwatch(case: CatCase) {
    // 트레이 자세 미리보기 — 바닥에 선 고양이를 박스에 맞춰(Fit) 보여주고 flip 반영.
    val bmp = rememberAssetImage("cat/${case.file}")
    if (bmp != null) {
        Image(
            bitmap = bmp,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxSize()
                .padding(4.dp)
                .graphicsLayer { scaleX = if (case.flip) -1f else 1f },
        )
    } else {
        Text("🐱", fontSize = 18.sp)
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
