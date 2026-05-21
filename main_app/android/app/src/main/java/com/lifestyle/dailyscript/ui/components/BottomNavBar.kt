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
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.nav.Routes
import com.lifestyle.dailyscript.ui.theme.BorderSubtle
import com.lifestyle.dailyscript.ui.theme.OnSurfaceVariant
import com.lifestyle.dailyscript.ui.theme.PaperWhite
import com.lifestyle.dailyscript.ui.theme.SignatureOrange

@Composable
fun BottomNavBar(
    currentRoute: String?,
    onSelect: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PaperWhite)
            .border(width = 1.dp, color = BorderSubtle)
            .height(72.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        NavItem(
            route = Routes.HOME,
            label = stringResource(R.string.nav_home),
            icon = Icons.Outlined.Home,
            active = currentRoute == Routes.HOME,
            onClick = onSelect,
        )
        NavItem(
            route = Routes.ARCHIVE,
            label = stringResource(R.string.nav_archive),
            icon = Icons.Outlined.History,
            active = currentRoute == Routes.ARCHIVE,
            onClick = onSelect,
        )
        NavItem(
            route = Routes.SETTINGS,
            label = stringResource(R.string.nav_settings),
            icon = Icons.Outlined.Settings,
            active = currentRoute == Routes.SETTINGS,
            onClick = onSelect,
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
) {
    val color = if (active) SignatureOrange else OnSurfaceVariant
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier
            .width(96.dp)
            .clickable { onClick(route) }
            .padding(vertical = 8.dp),
    ) {
        Icon(imageVector = icon, contentDescription = label, tint = color, modifier = Modifier.size(22.dp))
        Box(modifier = Modifier.size(width = 1.dp, height = 4.dp))
        Text(
            text = label.uppercase(),
            color = color,
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.18.em),
        )
    }
}
