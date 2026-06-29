package com.lifestyle.dailyscript.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForwardIos
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.BuildConfig
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.model.UserPrefs
import com.lifestyle.dailyscript.data.repo.AuthRepository
import com.lifestyle.dailyscript.data.repo.SocialProvider
import com.lifestyle.dailyscript.data.repo.UserSession
import com.lifestyle.dailyscript.ui.IdCheckState
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.onboarding.GENRES
import com.lifestyle.dailyscript.ui.onboarding.THEMES
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.components.SharpButtonVariant
import com.lifestyle.dailyscript.ui.components.YarnChip
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun SettingsScreen(
    session: UserSession,
    /** Daily OZ Pick 로그인 게이트에서 진입했는지 — true 면 로그인 다이얼로그를 자동으로 연다. */
    autoOpenSignIn: Boolean = false,
    onConsumeAutoSignIn: () -> Unit = {},
    yarn: Int,
    onYarnClick: () -> Unit,
    authMessage: String?,
    authInProgress: Boolean,
    idCheck: IdCheckState,
    onSignIn: (id: String, password: String, signUp: Boolean, gender: String?, ageGroup: String?) -> Unit,
    onCheckId: (id: String) -> Unit,
    onResetIdCheck: () -> Unit,
    onSocialSignIn: (provider: SocialProvider) -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    onUpdateProfile: (nickname: String, gender: String?, ageGroup: String?) -> Unit,
    onSavePreferences: (genres: List<String>, themes: List<String>, any: Boolean) -> Unit,
    onOpenMyComments: () -> Unit,
    onOpenMyFeed: () -> Unit,
    onOpenBookmarks: () -> Unit,
    onOpenNotice: () -> Unit,
    hasUnreadNotice: Boolean = false,
    onOpenGuide: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onConsumeMessage: () -> Unit,
) {
    val vm: SettingsViewModel = viewModel()
    val pushEnabled by vm.pushEnabled.collectAsState()
    val tasteEnabled by vm.tasteEnabled.collectAsState()
    val tasteProfile by vm.tasteProfile.collectAsState()
    val darkTheme by vm.darkTheme.collectAsState()
    // 프로필 편집에서 미리 채울 현재 선호도(장르·주제). 미동기화면 null.
    val userPrefs by AppPreferences.userPrefs.collectAsState(initial = null)

    LaunchedEffect(session.userId) { vm.loadTasteProfile(session.userId) }

    var showProfileDialog by remember { mutableStateOf(false) }
    var showSignInDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm2 by remember { mutableStateOf(false) } // 이중 확인 2단계 (PWA appConfirm 2회)
    var showAttendance by remember { mutableStateOf(false) }
    // 설정에서 수동으로 열 땐 오늘 출석(+100)을 이미 받았는지 서버 기록으로 배너를 띄운다(앱 진입 시 자동 지급됨).
    var attendanceRewardedToday by remember { mutableStateOf(false) }
    var attendanceHistory by remember { mutableStateOf<Set<String>>(emptySet()) }
    val yarnRepo = remember { com.lifestyle.dailyscript.data.repo.YarnRepository() }
    LaunchedEffect(showAttendance) {
        if (showAttendance) {
            val hist = runCatching { yarnRepo.attendanceHistory() }.getOrDefault(emptyList()).toSet()
            attendanceHistory = hist
            attendanceRewardedToday = hist.contains(java.time.LocalDate.now().toString())
        }
    }
    if (showAttendance) {
        com.lifestyle.dailyscript.ui.yarn.AttendanceDialog(
            rewardedToday = attendanceRewardedToday,
            history = attendanceHistory,
            onDismiss = { showAttendance = false },
        )
    }
    // Once login succeeds the account is no longer anonymous → close the dialog.
    LaunchedEffect(session.isAnonymous) { if (!session.isAnonymous) showSignInDialog = false }
    // Daily OZ Pick 로그인 게이트에서 넘어왔으면 로그인 다이얼로그를 자동으로 띄운다(게스트일 때만, 1회 소비).
    LaunchedEffect(autoOpenSignIn) {
        if (autoOpenSignIn && session.isAnonymous) {
            showSignInDialog = true
            onConsumeAutoSignIn()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
    ) {
        Box(modifier = Modifier.height(24.dp))

        // --- Identity ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // 로그인 사용자만 닉네임 + 프로필 편집 노출 — 비로그인 시 'Anonymous' 문구 제거(사용자 요청).
            if (!session.isAnonymous) {
                Text(
                    text = session.nickname.ifBlank { stringResource(R.string.anonymous_user) },
                    style = MaterialTheme.typography.displayMedium,
                    color = Espresso,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .padding(top = 8.dp, start = 12.dp)
                        .border(0.5.dp, Walnut)
                        .clickable { showProfileDialog = true }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Text(
                        text = stringResource(R.string.edit_profile),
                        style = MaterialTheme.typography.labelSmall,
                        color = Walnut,
                    )
                }
            }
        }
        Box(modifier = Modifier.height(10.dp))
        // 보유 실타래 — 닉네임 아래 (PWA f4e9d86: top-bar 실타래 칩이 여기로 이동, '실타래' 라벨 포함).
        YarnChip(yarn = yarn, onClick = onYarnClick, label = "실타래")
        // 로그인 상태에선 합성 이메일 대신 사람이 정한 아이디(login_id)만 노출.
        session.loginId?.takeIf { !session.isAnonymous && it.isNotBlank() }?.let { loginId ->
            Box(modifier = Modifier.height(6.dp))
            Text(
                text = "아이디 · $loginId",
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
            )
        }

        authMessage?.let { msg ->
            Box(modifier = Modifier.height(12.dp))
            Text(text = msg, style = MaterialTheme.typography.bodySmall, color = Cta)
            LaunchedEffect(msg) {
                kotlinx.coroutines.delay(2500)
                onConsumeMessage()
            }
        }

        Box(modifier = Modifier.height(16.dp))
        Hairline()

        // 익명 사용자 — 신원(닉네임/소개) 바로 아래 로그인 CTA (PWA signin-block: 공지·내 활동 위).
        if (session.isAnonymous) {
            Box(modifier = Modifier.height(20.dp))
            SectionLabel(text = stringResource(R.string.account))
            Text(
                text = stringResource(R.string.account_desc),
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
            )
            Box(modifier = Modifier.height(14.dp))
            SharpButton(
                label = stringResource(R.string.login_or_signup),
                onClick = { showSignInDialog = true },
                variant = SharpButtonVariant.Outline,
                modifier = Modifier.fillMaxWidth(),
            )
            Box(modifier = Modifier.height(14.dp))
            Text(
                text = stringResource(R.string.signup_migrate_note),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
            Box(modifier = Modifier.height(16.dp))
            Hairline()
        }

        // --- 공지사항 (내 활동 위, 익명·로그인 모두 노출) — PWA eed7f22 동일 ---
        Box(modifier = Modifier.height(20.dp))
        SectionLabel(text = "공지")
        SettingRow(
            title = "공지사항",
            subtitle = "업데이트와 소식",
            onClick = onOpenNotice,
            trailing = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (hasUnreadNotice) {
                        Box(modifier = Modifier.size(7.dp).background(Cta, CircleShape))
                        Spacer(Modifier.width(10.dp))
                    }
                    Icon(
                        imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
                        contentDescription = null,
                        tint = Walnut,
                        modifier = Modifier.size(16.dp),
                    )
                }
            },
        )

        // --- 내 활동 — 내 댓글·내 피드·북마크·출석체크·실타래 구매를 한 섹션으로 (PWA MY 탭). ---
        Box(modifier = Modifier.height(20.dp))
        SectionLabel(text = stringResource(R.string.my_activity))
        if (!session.isAnonymous) {
            // 내 댓글·내 피드는 로그인 사용자만.
            SettingRow(
                title = stringResource(R.string.my_comments),
                subtitle = stringResource(R.string.my_comments_desc),
                onClick = onOpenMyComments,
                trailingArrow = true,
            )
            SettingRow(
                title = stringResource(R.string.my_feed_entry),
                subtitle = stringResource(R.string.my_feed_entry_desc),
                onClick = onOpenMyFeed,
                trailingArrow = true,
            )
        }
        SettingRow(
            title = stringResource(R.string.bookmarks_entry),
            subtitle = stringResource(R.string.bookmarks_entry_desc),
            onClick = onOpenBookmarks,
            trailingArrow = true,
        )
        SettingRow(
            title = stringResource(R.string.attendance_title),
            subtitle = "내 출석현황 보기",
            onClick = { showAttendance = true },
            trailingArrow = true,
        )
        // --- 일반 설정 ---
        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.general_preferences))
        SettingRow(
            title = stringResource(R.string.push_notifications),
            subtitle = stringResource(R.string.push_notifications_desc),
            trailing = { EditorialToggle(checked = pushEnabled, onChange = vm::setPushEnabled) },
        )
        SettingRow(
            title = stringResource(R.string.theme_settings),
            subtitle = stringResource(if (darkTheme) R.string.theme_dark_desc else R.string.theme_light_desc),
            trailing = { EditorialToggle(checked = darkTheme, onChange = vm::setDarkTheme) },
        )
        SettingRow(
            title = stringResource(R.string.taste_recommendation),
            subtitle = stringResource(R.string.taste_recommendation_desc),
            note = if (tasteEnabled) tasteProfile else null,
            trailing = {
                EditorialToggle(checked = tasteEnabled, onChange = { vm.setTasteEnabled(it, session.userId) })
            },
        )

        // --- 약관 및 정보 ---
        Box(modifier = Modifier.height(40.dp))
        SectionLabel(text = stringResource(R.string.legal_about))
        SettingRow(title = stringResource(R.string.app_guide), onClick = onOpenGuide, trailingArrow = true)
        SettingRow(title = stringResource(R.string.terms_of_service), onClick = onOpenTerms, trailingArrow = true)
        SettingRow(title = stringResource(R.string.privacy_policy), onClick = onOpenPrivacy, trailingArrow = true)
        SettingRow(title = stringResource(R.string.version_info), trailingText = "v${BuildConfig.VERSION_NAME}")

        // 로그아웃 — outline 블록 버튼 대신 작은 중앙 텍스트 링크 (PWA MY 화면과 동일).
        Box(modifier = Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.sign_out),
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 10.sp,
                textDecoration = TextDecoration.Underline,
            ),
            color = Walnut,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .clickable(onClick = onSignOut)
                .padding(vertical = 6.dp, horizontal = 12.dp),
        )
        if (!session.isAnonymous) {
            Box(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.delete_account),
                style = MaterialTheme.typography.labelSmall,
                color = Cta,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clickable { showDeleteDialog = true }
                    .padding(vertical = 8.dp),
            )
        }
        // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
        Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
    }

    if (showProfileDialog) {
        ProfileDialog(
            initialNickname = session.nickname,
            initialGender = session.gender,
            initialAge = session.ageGroup,
            initialPrefs = userPrefs,
            showPreferences = true,
            onDismiss = { showProfileDialog = false },
            onSave = { newName, gender, age ->
                onUpdateProfile(newName, gender, age)
                showProfileDialog = false
            },
            onSavePreferences = onSavePreferences,
        )
    }

    if (showSignInDialog) {
        SignInDialog(
            inProgress = authInProgress,
            message = authMessage,
            idCheck = idCheck,
            onSignIn = onSignIn,
            onCheckId = onCheckId,
            onResetIdCheck = onResetIdCheck,
            onSocialSignIn = onSocialSignIn,
            onDismiss = { showSignInDialog = false; onResetIdCheck() },
        )
    }

    // 계정 삭제 — 이중 확인 (PWA: '계속' → '영구 삭제' 2단계). 1차 통과 후에만 2차를 띄운다.
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            confirmButton = {
                TextButton(onClick = { showDeleteDialog = false; showDeleteConfirm2 = true }) {
                    Text("계속", color = Cta)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("취소", color = Walnut) }
            },
            title = { Text(stringResource(R.string.delete_account), color = Espresso) },
            text = {
                Text(
                    text = stringResource(R.string.delete_account_warning),
                    style = MaterialTheme.typography.bodySmall,
                    color = Walnut,
                )
            },
            containerColor = Paper,
        )
    }

    if (showDeleteConfirm2) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm2 = false },
            confirmButton = {
                TextButton(onClick = { showDeleteConfirm2 = false; onDeleteAccount() }) {
                    Text("영구 삭제", color = Cta)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm2 = false }) { Text("취소", color = Walnut) }
            },
            title = { Text("한 번 더 확인", color = Espresso) },
            text = {
                Text(
                    text = "정말 계정을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Walnut,
                )
            },
            containerColor = Paper,
        )
    }
}

/** 공식 로고가 들어간 소셜 로그인 버튼 (둥근 모서리, 브랜드 색). 로고 색 보존을 위해 Image 사용. */
@Composable
private fun SocialLoginButton(
    text: String,
    iconRes: Int,
    background: Color,
    contentColor: Color,
    borderColor: Color? = null,
    alpha: Float = 1f,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(10.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(alpha)
            .background(background, shape)
            .then(if (borderColor != null) Modifier.border(1.dp, borderColor, shape) else Modifier)
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            painter = painterResource(iconRes),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = text,
            color = contentColor,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

// 로그인·회원가입·프로필 편집 팝업 공용 모양 — 테두리·그림자를 같은 둥근모서리로 그린다.
private val DialogShape = RoundedCornerShape(28.dp)

@Composable
private fun SignInDialog(
    inProgress: Boolean,
    message: String?,
    idCheck: IdCheckState,
    onSignIn: (id: String, password: String, signUp: Boolean, gender: String?, ageGroup: String?) -> Unit,
    onCheckId: (id: String) -> Unit,
    onResetIdCheck: () -> Unit,
    onSocialSignIn: (provider: SocialProvider) -> Unit,
    onDismiss: () -> Unit,
) {
    var id by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signUp by remember { mutableStateOf(false) }
    var gender by remember { mutableStateOf<String?>(null) }
    var age by remember { mutableStateOf<String?>(null) }

    // 회원가입 제출 게이트: 중복확인 통과(AVAILABLE) 또는 네트워크 오류로 건너뜀(SKIPPED)일 때만.
    val signupReady = idCheck == IdCheckState.AVAILABLE || idCheck == IdCheckState.SKIPPED
    val canSubmit = !inProgress && id.isNotBlank() && password.isNotBlank() && (!signUp || signupReady)

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = canSubmit,
                onClick = { onSignIn(id, password, signUp, if (signUp) gender else null, if (signUp) age else null) },
            ) {
                Text(
                    text = if (inProgress) "⋯" else if (signUp) stringResource(R.string.sign_up_action) else stringResource(R.string.sign_in_action),
                    color = Cta,
                )
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        title = {
            Text(
                text = if (signUp) stringResource(R.string.sign_up_action) else stringResource(R.string.sign_in_action),
                color = Espresso,
            )
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                FieldBox(value = id, placeholder = stringResource(R.string.sign_in_id), onChange = { id = it; onResetIdCheck() })
                // 회원가입 — 아이디 중복확인 버튼 + 결과(PWA email_available).
                if (signUp) {
                    Box(modifier = Modifier.height(4.dp))
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        val (statusText, statusColor) = when (idCheck) {
                            IdCheckState.CHECKING -> "확인 중⋯" to Walnut
                            IdCheckState.AVAILABLE -> "사용 가능한 아이디예요" to Color(0xFF2E7D32)
                            IdCheckState.TAKEN -> "이미 사용 중인 아이디예요" to Cta
                            IdCheckState.SKIPPED -> "중복확인을 건너뜁니다 — 가입 시 확인돼요" to Walnut
                            IdCheckState.NONE -> "" to Walnut
                        }
                        Text(
                            text = statusText,
                            style = MaterialTheme.typography.labelSmall,
                            color = statusColor,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(
                            enabled = id.isNotBlank() && idCheck != IdCheckState.CHECKING,
                            onClick = { onCheckId(id) },
                        ) { Text("중복확인", color = Cta) }
                    }
                }
                Box(modifier = Modifier.height(8.dp))
                FieldBox(value = password, placeholder = stringResource(R.string.sign_in_password), onChange = { password = it }, isPassword = true)
                // 회원가입 — 성별·나이대(선택). PWA 가입 폼 패리티.
                if (signUp) {
                    Box(modifier = Modifier.height(14.dp))
                    DropdownField(label = "성별", options = GENDER_OPTIONS, selected = gender, onSelect = { gender = it })
                    Box(modifier = Modifier.height(8.dp))
                    DropdownField(label = "나이대", options = AGE_OPTIONS, selected = age, onSelect = { age = it })
                }
                Box(modifier = Modifier.height(10.dp))
                // 마지막 어절(회원가입/로그인)에만 밑줄을 줘 클릭 가능한 링크처럼 보이게 한다.
                val toggleText = if (signUp) stringResource(R.string.have_account_sign_in) else stringResource(R.string.no_account_sign_up)
                val toggleSplit = toggleText.lastIndexOf(' ')
                Text(
                    text = buildAnnotatedString {
                        if (toggleSplit >= 0) {
                            append(toggleText.substring(0, toggleSplit + 1))
                            withStyle(SpanStyle(textDecoration = TextDecoration.Underline)) {
                                append(toggleText.substring(toggleSplit + 1))
                            }
                        } else {
                            withStyle(SpanStyle(textDecoration = TextDecoration.Underline)) { append(toggleText) }
                        }
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    modifier = Modifier.clickable { signUp = !signUp; onResetIdCheck() }.padding(vertical = 4.dp),
                )
                message?.let {
                    Box(modifier = Modifier.height(8.dp))
                    Text(text = it, style = MaterialTheme.typography.bodySmall, color = Cta)
                }
                Box(modifier = Modifier.height(18.dp))
                Text(
                    text = "또는 소셜 계정으로",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                )
                Box(modifier = Modifier.height(8.dp))
                SocialLoginButton(
                    text = "Google로 로그인",
                    iconRes = R.drawable.ic_google_logo,
                    background = Color.White,
                    contentColor = Color(0xFF1F1F1F),
                    borderColor = Color(0xFFDADCE0),
                    onClick = { onSocialSignIn(SocialProvider.GOOGLE) },
                )
                Box(modifier = Modifier.height(8.dp))
                // 카카오 — 공식 노랑(#FEE500) + 검정 말풍선 로고. (PWA 284769c/1458fa3: '준비 중' 해제)
                SocialLoginButton(
                    text = "카카오로 로그인",
                    iconRes = R.drawable.ic_kakao_logo,
                    background = Color(0xFFFEE500),
                    contentColor = Color(0xFF000000),
                    onClick = { onSocialSignIn(SocialProvider.KAKAO) },
                )
                Box(modifier = Modifier.height(14.dp))
                Text(
                    text = "소셜 로그인은 회원 식별 및 로그인 목적으로만 사용되며, 소셜 계정의 프로필 정보는 사용하지 않습니다.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Walnut,
                )
            }
        },
        shape = DialogShape,
        containerColor = Paper,
        // 떠 있는 팝업이 본문과 분리돼 보이도록 테두리(Latte) + 그림자.
        modifier = Modifier
            .shadow(16.dp, DialogShape)
            .border(2.5.dp, Latte, DialogShape),
    )
}

// (value, display) — null value means "선택 안 함" (clears nothing; just leaves unset).
private val GENDER_OPTIONS: List<Pair<String?, String>> = listOf(
    null to "선택 안 함", "male" to "남성", "female" to "여성", "other" to "기타",
)
private val AGE_OPTIONS: List<Pair<String?, String>> = listOf(null to "선택 안 함") +
    (1..9).map { "${it}0s" to "${it}0대" }

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ProfileDialog(
    initialNickname: String,
    initialGender: String?,
    initialAge: String?,
    onDismiss: () -> Unit,
    onSave: (String, String?, String?) -> Unit,
    initialPrefs: UserPrefs? = null,
    showPreferences: Boolean = false,
    onSavePreferences: (genres: List<String>, themes: List<String>, any: Boolean) -> Unit = { _, _, _ -> },
) {
    var name by remember { mutableStateOf(initialNickname) }
    var gender by remember { mutableStateOf(initialGender) }
    var age by remember { mutableStateOf(initialAge) }
    // 취향(장르·주제) — 온보딩과 동일 저장값. 초기값은 현재 저장된 선호도.
    val initGenres = remember(initialPrefs) { initialPrefs?.genres?.toSet() ?: emptySet() }
    val initThemes = remember(initialPrefs) { initialPrefs?.themes?.toSet() ?: emptySet() }
    val initAny = initialPrefs?.any ?: false
    var genres by remember(initialPrefs) { mutableStateOf(initGenres) }
    var themes by remember(initialPrefs) { mutableStateOf(initThemes) }
    var any by remember(initialPrefs) { mutableStateOf(initAny) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                // 선호도는 바뀐 경우에만 저장(로컬+서버). 안 건드렸으면 그대로 둔다.
                if (showPreferences && (genres != initGenres || themes != initThemes || any != initAny)) {
                    onSavePreferences(genres.toList(), themes.toList(), any)
                }
                onSave(name, gender, age)
            }) { Text("저장", color = Cta) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("취소", color = Walnut) }
        },
        title = { Text(stringResource(R.string.edit_profile), color = Espresso) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
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

                if (showPreferences) {
                    Box(modifier = Modifier.height(20.dp))
                    SectionLabel("좋아하는 장르")
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        GENRES.forEach { g ->
                            PrefChip(label = g.ko, selected = g.format in genres) {
                                genres = if (g.format in genres) genres - g.format else genres + g.format
                            }
                        }
                    }
                    Box(modifier = Modifier.height(16.dp))
                    SectionLabel("관심 주제")
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        THEMES.forEach { t ->
                            PrefChip(label = t.ko, selected = !any && t.ko in themes, accent = t.color) {
                                themes = if (t.ko in themes) themes - t.ko else themes + t.ko
                                if (themes.isNotEmpty()) any = false
                            }
                        }
                        // "상관없음" — 켜면 주제 선택을 비우고 모든 주제에서 폭넓게 추천 (PWA any).
                        PrefChip(label = "상관없음", selected = any) {
                            any = !any
                            if (any) themes = emptySet()
                        }
                    }
                }
            }
        },
        shape = DialogShape,
        containerColor = Paper,
        // 떠 있는 팝업이 본문과 분리돼 보이도록 테두리(Latte) + 그림자.
        modifier = Modifier
            .shadow(16.dp, DialogShape)
            .border(2.5.dp, Latte, DialogShape),
    )
}

/** 프로필 편집의 장르·주제 토글 칩 (선택 시 강조색 테두리 + 굵은 텍스트). */
@Composable
private fun PrefChip(
    label: String,
    selected: Boolean,
    accent: Color = Cta,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier = Modifier
            .clip(shape)
            .background(if (selected) accent.copy(alpha = 0.12f) else Paper)
            .border(1.dp, if (selected) accent else Latte, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = if (selected) Espresso else Walnut,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        )
    }
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
    note: String? = null,
    trailingText: String? = null,
    trailingArrow: Boolean = false,
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
            note?.let {
                Box(modifier = Modifier.height(8.dp))
                Text(text = it, style = MaterialTheme.typography.labelSmall, color = Walnut)
            }
        }
        when {
            trailing != null -> trailing()
            trailingText != null -> Text(
                text = trailingText.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
            trailingArrow -> Icon(
                imageVector = Icons.AutoMirrored.Outlined.ArrowForwardIos,
                contentDescription = null,
                tint = Walnut,
                modifier = Modifier.size(16.dp),
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
