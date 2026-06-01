package com.lifestyle.dailyscript.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.outlined.Campaign
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.nav.Routes
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun BottomNavBar(
    currentRoute: String?,
    noticeBadge: Int = 0,
    onSelect: (String) -> Unit,
) {
    Column {
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
                .height(64.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceAround,
        ) {
            NavItem(
                route = Routes.HOME,
                label = stringResource(R.string.nav_home),
                icon = Icons.Outlined.Home,
                active = currentRoute == Routes.HOME,
                onClick = onSelect,
                modifier = Modifier.weight(1f),
            )
            NavItem(
                route = Routes.ARCHIVE,
                label = stringResource(R.string.nav_archive),
                icon = Icons.Outlined.History,
                active = currentRoute == Routes.ARCHIVE,
                onClick = onSelect,
                modifier = Modifier.weight(1f),
            )
            NavItem(
                route = Routes.FEED,
                label = stringResource(R.string.nav_feed),
                icon = Icons.AutoMirrored.Outlined.MenuBook,
                active = currentRoute == Routes.FEED,
                onClick = onSelect,
                modifier = Modifier.weight(1f),
            )
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
                route = Routes.SETTINGS,
                label = stringResource(R.string.nav_settings),
                icon = Icons.Outlined.Settings,
                active = currentRoute == Routes.SETTINGS,
                onClick = onSelect,
                modifier = Modifier.weight(1f),
            )
        }
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
