package com.lifestyle.dailyscript.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.lifestyle.dailyscript.ui.components.SharpButton
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut

data class CoachStep(val title: String, val body: String)

/** The default first-run tour for the app. */
val DEFAULT_COACH_STEPS = listOf(
    CoachStep("오늘의 명대사", "매일 새로운 한 장의 명대사를 만나요. 오른쪽 위 새로고침으로 다른 명대사를 볼 수 있어요."),
    CoachStep("수집하기", "북마크 아이콘을 눌러 마음에 드는 명대사를 보관함에 모으세요. 보관함은 장르별 책장으로 정리돼요."),
    CoachStep("깊이 읽기", "카드를 누르면 전체 장면과 작품의 의의를 읽을 수 있어요. 영문 원문이 있으면 EN 버튼으로 전환돼요."),
    CoachStep("함께 나누기", "본문을 길게 눌러 마음에 드는 구절을 하이라이트로 저장하고, 피드와 댓글로 감상을 나눠보세요."),
)

/**
 * Lightweight first-run coachmark — a scrim with a centered step card.
 * (A simplified take on the PWA's spotlight tour, onboarding.js.)
 */
@Composable
fun CoachmarkOverlay(
    steps: List<CoachStep> = DEFAULT_COACH_STEPS,
    onFinish: () -> Unit,
) {
    if (steps.isEmpty()) return
    var index by remember { mutableIntStateOf(0) }
    val step = steps[index]
    val isLast = index == steps.lastIndex

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.72f))
            // Swallow taps so the underlying screen can't be interacted with.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .padding(horizontal = 28.dp)
                .fillMaxWidth()
                .background(Paper, RoundedCornerShape(12.dp))
                .padding(24.dp),
        ) {
            Text(
                text = "${index + 1} / ${steps.size}",
                style = MaterialTheme.typography.labelSmall,
                color = Walnut,
            )
            Box(modifier = Modifier.height(10.dp))
            Text(text = step.title, style = MaterialTheme.typography.headlineMedium, color = Espresso)
            Box(modifier = Modifier.height(12.dp))
            Text(text = step.body, style = MaterialTheme.typography.bodyLarge, color = Walnut)
            Box(modifier = Modifier.height(24.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "건너뛰기",
                    style = MaterialTheme.typography.labelSmall,
                    color = Walnut,
                    modifier = Modifier
                        .clickable(onClick = onFinish)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                )
                SharpButton(
                    label = if (isLast) "시작하기" else "다음",
                    onClick = { if (isLast) onFinish() else index++ },
                )
            }
        }
    }
}
