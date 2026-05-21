package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.BorderSubtle
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.InkBlack
import com.lifestyle.dailyscript.ui.theme.PaperWhite
import com.lifestyle.dailyscript.ui.theme.SignatureOrange

private val TopBarHeight = 64.dp

@Composable
private fun TopBarContainer(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PaperWhite)
            .border(width = 1.dp, color = BorderSubtle)
            .height(TopBarHeight)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        content()
    }
}

@Composable
fun HomeTopBar(onMyPageClick: () -> Unit) {
    TopBarContainer {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Outlined.MenuBook,
                contentDescription = null,
                tint = InkBlack,
                modifier = Modifier.size(22.dp),
            )
            Text(
                text = stringResource(R.string.app_brand),
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Medium,
                ),
                color = InkBlack,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        Text(
            text = stringResource(R.string.my_page),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
            color = InkBlack,
            modifier = Modifier
                .clickable(onClick = onMyPageClick)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

@Composable
fun DetailTopBar(
    title: String,
    bookmarked: Boolean,
    onBack: () -> Unit,
    onToggleBookmark: () -> Unit,
) {
    TopBarContainer {
        Icon(
            imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = stringResource(R.string.back),
            tint = InkBlack,
            modifier = Modifier
                .size(40.dp)
                .clickable(onClick = onBack)
                .padding(8.dp),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.app_brand).uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = title,
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontFamily = EditorialSerif,
                    fontWeight = FontWeight.Medium,
                ),
                color = InkBlack,
            )
        }
        Icon(
            imageVector = if (bookmarked) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder,
            contentDescription = stringResource(R.string.bookmark),
            tint = if (bookmarked) SignatureOrange else InkBlack,
            modifier = Modifier
                .size(40.dp)
                .clickable(onClick = onToggleBookmark)
                .padding(8.dp),
        )
    }
}

@Composable
fun SettingsTopBar(initials: String) {
    TopBarContainer {
        Text(
            text = stringResource(R.string.app_brand),
            style = MaterialTheme.typography.headlineMedium.copy(
                fontFamily = EditorialSerif,
                fontWeight = FontWeight.Medium,
            ),
            color = InkBlack,
        )
        Box(
            modifier = Modifier
                .size(36.dp)
                .border(1.dp, InkBlack)
                .background(Color.Transparent),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials.uppercase(),
                style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.1.em),
                color = InkBlack,
            )
        }
    }
}
