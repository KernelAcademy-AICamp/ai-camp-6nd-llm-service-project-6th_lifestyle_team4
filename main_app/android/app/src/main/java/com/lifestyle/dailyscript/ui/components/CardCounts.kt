package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Comment
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.util.formatCount

/** Inline "views · collects" counts (mirrors the PWA's renderCounts, m-app.js:1427). */
@Composable
fun CardCounts(
    viewCount: Int?,
    commentCount: Int? = null,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = Icons.Outlined.Visibility,
            contentDescription = null,
            tint = Walnut,
            modifier = Modifier.size(14.dp),
        )
        Text(text = formatCount(viewCount), style = MaterialTheme.typography.labelSmall, color = Walnut)
        if (commentCount != null) {
            Text(text = "·", style = MaterialTheme.typography.labelSmall, color = Walnut)
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.Comment,
                contentDescription = null,
                tint = Walnut,
                modifier = Modifier.size(14.dp),
            )
            Text(text = formatCount(commentCount), style = MaterialTheme.typography.labelSmall, color = Walnut)
        }
    }
}
