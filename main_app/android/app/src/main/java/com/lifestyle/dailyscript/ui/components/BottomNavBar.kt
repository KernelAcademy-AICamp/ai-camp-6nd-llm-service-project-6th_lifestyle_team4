package com.lifestyle.dailyscript.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DynamicFeed
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.ui.nav.Routes
import kotlinx.coroutines.launch
import com.lifestyle.dailyscript.ui.onboarding.LocalCoachController
import com.lifestyle.dailyscript.ui.onboarding.coachAnchor
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

// 하단 바 치수 (조정 가능)
private val BarHeight = 64.dp
private val HomeCircleSize = 54.dp
private val HomeProtrusion = 16.dp        // 카드 상단 위로 솟는 원의 양

// 플로팅 카드 (조정 가능) — 바가 본문 위에 둥근 카드로 떠 있음 (본문에 overlay).
private val BarSideMargin = 14.dp          // 좌/우 바깥 여백
private val BarBottomMargin = 12.dp        // 아래 띄움 (부모가 이미 navigationBarsPadding 적용 → 중복 금지)
private val BarCornerRadius = 28.dp        // 카드 모서리 반경
private val BarElevation = 8.dp            // 그림자

// 본문이 떠 있는 카드에 가려지지 않도록 아래에 줄 여백 = 보이는 카드 높이(카드 + 아래 띄움).
// 카드 위로 솟는 고양이/홈버튼 영역(TopSpace)은 일부러 제외 → 그 부분은 본문 위에 겹쳐 떠 있다.
val BottomBarContentInset = BarHeight + BarBottomMargin

// 고양이 장식 (조정 가능) — 탭별로 자세(이미지)·위치·크기가 바뀐다 (PWA updateBottomNavCatForView 미러).
// '누운' 고양이(cat_empty)는 가로 면(ledge) 위에 몸통을 얹고 앞다리를 늘어뜨린 모양이라 ledge 비율이 낮고,
// '서 있는' 고양이(cat_today/cat_pen/cat_struck)는 발이 이미지 하단 → 발끝이 바 윗면에 닿도록 ledge 비율을 높게 둔다.
// (PWA 의 left% 위치는 CSS 전용 → 여기선 BiasAlignment hBias 로 근사, 실기기에서 미세조정 가능.)
private val CatHeightLying = 52.dp             // 누운 자세(cat_empty) 높이
private val CatHeightStanding = 60.dp          // 서 있는 자세 높이 (홈)
private val CatHeightFeed = 92.dp              // 피드(cat_pen) — 책 읽는 고양이, 크게 강조 (조정 가능)
private val CatHeightLibrary = 90.dp           // LIBRARY(cat_struck) — 책더미 위 고양이, 크게 강조 (조정 가능)
private val CatHeightDetail = 92.dp            // 카드 상세(cat_library) — 책장 앞 책 읽는 고양이 (PWA large ≈ 96px)
private val CatLedgeFractionLying = 0.46f      // PNG에서 ledge 선의 위→아래 비율 (대략 중앙)
private val CatLedgeFractionStanding = 0.72f   // 서 있는 자세: 발끝(하단부)이 바 윗면에 닿도록
private val CatLedgeFractionFeed = 0.86f       // 피드: 책(이미지 하단)이 바 윗면에 닿게 → 몸통이 위로 크게 솟음
private val CatLedgeFractionLibrary = 0.86f    // LIBRARY: 책더미(이미지 하단)가 바 윗면에 닿게
private val CatLedgeFractionDetail = 0.86f     // 카드 상세: 책장(이미지 하단)이 바 윗면에 닿게
private val CatProtrusionLying = CatHeightLying * CatLedgeFractionLying
private val CatProtrusionStanding = CatHeightStanding * CatLedgeFractionStanding
private val CatProtrusionFeed = CatHeightFeed * CatLedgeFractionFeed
private val CatProtrusionLibrary = CatHeightLibrary * CatLedgeFractionLibrary
private val CatProtrusionDetail = CatHeightDetail * CatLedgeFractionDetail
private val MaxCatProtrusion = maxOf(
    maxOf(CatProtrusionLying, CatProtrusionStanding),
    maxOf(CatProtrusionFeed, maxOf(CatProtrusionLibrary, CatProtrusionDetail)),
)
private val CatRightInset = 8.dp               // 코너 자세에서 카드 오른쪽 끝에서 안쪽으로
private val CatSeat = 0.dp                      // 양수면 고양이를 바 쪽으로 더 내려 앉힘(미세조정)

// 피드 cat_pen 가로 위치 — hBias -1(박스 좌측=화면 좌측)에서 xShift(음수)로 더 좌측(DAILY 탭 위)까지 밀어낸다.
// (PWA 와 달리 안드로이드 피드는 글쓰기 FAB 를 우하단에 두므로, 고양이는 좌측으로 비켜 앉혀 겹치지 않게 한다.)
// cat_pen 은 좌우 투명 여백이 있어 xShift 만큼 밀면 투명 여백만 화면 밖으로 잘리고 보이는 고양이가 좌측으로 간다.
private val CatHBiasFeed = -1f
private val CatXShiftFeed = (-20).dp           // 음수 = 더 왼쪽(DAILY 탭 쪽). 보이는 고양이가 잘리면 ↑ (조정 가능)

// LIBRARY cat_struck 가로 위치 — 우측에 북마크 FAB 를 두므로(PWA ea626e1) 고양이는 좌측에 둔다.
// 단 -1(화면 끝)은 코너에 박혀 어색 → DAILY 탭(맨 좌측 탭) 위에 앉도록 살짝 안쪽(-0.85)으로.
// 세로로 긴 이미지라 투명 여백이 거의 없어 hBias 만으로 위치가 잡힌다.
// 더 DAILY 중앙으로 = ↓(-0.9~), FEED 쪽으로 밀려면 ↑(-0.7~) (기기에서 미세조정)
private val CatHBiasLibrary = -0.85f

// 카드 상세 cat_library 가로 위치 — PWA right-far(left:90%) 미러. LIBRARY(0.80) 보다 더 우측 끝에 붙인다.
private val CatHBiasDetail = 0.92f

private val CenterLabelNudge = 0.dp            // 가운데 라벨 세로 미세보정(필요 시 음수로 위로)

// 카드 위로 확보할 공간 = max(원 돌출, 가장 크게 솟는 고양이 몸통)
private val TopSpace = maxOf(HomeProtrusion, MaxCatProtrusion)

/** 탭별 고양이 자세 — 이미지 · 가로 위치(bias) · 높이 · ledge 비율 · 코너 여부. */
private data class NavCatPose(
    val asset: String,
    val hBias: Float,          // -1=좌, 0=중앙, 1=우 (BiasAlignment 가로 bias)
    val height: Dp,
    val ledgeFraction: Float,
    val corner: Boolean = false,   // true 면 카드 우측 안쪽으로 끌어당김 (cat_empty 코너 자세)
    val xShift: Dp = 0.dp,         // hBias 배치 후 추가 가로 이동 (양수=오른쪽, 화면 밖 클립 허용)
)

@Composable
fun BottomNavBar(
    currentRoute: String?,
    noticeBadge: Int = 0,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    // 떠 있는 바 본체(둥근 카드)의 top 을 window px 로 보고 — 카드 상세의 '본문 끝이 하단 탭 통과' 보상 판정에 쓴다.
    onBarTopPositioned: (Float) -> Unit = {},
) {
    val coach = LocalCoachController.current
    // 카드 위 솟음 공간(TopSpace) + 카드 높이 + 아래 띄움(BarBottomMargin)을 모두 Box 높이에 포함.
    // → 솟은 원/고양이가 경계 안에 있어 클릭(히트테스트)·레이아웃 정상.
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(TopSpace + BarHeight + BarBottomMargin),
    ) {
        // (A) 바 본체 — 플로팅 둥근 카드. 좌/우/아래 여백을 두고 본문 위에 떠 있음.
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(start = BarSideMargin, end = BarSideMargin, bottom = BarBottomMargin)
                .fillMaxWidth()
                .height(BarHeight)
                .onGloballyPositioned { onBarTopPositioned(it.positionInWindow().y) }
                .shadow(BarElevation, RoundedCornerShape(BarCornerRadius))
                .clip(RoundedCornerShape(BarCornerRadius))
                .background(Paper),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            NavItem(
                route = Routes.DAILY,
                label = stringResource(R.string.nav_daily),
                icon = Icons.Outlined.Explore,
                active = currentRoute == Routes.DAILY,
                onClick = onSelect,
                modifier = Modifier.weight(1f),
            )
            NavItem(
                route = Routes.FEED,
                label = stringResource(R.string.nav_feed),
                icon = Icons.Outlined.DynamicFeed,
                active = currentRoute == Routes.FEED,
                onClick = onSelect,
                modifier = Modifier.weight(1f).coachAnchor(coach, "nav_feed"),
            )
            // 가운데 칸은 비워 둠 — 돌출 원형 홈 버튼이 이 자리를 차지한다.
            Spacer(modifier = Modifier.weight(1f))
            NavItem(
                route = Routes.ARCHIVE,
                label = stringResource(R.string.nav_archive),
                icon = LibraryShelfIcon,
                active = currentRoute == Routes.ARCHIVE,
                onClick = onSelect,
                modifier = Modifier.weight(1f).coachAnchor(coach, "nav_archive"),
            )
            NavItem(
                route = Routes.SETTINGS,
                label = stringResource(R.string.nav_settings),
                icon = Icons.Outlined.Person,
                active = currentRoute == Routes.SETTINGS,
                onClick = onSelect,
                badge = noticeBadge, // PWA: unread-notice dot sits on the MY tab (not DAILY)
                modifier = Modifier.weight(1f),
            )
        }
        // (B) 돌출 원형 홈 버튼 — 카드 상단 중앙. 카드 상단(y = TopSpace) 위로
        //     정확히 HomeProtrusion 만큼만 솟도록 offset.
        HomeCenterButton(
            active = currentRoute == Routes.HOME,
            onClick = { onSelect(Routes.HOME) },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(y = TopSpace - HomeProtrusion)
                .coachAnchor(coach, "nav_home"),
        )
        // (C) 장식용 고양이 — 탭별로 자세(이미지)·위치·크기가 바뀐다 (PWA updateBottomNavCatForView 미러).
        //     clickable 없음 → 터치는 아래 FEED/LIBRARY/MY 탭으로 통과한다.
        //     피드=cat_pen / LIBRARY=cat_struck / 카드 상세=cat_library / daily·MY=cat_empty(코너) / 홈·그 외=cat_today.
        val catPose = when (currentRoute) {
            Routes.FEED -> NavCatPose("cat/cat_pen.png", hBias = CatHBiasFeed, height = CatHeightFeed, ledgeFraction = CatLedgeFractionFeed, xShift = CatXShiftFeed)
            Routes.ARCHIVE -> NavCatPose("cat/cat_struck.png", hBias = CatHBiasLibrary, height = CatHeightLibrary, ledgeFraction = CatLedgeFractionLibrary)
            // 카드 상세 — PWA openDetail: cat_library, right-far, large (책장 앞 책 읽는 고양이).
            Routes.DETAIL -> NavCatPose("cat/cat_library.png", hBias = CatHBiasDetail, height = CatHeightDetail, ledgeFraction = CatLedgeFractionDetail)
            Routes.DAILY, Routes.SETTINGS -> NavCatPose("cat/cat_empty.png", hBias = 1f, height = CatHeightLying, ledgeFraction = CatLedgeFractionLying, corner = true)
            else -> NavCatPose("cat/cat_today.png", hBias = 0.3f, height = CatHeightStanding, ledgeFraction = CatLedgeFractionStanding)
        }
        val catBitmap = rememberAssetBitmap(catPose.asset)
        if (catBitmap != null) {
            // PWA 는 height 고정 + width:auto(원본 비율) → 비트맵 실제 비율로 폭 계산 (자세마다 비율 다름).
            val ratio = catBitmap.width.toFloat() / catBitmap.height.toFloat()
            // ledge 선(= cat_top + protrusion)이 카드 상단(y = TopSpace)에 오도록 배치.
            val protrusion = catPose.height * catPose.ledgeFraction
            Image(
                bitmap = catBitmap,
                contentDescription = null, // 장식 → null
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .align(BiasAlignment(horizontalBias = catPose.hBias, verticalBias = -1f))
                    .offset(
                        // 코너 자세는 카드가 우측으로 BarSideMargin 들어온 만큼 안쪽으로 보정,
                        // 그 외는 pose 의 xShift 적용 (피드 cat_pen 을 MY 탭 위까지 우측으로 밀 때).
                        x = if (catPose.corner) -(BarSideMargin + CatRightInset) else catPose.xShift,
                        y = TopSpace - protrusion + CatSeat,
                    )
                    .height(catPose.height)
                    .width(catPose.height * ratio),
            )
        }
    }
}

@Composable
private fun HomeCenterButton(
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val circleColor = Latte
    // 실타래 이미지: assets/"daily script bar.png" (공백 포함) 우선, 없으면 ic_yarn 벡터로 폴백.
    val yarnBitmap = rememberAssetBitmap(YarnAssetName)

    // 실뭉치 힌트/스핀 (PWA updateYarnHint/spinYarn) — TODAY 재탭 = 새 명대사 제스처 신호.
    // today_yarn_hinted 면 흔들림 정지. 탭하면 한 바퀴 회전 + 학습 완료로 기록.
    val hinted by AppPreferences.todayYarnHinted.collectAsState(initial = true)
    val scope = rememberCoroutineScope()
    val spin = remember { Animatable(0f) }
    var spinning by remember { mutableStateOf(false) }
    val hinting = active && !hinted && !spinning
    val infinite = rememberInfiniteTransition(label = "yarnHint")
    val wobble by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = keyframes {
                durationMillis = 3000
                0f at 0
                0f at 2400
                -11f at 2490
                9f at 2610
                -6f at 2730
                3f at 2850
                0f at 3000
            },
        ),
        label = "yarnWobbleDeg",
    )
    val rotation = spin.value + if (hinting) wobble else 0f

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clickable {
                onClick()
                if (!hinted) scope.launch { AppPreferences.setTodayYarnHinted() }
                scope.launch {
                    spinning = true
                    spin.snapTo(0f)
                    spin.animateTo(360f, animationSpec = tween(600, easing = CubicBezierEasing(0.34f, 1.4f, 0.5f, 1f)))
                    spin.snapTo(0f)
                    spinning = false
                }
            }
            .padding(horizontal = 6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(HomeCircleSize)
                .graphicsLayer {
                    rotationZ = rotation
                    transformOrigin = TransformOrigin(0.5f, 0.48f)
                }
                .shadow(4.dp, CircleShape)
                .background(circleColor, CircleShape)
                .clip(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (yarnBitmap != null) {
                Image(
                    bitmap = yarnBitmap,
                    contentDescription = stringResource(R.string.nav_home_label),
                    contentScale = ContentScale.Crop, // 투명 여백을 잘라 실타래가 원 안을 꽉 채우게
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // 폴백: 기존 실타래 벡터 (assets 에 daily script bar.png 넣기 전까지)
                Image(
                    painter = painterResource(R.drawable.ic_yarn),
                    contentDescription = stringResource(R.string.nav_home_label),
                    modifier = Modifier.size(26.dp),
                )
            }
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = stringResource(R.string.nav_home_label), // "TODAY" (PWA d4bd87d)
            color = if (active) Cta else Espresso, // 선택=오렌지, 미선택=검정
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            modifier = Modifier.offset(y = CenterLabelNudge), // 옆 탭 라벨과 baseline 미세보정
        )
    }
}

@Composable
private fun NavItem(
    route: String,
    label: String,
    icon: ImageVector,
    active: Boolean,
    onClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    badge: Int = 0,
) {
    val tint = if (active) Espresso else Walnut
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = modifier
            .clickable { onClick(route) }
            .padding(vertical = 6.dp),
    ) {
        Box {
            Icon(imageVector = icon, contentDescription = label, tint = tint, modifier = Modifier.size(20.dp))
            if (badge > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(7.dp)
                        .background(Cta, CircleShape),
                )
            }
        }
        Box(modifier = Modifier.height(4.dp))
        Text(
            text = label.uppercase(),
            color = tint,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
        // active indicator: small coral dot
        Box(modifier = Modifier.height(4.dp))
        Box(
            modifier = Modifier
                .size(4.dp)
                .background(if (active) Cta else Color.Transparent, CircleShape)
        )
    }
}
