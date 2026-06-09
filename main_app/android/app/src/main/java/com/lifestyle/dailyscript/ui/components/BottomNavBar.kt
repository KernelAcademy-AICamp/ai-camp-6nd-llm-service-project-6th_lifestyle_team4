package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.DynamicFeed
import androidx.compose.material.icons.outlined.Home
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
private val HomeProtrusion = 16.dp // 바 상단 위로 솟는 양

@Composable
fun BottomNavBar(
    currentRoute: String?,
    noticeBadge: Int = 0,
    onSelect: (String) -> Unit,
) {
    val coach = LocalCoachController.current
    // 돌출분을 Box 높이에 포함 → 가운데 원이 경계 안에 있어 클릭(히트테스트) 정상 동작.
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(BarHeight + HomeProtrusion),
    ) {
        // (A) 바 본체 — 하단 정렬. Paper 배경은 하단 BarHeight 영역에만 칠해지고
        //     원 좌우의 윗 스트립은 투명 → 화면 배경이 비쳐 자연스럽게 보임.
        Column(modifier = Modifier.align(Alignment.BottomCenter)) {
            // hairline top divider
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(0.5.dp)
                    .background(Latte)
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Paper)
                    .height(BarHeight),
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
        }
        // (B) 돌출 원형 홈 버튼 — 상단 중앙
        HomeCenterButton(
            active = currentRoute == Routes.HOME,
            onClick = { onSelect(Routes.HOME) },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .coachAnchor(coach, "nav_home"),
        )
    }
}

@Composable
private fun HomeCenterButton(
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // placeholder 색상 — 이미지 교체 시 자연스럽게 대체됨.
    val circleColor = Latte
    val iconTint = Espresso
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
                .border(
                    width = if (active) 2.dp else 0.dp,
                    color = if (active) Cta else Color.Transparent,
                    shape = CircleShape,
                )
                .clip(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            // ▼▼ 임시 placeholder: 기존 Home 아이콘 — 이미지 준비되면 이 한 줄만 교체 ▼▼
            Icon(
                imageVector = Icons.Outlined.Home,
                contentDescription = stringResource(R.string.nav_home),
                tint = iconTint,
                modifier = Modifier.size(26.dp),
            )
            // 이미지로 교체 시:
            //   Image(
            //       painter = painterResource(R.drawable.ic_home_center),
            //       contentDescription = stringResource(R.string.nav_home),
            //       modifier = Modifier.fillMaxSize(),   // 원을 꽉 채우면 위 clip(CircleShape)로 둥글게 잘림
            //   )
            // ▲▲------------------------------------------------------------------▲▲
        }
        Spacer(modifier = Modifier.height(2.dp))
        Text(
            text = stringResource(R.string.nav_home).uppercase(),
            color = if (active) Espresso else Walnut,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
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
