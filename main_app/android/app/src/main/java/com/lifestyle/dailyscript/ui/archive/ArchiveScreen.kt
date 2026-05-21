package com.lifestyle.dailyscript.ui.archive

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun ArchiveScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(R.string.archive_coming_soon),
            style = MaterialTheme.typography.bodyLarge,
            color = Walnut,
        )
    }
}
