package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.BuildConfig
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun SettingsScreen(
    nickname: String?,
    onSignOut: () -> Unit,
) {
    val vm: SettingsViewModel = viewModel()
    val pushEnabled by vm.pushEnabled.collectAsState()

    val displayName = nickname?.takeIf { it.isNotBlank() } ?: stringResource(R.string.anonymous_user)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Box(modifier = Modifier.height(40.dp))
        Text(text = displayName, style = MaterialTheme.typography.displayMedium, color = Espresso)
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.profile_bio),
            style = MaterialTheme.typography.bodyLarge,
            color = Walnut,
        )
        Box(modifier = Modifier.height(32.dp))
        Hairline()

        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.general_preferences))
        SettingRow(
            title = stringResource(R.string.push_notifications),
            subtitle = stringResource(R.string.push_notifications_desc),
            trailing = {
                EditorialToggle(checked = pushEnabled, onChange = vm::setPushEnabled)
            },
        )
        SettingRow(
            title = stringResource(R.string.theme_settings),
            subtitle = stringResource(R.string.theme_settings_desc),
        )

        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.legal_about))
        SettingRow(title = stringResource(R.string.terms_of_service))
        SettingRow(
            title = stringResource(R.string.version_info),
            trailingText = "v${BuildConfig.VERSION_NAME}",
        )

        Box(modifier = Modifier.height(40.dp))
        SharpButton(
            label = stringResource(R.string.sign_out),
            onClick = onSignOut,
            variant = SharpButtonVariant.Outline,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(modifier = Modifier.height(40.dp))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = Walnut,
        modifier = Modifier.padding(bottom = 12.dp),
    )
}

@Composable
private fun SettingRow(
    title: String,
    subtitle: String? = null,
    trailingText: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.titleLarge, color = Espresso)
            subtitle?.let {
                Box(modifier = Modifier.height(4.dp))
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = Walnut)
            }
        }
        when {
            trailing != null -> trailing()
            trailingText != null -> Text(
                text = trailingText.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
        }
    }
    Hairline()
}

@Composable
private fun Hairline() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(0.5.dp)
            .background(Latte),
    )
}

/** Pill toggle — espresso track when on, latte when off. Round knob, no shadow. */
@Composable
private fun EditorialToggle(checked: Boolean, onChange: (Boolean) -> Unit) {
    val trackShape = RoundedCornerShape(50)
    val trackColor = if (checked) Espresso else Latte
    Box(
        modifier = Modifier
            .size(width = 44.dp, height = 24.dp)
            .background(trackColor, trackShape)
            .clickable { onChange(!checked) },
        contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Box(
            modifier = Modifier
                .padding(2.dp)
                .size(20.dp)
                .background(Paper, CircleShape)
                .border(0.5.dp, if (checked) Espresso else Walnut, CircleShape),
        )
    }
}
