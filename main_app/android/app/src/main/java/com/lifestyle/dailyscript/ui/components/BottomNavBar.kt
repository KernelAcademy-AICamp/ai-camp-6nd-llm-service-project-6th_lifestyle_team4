package com.lifestyle.dailyscript.ui.components

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
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.DynamicFeed
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.nav.Routes
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

// 고양이 장식 (조정 가능)
// cat_empty.png 은 가로 '면(ledge)' 위에 누운 고양이 — 면 위로 몸통, 면 아래로 앞다리가 늘어짐.
// 그 ledge 선을 카드 상단에 맞춰야 고양이가 바에 '앉은' 것처럼 보인다(이미지 밑단 X).
private val CatHeight = 52.dp              // 스케일된 고양이 이미지 전체 높이 (48~60 조정)
private val CatWidth = CatHeight * 2.3f    // 원본 1143x497 ≈ 2.3:1
private val CatLedgeFraction = 0.46f       // PNG에서 ledge 선의 위→아래 비율 (대략 중앙)
private val CatProtrusion = CatHeight * CatLedgeFraction // 바 위로 솟는 몸통 높이(ledge 위쪽)
private val CatRightInset = 8.dp           // 카드 오른쪽 끝에서 안쪽으로
private val CatSeat = 0.dp                 // 양수면 고양이를 바 쪽으로 더 내려 앉힘(미세조정)

private val CenterLabelNudge = 0.dp        // 가운데 라벨 세로 미세보정(필요 시 음수로 위로)

// 카드 위로 확보할 공간 = max(원 돌출, 고양이 몸통이 솟는 양)
private val TopSpace = maxOf(HomeProtrusion, CatProtrusion)

@Composable
fun BottomNavBar(
    currentRoute: String?,
    noticeBadge: Int = 0,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
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
                .shadow(BarElevation, RoundedCornerShape(BarCornerRadius))
                .clip(RoundedCornerShape(BarCornerRadius))
                .background(Paper),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            NavItem(
                route = Routes.NOTICE,
                label = stringResource(R.string.nav_notice),
                icon = Icons.Outlined.Campaign,
                active = currentRoute == Routes.NOTICE,
                onClick = onSelect,
                badge = noticeBadge,
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
        // (C) 장식용 고양이 — 카드 우측 상단 모서리에 걸쳐 위로 솟음.
        //     clickable 없음 → 터치는 아래 FEED/LIBRARY/MY 탭으로 통과한다.
        val catBitmap = rememberAssetBitmap("cat/cat_empty.png")
        if (catBitmap != null) {
            Image(
                bitmap = catBitmap,
                contentDescription = null, // 장식 → null
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    // 카드가 우측으로 BarSideMargin 들어왔으므로 x 보정.
                    // ledge 선(= cat_top + CatProtrusion)이 카드 상단(y = TopSpace)에 오도록 배치
                    // → 몸통은 바 위로 솟고, 늘어진 앞다리는 바 윗면으로 드리워진다.
                    .offset(
                        x = -(BarSideMargin + CatRightInset),
                        y = TopSpace - CatProtrusion + CatSeat,
                    )
                    .height(CatHeight)
                    .width(CatWidth),
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
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clickable { onClick() }
            .padding(horizontal = 6.dp),
    ) {
        Box(
            modifier = Modifier
                .size(HomeCircleSize)
                .shadow(4.dp, CircleShape)
                .background(circleColor, CircleShape)
                .clip(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (yarnBitmap != null) {
                Image(
                    bitmap = yarnBitmap,
                    contentDescription = stringResource(R.string.nav_home_label),
                    contentScale = ContentScale.Fit, // 비율 보존 — 가로 직사각형 PNG 가 원 안에 잘리지 않게
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
            text = stringResource(R.string.nav_home_label), // "오늘의 명대사" — 대문자화 안 함
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
