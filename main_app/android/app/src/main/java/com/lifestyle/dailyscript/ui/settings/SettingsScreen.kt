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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.BuildConfig
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.repo.AuthRepository
import com.lifestyle.dailyscript.data.repo.UserSession
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun SettingsScreen(
    session: UserSession,
    authMessage: String?,
    authInProgress: Boolean,
    onSignIn: (id: String, password: String, signUp: Boolean) -> Unit,
    onSignOut: () -> Unit,
    onUpdateProfile: (nickname: String, gender: String?, ageGroup: String?) -> Unit,
    onOpenFeedback: () -> Unit,
    onConsumeMessage: () -> Unit,
) {
    val vm: SettingsViewModel = viewModel()
    val pushEnabled by vm.pushEnabled.collectAsState()
    val tasteEnabled by vm.tasteEnabled.collectAsState()
    val tasteProfile by vm.tasteProfile.collectAsState()
    val darkTheme by vm.darkTheme.collectAsState()

    LaunchedEffect(session.userId) { vm.loadTasteProfile(session.userId) }

    var showProfileDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Box(modifier = Modifier.height(40.dp))

        // --- Identity ---
        val title = if (session.isAnonymous) {
            stringResource(R.string.anonymous_user)
        } else {
            session.nickname.ifBlank { stringResource(R.string.anonymous_user) }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = title, style = MaterialTheme.typography.displayMedium, color = Espresso)
            if (!session.isAnonymous) {
                Text(
                    text = "EDIT",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    modifier = Modifier
                        .clickable { showProfileDialog = true }
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                )
            }
        }
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.profile_bio),
            style = MaterialTheme.typography.bodyLarge,
            color = Walnut,
        )

        // --- Sign-in (anonymous only) ---
        if (session.isAnonymous) {
            Box(modifier = Modifier.height(28.dp))
            SignInBlock(
                inProgress = authInProgress,
                onSignIn = onSignIn,
            )
        }

        authMessage?.let { msg ->
            Box(modifier = Modifier.height(12.dp))
            Text(text = msg, style = MaterialTheme.typography.bodySmall, color = Cta)
            // Clear the message the next time settings recomposes via a button press.
            LaunchedEffect(msg) {
                kotlinx.coroutines.delay(2500)
                onConsumeMessage()
            }
        }

        Box(modifier = Modifier.height(32.dp))
        Hairline()

        // --- General Preferences ---
        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.general_preferences))
        SettingRow(
            title = stringResource(R.string.push_notifications),
            subtitle = stringResource(R.string.push_notifications_desc),
            trailing = { EditorialToggle(checked = pushEnabled, onChange = vm::setPushEnabled) },
        )
        SettingRow(
            title = stringResource(R.string.taste_recommendation),
            subtitle = if (tasteEnabled) tasteProfile ?: stringResource(R.string.taste_recommendation_desc)
            else stringResource(R.string.taste_recommendation_desc),
            trailing = {
                EditorialToggle(
                    checked = tasteEnabled,
                    onChange = { vm.setTasteEnabled(it, session.userId) },
                )
            },
        )
        SettingRow(
            title = stringResource(R.string.theme_settings),
            subtitle = stringResource(if (darkTheme) R.string.theme_dark_desc else R.string.theme_light_desc),
            trailing = { EditorialToggle(checked = darkTheme, onChange = vm::setDarkTheme) },
        )

        // --- Legal & About ---
        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.legal_about))
        SettingRow(
            title = stringResource(R.string.send_feedback),
            subtitle = stringResource(R.string.send_feedback_desc),
            onClick = onOpenFeedback,
        )
        SettingRow(title = stringResource(R.string.terms_of_service))
        SettingRow(
            title = stringResource(R.string.version_info),
            trailingText = "v${BuildConfig.VERSION_NAME}",
        )

        Box(modifier = Modifier.height(40.dp))
        SharpButton(
            label = if (session.isAnonymous) stringResource(R.string.reset_anonymous)
            else stringResource(R.string.sign_out),
            onClick = onSignOut,
            variant = SharpButtonVariant.Outline,
            modifier = Modifier.fillMaxWidth(),
        )
        Box(modifier = Modifier.height(40.dp))
    }

    if (showProfileDialog) {
        ProfileDialog(
            initialNickname = session.nickname,
            initialGender = session.gender,
            initialAge = session.ageGroup,
            onDismiss = { showProfileDialog = false },
            onSave = { newName, gender, age ->
                onUpdateProfile(newName, gender, age)
                showProfileDialog = false
            },
        )
    }
}

@Composable
private fun SignInBlock(
    inProgress: Boolean,
    onSignIn: (id: String, password: String, signUp: Boolean) -> Unit,
) {
    var id by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signUp by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth()) {
        SectionLabel(text = stringResource(R.string.sign_in))
        Text(
            text = stringResource(R.string.sign_in_desc),
            style = MaterialTheme.typography.bodySmall,
            color = Walnut,
        )
        Box(modifier = Modifier.height(12.dp))
        FieldBox(value = id, placeholder = stringResource(R.string.sign_in_id), onChange = { id = it })
        Box(modifier = Modifier.height(8.dp))
        FieldBox(
            value = password,
            placeholder = stringResource(R.string.sign_in_password),
            onChange = { password = it },
            isPassword = true,
        )
        Box(modifier = Modifier.height(12.dp))
        SharpButton(
            label = if (inProgress) "⋯"
            else if (signUp) stringResource(R.string.sign_up_action)
            else stringResource(R.string.sign_in_action),
            onClick = { if (!inProgress) onSignIn(id, password, signUp) },
            enabled = !inProgress && id.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        )
        Box(modifier = Modifier.height(10.dp))
        Text(
            text = if (signUp) stringResource(R.string.have_account_sign_in)
            else stringResource(R.string.no_account_sign_up),
            style = MaterialTheme.typography.labelSmall,
            color = Walnut,
            modifier = Modifier
                .clickable { signUp = !signUp }
                .padding(vertical = 4.dp),
        )
    }
}

// (value, display) — null value means "선택 안 함" (clears nothing; just leaves unset).
private val GENDER_OPTIONS: List<Pair<String?, String>> = listOf(
    null to "선택 안 함", "male" to "남성", "female" to "여성", "other" to "기타",
)
private val AGE_OPTIONS: List<Pair<String?, String>> = listOf(null to "선택 안 함") +
    (1..9).map { "${it}0s" to "${it}0대" }

@Composable
private fun ProfileDialog(
    initialNickname: String,
    initialGender: String?,
    initialAge: String?,
    onDismiss: () -> Unit,
    onSave: (String, String?, String?) -> Unit,
) {
    var name by remember { mutableStateOf(initialNickname) }
    var gender by remember { mutableStateOf(initialGender) }
    var age by remember { mutableStateOf(initialAge) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onSave(name, gender, age) }) { Text("저장", color = Cta) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("취소", color = Walnut) }
        },
        title = { Text(stringResource(R.string.edit_profile), color = Espresso) },
        text = {
            Column {
                FieldBox(value = name, placeholder = stringResource(R.string.nickname_placeholder), onChange = { if (it.length <= 24) name = it })
                Box(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.randomize),
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    modifier = Modifier
                        .clickable { name = AuthRepository.randomCuteNickname() }
                        .padding(vertical = 4.dp),
                )
                Box(modifier = Modifier.height(16.dp))
                DropdownField(label = "성별", options = GENDER_OPTIONS, selected = gender, onSelect = { gender = it })
                Box(modifier = Modifier.height(8.dp))
                DropdownField(label = "나이대", options = AGE_OPTIONS, selected = age, onSelect = { age = it })
            }
        },
        containerColor = Paper,
    )
}

/** Editorial-styled dropdown row (label left, value right) backed by a DropdownMenu. */
@Composable
private fun DropdownField(
    label: String,
    options: List<Pair<String?, String>>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    val selectedLabel = options.firstOrNull { it.first == selected }?.second ?: options.first().second
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Paper, shape)
                .border(0.5.dp, Latte, shape)
                .clickable { expanded = true }
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(text = label, style = MaterialTheme.typography.bodyMedium, color = Walnut)
            Text(text = selectedLabel, style = MaterialTheme.typography.bodyMedium, color = Espresso)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, disp) ->
                DropdownMenuItem(
                    text = { Text(disp, color = Espresso) },
                    onClick = { onSelect(value); expanded = false },
                )
            }
        }
    }
}

@Composable
private fun FieldBox(
    value: String,
    placeholder: String,
    onChange: (String) -> Unit,
    isPassword: Boolean = false,
) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Paper, shape)
            .border(0.5.dp, Latte, shape)
            .padding(horizontal = 14.dp, vertical = 14.dp),
    ) {
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = Espresso),
            cursorBrush = SolidColor(Cta),
            visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(text = placeholder, style = MaterialTheme.typography.bodyMedium, color = Walnut)
                }
                inner()
            },
        )
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
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
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
