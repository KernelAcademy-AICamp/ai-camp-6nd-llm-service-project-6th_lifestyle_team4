package com.lifestyle.dailyscript.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * 게스트(비로그인) 사용자가 회원 전용 동작(북마크 등)을 시도할 때 뜨는 로그인 유도 팝업.
 * PWA openPromptModal / iOS AccountRequiredPrompt 카피 미러 — 확인='로그인'(로그인 화면으로),
 * 취소='닫기'. 제목·메시지는 기본값이 북마크용이며 필요 시 호출부에서 덮어쓴다.
 */
@Composable
fun LoginPromptDialog(
    onLogin: () -> Unit,
    onDismiss: () -> Unit,
    title: String = "북마크는 회원 전용",
    message: String = "마음에 든 명대사를 보관하려면 로그인이 필요해요.",
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onLogin) { Text(stringResource(R.string.sign_in_action), color = Cta) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("닫기", color = Walnut) }
        },
        title = { Text(title, color = Espresso) },
        text = {
            Text(text = message, color = Walnut, style = MaterialTheme.typography.bodyMedium)
        },
        containerColor = Paper,
    )
}
