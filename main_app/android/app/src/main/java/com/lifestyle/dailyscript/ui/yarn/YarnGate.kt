package com.lifestyle.dailyscript.ui.yarn

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import kotlinx.coroutines.launch

private enum class Decision { Checking, NeedConfirm, Approved, Insufficient }

/**
 * 카드 열람 게이트. [content](=DetailScreen)는 차감이 승인된 뒤에만 컴포즈되므로
 * vm.load/incrementView 도 그때만 실행된다.
 *
 * - 게이트는 항상 작동(코치 투어/온보딩 중에도). 3일 unlock 윈도우(isUnlocked)만 무료 통과 — PWA 동일.
 * - 이미 연 카드면 바로 통과.
 * - 아니면 확인 다이얼로그(잔액 0이면 부족 다이얼로그) → 사용 시 우선순위 차감.
 */
@Composable
fun YarnGate(
    cardId: Long,
    yarnVm: YarnViewModel,
    onGoCharge: () -> Unit,
    onCancel: () -> Unit,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val available by yarnVm.available.collectAsState()
    var decision by remember(cardId) { mutableStateOf(Decision.Checking) }
    var spending by remember(cardId) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(cardId) {
        decision = if (yarnVm.isUnlocked(cardId)) Decision.Approved else Decision.NeedConfirm
    }

    when (decision) {
        Decision.Checking -> Box(Modifier.fillMaxSize().background(Paper))
        Decision.Approved -> content()
        Decision.Insufficient -> InsufficientDialog(onConfirm = onGoCharge, onDismiss = onCancel)
        Decision.NeedConfirm -> {
            if (available <= 0) {
                InsufficientDialog(onConfirm = onGoCharge, onDismiss = onCancel)
            } else {
                ConfirmSpendDialog(
                    inProgress = spending,
                    onConfirm = {
                        if (!spending) {
                            spending = true
                            scope.launch {
                                when (yarnVm.spend(cardId)) {
                                    YarnResult.AlreadyUnlocked,
                                    YarnResult.ChargedDaily,
                                    YarnResult.ChargedPurchased -> decision = Decision.Approved
                                    YarnResult.Insufficient -> decision = Decision.Insufficient
                                    YarnResult.Error -> {
                                        Toast.makeText(
                                            context,
                                            "잠시 후 다시 시도해주세요.",
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                        onCancel()
                                    }
                                }
                                spending = false
                            }
                        }
                    },
                    onDismiss = onCancel,
                )
            }
        }
    }
}

@Composable
private fun ConfirmSpendDialog(inProgress: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(enabled = !inProgress, onClick = onConfirm) {
                Text(stringResource(R.string.yarn_confirm_use), color = Cta)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        title = { Text(stringResource(R.string.yarn_confirm_title), color = Espresso) },
        text = {
            Text(
                text = stringResource(R.string.yarn_confirm_body),
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
            )
        },
        containerColor = Paper,
    )
}

@Composable
private fun InsufficientDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.yarn_go_charge), color = Cta)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소", color = Walnut) } },
        title = { Text(stringResource(R.string.yarn_insufficient_title), color = Espresso) },
        text = {
            Text(
                text = stringResource(R.string.yarn_insufficient_body),
                style = MaterialTheme.typography.bodySmall,
                color = Walnut,
            )
        },
        containerColor = Paper,
    )
}
