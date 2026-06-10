package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
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
fun HomeTopBar(yarn: Int, onYarnClick: () -> Unit, onMyPageClick: () -> Unit) {
    TopBarContainer {
        BrandWordmark()
        Row(verticalAlignment = Alignment.CenterVertically) {
            YarnChip(yarn = yarn, onClick = onYarnClick)
            Spacer(Modifier.width(12.dp))
            Text(
                text = stringResource(R.string.my_page),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
                modifier = Modifier
                    .clickable(onClick = onMyPageClick)
                    .padding(horizontal = 6.dp, vertical = 4.dp),
            )
        }
    }
}

/** 로고 우측 실타래 칩 — 아이콘 + 남은 개수. 탭하면 충전 페이지로 이동. */
@Composable
fun YarnChip(yarn: Int, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier = Modifier
            .background(Sand.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        YarnIcon(
            contentDescription = stringResource(R.string.yarn_chip_cd),
            modifier = Modifier.size(15.dp),
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
