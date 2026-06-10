package com.lifestyle.dailyscript.ui.feedback

import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.EditorialField
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

@Composable
fun FeedbackScreen(
    initialGender: String?,
    initialAge: String?,
    onBack: () -> Unit,
) {
    val vm: FeedbackViewModel = viewModel()
    val state by vm.state.collectAsState()

    var rating by remember { mutableStateOf(0) }
    var gender by remember { mutableStateOf(genderKo(initialGender)) }
    var age by remember { mutableStateOf(ageKo(initialAge)) }
    var liked by remember { mutableStateOf("") }
    var improve by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper),
    ) {
        // --- Top bar with back ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "Back",
                tint = Espresso,
                modifier = Modifier
                    .size(40.dp)
                    .clickable(onClick = onBack)
                    .padding(8.dp),
            )
            Text(
                text = "의견 보내기",
                style = MaterialTheme.typography.headlineMedium,
                color = Espresso,
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        if (state.done) {
            FeedbackDone(onBack = onBack)
            return@Column
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp),
        ) {
            Text(
                text = "더 좋은 명대사 경험을 위해 의견을 들려주세요.",
                style = MaterialTheme.typography.bodyMedium,
                color = Walnut,
            )
            Box(modifier = Modifier.height(20.dp))

            Label("별점")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                (1..5).forEach { i ->
                    Icon(
                        imageVector = if (i <= rating) Icons.Filled.Star else Icons.Outlined.StarBorder,
                        contentDescription = "$i stars",
                        tint = if (i <= rating) Highlight else Walnut,
                        modifier = Modifier
                            .size(32.dp)
                            .clickable { rating = i },
                    )
                }
            }
            Box(modifier = Modifier.height(20.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(modifier = Modifier.weight(1f)) {
                    Label("성별")
                    EditorialField(value = gender, onValueChange = { gender = it }, placeholder = "선택", singleLine = true, maxLength = 20)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Label("나이대")
                    EditorialField(value = age, onValueChange = { age = it }, placeholder = "선택", singleLine = true, maxLength = 20)
                }
            }
            Box(modifier = Modifier.height(16.dp))

            Label("좋았던 점")
            EditorialField(value = liked, onValueChange = { liked = it }, placeholder = "마음에 드신 부분을 알려주세요", minHeight = 72.dp, maxLength = 2000)
            Box(modifier = Modifier.height(16.dp))

            Label("개선할 점")
            EditorialField(value = improve, onValueChange = { improve = it }, placeholder = "불편하거나 아쉬운 점", minHeight = 72.dp, maxLength = 2000)
            Box(modifier = Modifier.height(16.dp))

            Label("자유 의견")
            EditorialField(value = message, onValueChange = { message = it }, placeholder = "하고 싶은 말을 자유롭게", minHeight = 96.dp, maxLength = 4000)
            Box(modifier = Modifier.height(16.dp))

            Label("이메일 (선택)")
            EditorialField(value = email, onValueChange = { email = it }, placeholder = "답변이 필요하면 입력해주세요", singleLine = true, maxLength = 320, keyboardType = KeyboardType.Email)

            state.error?.let {
                Box(modifier = Modifier.height(12.dp))
                Text(text = it, color = Cta, style = MaterialTheme.typography.bodySmall)
            }

            Box(modifier = Modifier.height(24.dp))
            SharpButton(
                label = if (state.submitting) "전송 중⋯" else "보내기",
                onClick = { vm.submit(rating, gender, age, liked, improve, message, email) },
                enabled = !state.submitting,
                modifier = Modifier.fillMaxWidth(),
            )
            // 떠 있는 하단 바에 가리지 않도록 — 카드 높이만큼 + 여유.
            Box(modifier = Modifier.height(BottomBarContentInset + 24.dp))
        }
    }
}

@Composable
private fun FeedbackDone(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "소중한 의견 감사합니다.",
            style = MaterialTheme.typography.headlineMedium,
            color = Espresso,
            textAlign = TextAlign.Center,
        )
        Box(modifier = Modifier.height(24.dp))
        SharpButton(label = "돌아가기", onClick = onBack, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun Label(text: String) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = Walnut,
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

private fun genderKo(code: String?): String = when (code) {
    "male" -> "남성"
    "female" -> "여성"
    "other" -> "기타"
    else -> ""
}

private fun ageKo(code: String?): String =
    code?.takeIf { it.endsWith("s") }?.dropLast(1)?.let { "${it}대" } ?: ""
