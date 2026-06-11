package com.lifestyle.dailyscript.ui.yarn

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect

/**
 * 카드 열람 게이트. 사용자 명세(2026-06): 실타래 사용 팝업/잠금 제거 — 모든 카드 자유 열람.
 *   대신 카드 1개당 1번에 한해 처음 열람 시 실타래 +1 지급(중복 없음).
 *
 * onGoCharge / onCancel 콜백은 호출자 시그니처 호환을 위해 유지하되 사용하지 않는다.
 */
@Composable
fun YarnGate(
    cardId: Long,
    yarnVm: YarnViewModel,
    onGoCharge: () -> Unit,
    onCancel: () -> Unit,
    content: @Composable () -> Unit,
) {
    LaunchedEffect(cardId) { yarnVm.rewardFirstView(cardId) }
    content()
}
