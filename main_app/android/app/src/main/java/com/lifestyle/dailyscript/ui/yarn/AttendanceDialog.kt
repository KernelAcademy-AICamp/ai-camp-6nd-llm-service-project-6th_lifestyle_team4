package com.lifestyle.dailyscript.ui.yarn

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.ui.components.YarnIcon
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

/**
 * 출석체크 다이얼로그 — 00시 기준 그날 첫 진입 시 1회.
 * 한 달 달력 + 출석한 날에 실타래 아이콘. 보상 받은 경우 상단에 +5 안내.
 */
@Composable
fun AttendanceDialog(
    rewardedToday: Boolean,
    onDismiss: () -> Unit,
) {
    var history by remember { mutableStateOf<Set<String>>(emptySet()) }
    LaunchedEffect(Unit) { history = AppPreferences.attendanceHistory() }

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
                .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 18.dp),
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.attendance_title),
                        style = MaterialTheme.typography.headlineSmall,
                        color = Espresso,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Outlined.Close, contentDescription = "닫기", tint = Walnut)
                    }
                }
                if (rewardedToday) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Sand.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                    ) {
                        YarnIcon(modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = stringResource(R.string.attendance_reward),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Espresso,
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                CalendarGrid(history = history)
            }
        }
    }
}

@Composable
internal fun CalendarGrid(history: Set<String>) {
    val today = LocalDate.now()
    val ym = YearMonth.from(today)
    val firstDow = ym.atDay(1).dayOfWeek // MONDAY=1 … SUNDAY=7. 우리는 일요일=0 컬럼.
    val leadingBlanks = if (firstDow == DayOfWeek.SUNDAY) 0 else firstDow.value
    val lastDate = ym.lengthOfMonth()

    val dayLabels = listOf("일", "월", "화", "수", "목", "금", "토")

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "${today.year}년 ${today.monthValue}월",
            style = MaterialTheme.typography.titleMedium,
            color = Espresso,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 10.dp),
        )
        Row(modifier = Modifier.fillMaxWidth()) {
            dayLabels.forEachIndexed { i, label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = if (i == 0) Cta else Walnut,
                    modifier = Modifier.weight(1f).padding(vertical = 6.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
        }
        var dayCounter = 1 - leadingBlanks
        while (dayCounter <= lastDate) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                repeat(7) {
                    val d = dayCounter
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .padding(vertical = 2.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (d in 1..lastDate) DayCell(date = ym.atDay(d), today = today, history = history)
                    }
                    dayCounter++
                }
            }
        }
    }
}

@Composable
private fun DayCell(date: LocalDate, today: LocalDate, history: Set<String>) {
    val ds = date.toString() // yyyy-MM-dd
    val attended = history.contains(ds)
    val isToday = date == today
    val border = if (isToday) 1.5.dp else 0.dp
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(if (attended) Sand.copy(alpha = 0.35f) else Color.Transparent)
            .then(if (isToday) Modifier.border(border, Cta, RoundedCornerShape(8.dp)) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = date.dayOfMonth.toString(),
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                    fontSize = 11.sp,
                ),
                color = if (attended) Espresso else Walnut,
            )
            if (attended) {
                YarnIcon(modifier = Modifier.size(18.dp))
            } else {
                Spacer(Modifier.height(18.dp))
            }
        }
    }
}
