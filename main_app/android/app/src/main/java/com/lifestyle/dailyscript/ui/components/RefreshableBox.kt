package com.lifestyle.dailyscript.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp

/**
 * 당겨서 새로고침 래퍼 — Material3 [PullToRefreshBox] 의 얇은 감싸개.
 * 기본 동그라미 스피너 대신 하단탭 '오늘의 명대사' 홈 버튼의 **실타래([YarnIcon])가
 * 위에서 내려와 도는** 커스텀 인디케이터를 쓴다. 실험 API([ExperimentalMaterial3Api])
 * opt-in 을 여기서만 처리해, 각 화면은 opt-in 없이 쓴다.
 *
 * 풀 제스처는 [content] 안에 스크롤 컨테이너(LazyColumn / verticalScroll)가 있을 때만 동작한다 —
 * 빈/에러 상태처럼 스크롤이 없는 화면에선 트리거되지 않는다(의도된 한계).
 *
 * @param refreshing 새로고침 진행 여부(인디케이터 표시) — VM 의 refreshing 플래그를 그대로 전달.
 * @param onRefresh  사용자가 당겼을 때 호출 — VM 의 refresh() 를 연결.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshableBox(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val state = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = modifier,
        state = state,
        indicator = {
            YarnRefreshIndicator(
                state = state,
                refreshing = refreshing,
                modifier = Modifier.align(Alignment.TopCenter),
            )
        },
        content = content,
    )
}

/**
 * 실타래 인디케이터 — 당기는 거리([PullToRefreshState.distanceFraction])만큼 위에서 내려오고
 * 살짝 감기다가(windup), 새로고침 중엔 계속 회전한다. 회전 애니메이션은 새로고침 중에만 돌려
 * 평소엔 매 프레임 리컴포즈하지 않는다.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun YarnRefreshIndicator(
    state: PullToRefreshState,
    refreshing: Boolean,
    modifier: Modifier = Modifier,
) {
    val size = 44.dp
    val restY = 16.dp

    // 새로고침 중에만 빙글빙글 — refreshing 이 false 면 0 으로 고정(idle 시 애니메이션·리컴포즈 없음).
    val angle = remember { Animatable(0f) }
    LaunchedEffect(refreshing) {
        if (refreshing) {
            angle.snapTo(0f)
            angle.animateTo(
                targetValue = 360f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = 750, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart,
                ),
            )
        } else {
            angle.snapTo(0f)
        }
    }

    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                // shown 0→1: 위(숨김)에서 restY 까지 내려오며 페이드·확대.
                val shown = (if (refreshing) 1f else state.distanceFraction).coerceIn(0f, 1f)
                translationY = -size.toPx() + shown * (size.toPx() + restY.toPx())
                alpha = shown
                val s = 0.5f + 0.5f * shown
                scaleX = s
                scaleY = s
                // 당기는 동안 살짝 감기고(windup), 새로고침 중엔 연속 회전.
                rotationZ = if (refreshing) angle.value else state.distanceFraction * 200f
            },
        contentAlignment = Alignment.Center,
    ) {
        YarnIcon(modifier = Modifier.fillMaxSize())
    }
}
