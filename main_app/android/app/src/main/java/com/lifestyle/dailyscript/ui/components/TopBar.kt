package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bookmark
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

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

@Composable
fun HomeTopBar(onMyPageClick: () -> Unit) {
    TopBarContainer {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.MenuBook,
                contentDescription = null,
                tint = Espresso,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = stringResource(R.string.app_brand),
                style = MaterialTheme.typography.headlineMedium,
                color = Espresso,
                modifier = Modifier.padding(start = 10.dp),
            )
        }
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

@Composable
fun DetailTopBar(
    title: String,
    bookmarked: Boolean,
    bookmarkEnabled: Boolean = true,
    hasEnglish: Boolean = false,
    english: Boolean = false,
    onToggleLang: () -> Unit = {},
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
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (hasEnglish) {
                LangPill(english = english, onToggle = onToggleLang, koLabel = "ENG")
                Box(modifier = Modifier.width(8.dp))
            }
            Icon(
                imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = stringResource(R.string.bookmark),
                tint = if (bookmarked) Cta else Walnut,
                modifier = Modifier
                    .size(40.dp)
                    .clickable(enabled = bookmarkEnabled, onClick = onToggleBookmark)
                    .padding(8.dp),
            )
        }
    }
}

@Composable
fun SettingsTopBar(initials: String) {
    TopBarContainer {
        Text(
            text = stringResource(R.string.app_brand),
            style = MaterialTheme.typography.headlineMedium,
            color = Espresso,
        )
        Box(
            modifier = Modifier
                .size(36.dp)
                .border(0.5.dp, Walnut)
                .background(Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = Espresso,
            )
        }
    }
}
