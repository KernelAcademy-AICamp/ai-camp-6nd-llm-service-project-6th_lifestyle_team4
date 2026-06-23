package com.lifestyle.dailyscript.ui.yarn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.components.YarnIcon
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * 실타래 설명 팝업 — 상단바 실타래 칩을 탭하면 뜬다.
 * 삭제된 충전 페이지의 ABOUT 탭 내용을 가벼운 다이얼로그로 옮긴 것. 잔액/충전 진입은 없다.
 */
@Composable
fun YarnInfoDialog(onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Paper)
                .border(0.5.dp, Latte, RoundedCornerShape(14.dp))
                .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 24.dp),
        ) {
            // 닫기 버튼 — 우상단 오버레이.
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.align(Alignment.TopEnd),
            ) {
                Icon(Icons.Outlined.Close, contentDescription = "닫기", tint = Walnut)
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                YarnIcon(modifier = Modifier.size(40.dp))
                Spacer(Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.yarn_info_title),
                    style = MaterialTheme.typography.displayMedium.copy(fontFamily = EditorialSerif),
                    color = Espresso,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = stringResource(R.string.yarn_info_lede),
                    style = MaterialTheme.typography.labelSmall.copy(
                        letterSpacing = 0.2.em,
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Cta,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                Text(
                    text = stringResource(R.string.yarn_info_body),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Sand.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .padding(horizontal = 18.dp, vertical = 18.dp),
                ) {
                    Text(
                        text = stringResource(R.string.yarn_info_note),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Espresso,
                        textAlign = TextAlign.Center,
                    )
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    text = stringResource(R.string.yarn_info_outro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
