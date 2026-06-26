package com.lifestyle.dailyscript.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.theme.WordmarkSerif
import com.lifestyle.dailyscript.ui.util.formatCount

private val TopBarHeight = 64.dp

@Composable
private fun TopBarContainer(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper)
            .height(TopBarHeight)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        content()
    }
    // 0.5dp hairline divider under the bar
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(Latte)
    )
}

/** 헤더 워드마크 — "Daily Script ." (Bodoni Moda, D·S 살짝 크게, 마침표 포인트색). */
@Composable
fun BrandWordmark() {
    val brand = buildAnnotatedString {
        withStyle(SpanStyle(fontSize = 1.08.em)) { append("D") }
        append("aily ")
        withStyle(SpanStyle(fontSize = 1.08.em)) { append("S") }
        append("cript ")
        withStyle(SpanStyle(color = Cta)) { append(".") }
    }
    Text(
        text = brand,
        style = MaterialTheme.typography.headlineMedium.copy(
            fontFamily = WordmarkSerif,
            letterSpacing = 0.02.em,
        ),
        color = Espresso,
    )
}

@Composable
fun HomeTopBar(
    // top-bar 우측 실타래 칩 → 북마크 버튼으로 교체 (PWA f4e9d86). 실타래 칩은 MY 페이지 닉네임 아래로.
    onBookmarkClick: () -> Unit = {},
    notifUnread: Int = 0,
    onNotifClick: () -> Unit = {},
) {
    TopBarContainer {
        BrandWordmark()
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TopBookmarkButton(onClick = onBookmarkClick)
            NotifButton(unread = notifUnread, onClick = onNotifClick)
        }
    }
}

/** 헤더 우측 북마크 버튼 — 내 북마크 책꽂이로 이동 (PWA top-bookmark-btn). */
@Composable
fun TopBookmarkButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.BookmarkBorder,
            contentDescription = "북마크",
            tint = Espresso,
            modifier = Modifier.size(22.dp),
        )
    }
}

/**
 * 헤더 우측 알림(확성기) 버튼 — 미읽음 [unread] > 0 이면 우상단 빨간 배지(99+ 캡). (PWA #notif-btn / #notif-badge)
 */
@Composable
fun NotifButton(unread: Int, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(34.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Campaign,
            contentDescription = "알림",
            tint = Espresso,
            modifier = Modifier.size(22.dp),
        )
        if (unread > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 2.dp, y = (-1).dp)
                    .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .clip(CircleShape)
                    .background(Cta)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (unread > 99) "99+" else unread.toString(),
                    color = Paper,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                )
            }
        }
    }
}

/**
 * 로고 우측 실타래 칩 — 아이콘 + 남은 개수. 탭하면 실타래 설명 팝업([YarnInfoDialog])이 뜬다(충전 진입 아님).
 * [bounceKey] 가 바뀌면 칩 박스는 그대로 두고 안의 실타래 이미지만 공 튀기듯 bounce(출석 보상 애니).
 * [onPositioned] 로 칩 중심 좌표(window px)를 알려 보상 버스트가 날아올 목표로 쓴다.
 */
@Composable
fun YarnChip(
    yarn: Int,
    onClick: () -> Unit,
    bounceKey: Int = 0,
    onPositioned: (Offset) -> Unit = {},
    // MY 페이지용 — 칩 안에 '실타래' 라벨을 함께 표시(PWA MY yarn-chip). top-bar 에선 null.
    label: String? = null,
) {
    val shape = RoundedCornerShape(50)
    val iconScale = remember { Animatable(1f) }
    LaunchedEffect(bounceKey) {
        if (bounceKey > 0) {
            iconScale.snapTo(1f)
            iconScale.animateTo(1.55f, tween(110))
            iconScale.animateTo(0.82f, tween(120))
            iconScale.animateTo(1.18f, tween(110))
            iconScale.animateTo(1f, spring(dampingRatio = 0.45f, stiffness = 520f))
        }
    }
    Row(
        modifier = Modifier
            .onGloballyPositioned { onPositioned(it.boundsInWindow().center) }
            .clip(shape)
            .background(Sand.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        YarnIcon(
            contentDescription = stringResource(R.string.yarn_chip_cd),
            modifier = Modifier
                .size(15.dp)
                .graphicsLayer { scaleX = iconScale.value; scaleY = iconScale.value },
        )
        Spacer(Modifier.width(5.dp))
        Text(
            text = yarn.toString(),
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                platformStyle = PlatformTextStyle(includeFontPadding = false),
            ),
            color = Espresso,
        )
        if (label != null) {
            Spacer(Modifier.width(5.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.Medium,
                    platformStyle = PlatformTextStyle(includeFontPadding = false),
                ),
                color = Walnut,
            )
        }
    }
}

@Composable
fun DetailTopBar(
    title: String,
    subtitle: String? = null,
    bookmarked: Boolean,
    bookmarkCount: Int,
    bookmarkEnabled: Boolean = true,
    onBack: () -> Unit,
    onToggleBookmark: () -> Unit,
) {
    TopBarContainer {
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = stringResource(R.string.back),
            tint = Espresso,
            modifier = Modifier
                .size(40.dp)
                .clickable(onClick = onBack)
                .padding(8.dp),
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
        ) {
            Text(
                text = stringResource(R.string.app_brand).uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                color = Walnut,
            )
            Text(
                text = title,
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontFamily = EditorialSerif,
                ),
                color = Espresso,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = stringResource(R.string.bookmark),
                tint = if (bookmarked) Cta else Walnut,
                modifier = Modifier
                    .size(28.dp)
                    .clickable(enabled = bookmarkEnabled, onClick = onToggleBookmark)
                    .padding(2.dp),
            )
            Text(
                text = formatCount(bookmarkCount),
                style = MaterialTheme.typography.labelSmall.copy(
                    platformStyle = PlatformTextStyle(includeFontPadding = false),
                ),
                color = Walnut,
            )
        }
    }
}

@Composable
fun SettingsTopBar(onFeedback: () -> Unit) {
    TopBarContainer {
        BrandWordmark()
        // 의견 남기기 — filled espresso chip, matching the PWA settings top bar.
        Box(
            modifier = Modifier
                .background(Espresso)
                .clickable(onClick = onFeedback)
                .padding(horizontal = 12.dp, vertical = 7.dp),
        ) {
            Text(
                text = stringResource(R.string.send_feedback),
                style = MaterialTheme.typography.labelSmall,
                color = Paper,
            )
        }
    }
}
