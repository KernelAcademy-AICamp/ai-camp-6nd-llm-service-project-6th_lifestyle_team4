package com.lifestyle.dailyscript.ui.yarn

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.components.BottomBarContentInset
import com.lifestyle.dailyscript.ui.components.YarnIcon
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut
import kotlinx.coroutines.launch

/** 충전 요금제 — (실타래 개수, 가격원). 결제는 '준비 중'. */
private val YARN_TIERS = listOf(1 to 100, 10 to 1000, 21 to 2000, 32 to 3000, 113 to 10000)

/**
 * 실타래 충전 페이지(현재 '준비 중') + ABOUT 설명 토글.
 * [available] = 오늘 쓸 수 있는 총 실타래(무료 잔여 + 충전 잔액) — 상단바 칩과 동일.
 */
@Composable
fun YarnPurchaseScreen(yarnVm: YarnViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    val available by yarnVm.available.collectAsState()
    val scope = rememberCoroutineScope()
    var aboutTab by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().background(Paper)) {
        // --- Top bar: 뒤로 + 충전/ABOUT 토글 ---
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = stringResource(R.string.back),
                tint = Espresso,
                modifier = Modifier
                    .size(40.dp)
                    .clickable(onClick = onBack)
                    .padding(8.dp),
            )
            Spacer(Modifier.weight(1f))
            TabLabel(
                text = stringResource(R.string.yarn_tab_charge),
                selected = !aboutTab,
                onClick = { aboutTab = false },
            )
            Spacer(Modifier.width(4.dp))
            TabLabel(
                text = stringResource(R.string.yarn_tab_about),
                selected = aboutTab,
                onClick = { aboutTab = true },
            )
        }
        Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // 떠 있는 하단 바에 가리지 않도록 아래 여백을 카드 높이만큼 더 준다.
                .padding(start = 20.dp, end = 20.dp, top = 24.dp, bottom = BottomBarContentInset + 24.dp),
        ) {
            if (aboutTab) {
                AboutContent()
            } else {
                ChargeContent(
                    available = available,
                    onTier = { count ->
                        // 결제 없이 즉시 충전(서버 잔액 +count). 성공/실패를 토스트로 안내.
                        scope.launch {
                            val ok = yarnVm.addYarn(count)
                            Toast.makeText(
                                context,
                                if (ok) "실타래 ${count}개를 충전했어요." else "충전에 실패했어요. 잠시 후 다시 시도해주세요.",
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun ChargeContent(available: Int, onTier: (Int) -> Unit) {
    Text(
        text = stringResource(R.string.yarn_about_title),
        style = MaterialTheme.typography.displayMedium.copy(fontFamily = EditorialSerif),
        color = Espresso,
    )
    Spacer(Modifier.height(6.dp))
    Text(
        text = stringResource(R.string.yarn_charge_desc),
        style = MaterialTheme.typography.bodySmall,
        color = Walnut,
    )

    // 보유 실타래 헤더
    Spacer(Modifier.height(18.dp))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Sand.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        YarnIcon(modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(10.dp))
        Text(
            text = stringResource(R.string.yarn_my_balance, available),
            style = MaterialTheme.typography.titleLarge,
            color = Espresso,
        )
    }
    Spacer(Modifier.height(8.dp))
    Text(
        text = stringResource(R.string.yarn_daily_note),
        style = MaterialTheme.typography.labelSmall,
        color = Walnut,
    )

    // 요금제
    Spacer(Modifier.height(20.dp))
    YARN_TIERS.forEach { (count, price) ->
        TierRow(count = count, price = price, onClick = { onTier(count) })
        Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
    }
}

@Composable
private fun TierRow(count: Int, price: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            YarnIcon(modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Text(
                text = "실타래 ${count}개",
                style = MaterialTheme.typography.titleLarge,
                color = Espresso,
            )
        }
        // 가격 pill (Cta) — 탭하면 '준비 중'
        Box(
            modifier = Modifier
                .background(Cta, RoundedCornerShape(6.dp))
                .padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            Text(
                text = "₩%,d".format(price),
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                color = Paper,
            )
        }
    }
}

@Composable
private fun AboutContent() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.yarn_about_title),
            style = MaterialTheme.typography.displayMedium.copy(fontFamily = EditorialSerif),
            color = Espresso,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.yarn_about_lede),
            style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.2.em, fontWeight = FontWeight.Bold),
            color = Cta,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.yarn_about_body),
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
                text = stringResource(R.string.yarn_about_note),
                style = MaterialTheme.typography.bodyMedium,
                color = Espresso,
                textAlign = TextAlign.Center,
            )
        }
        Spacer(Modifier.height(20.dp))
        Text(
            text = stringResource(R.string.yarn_about_outro),
            style = MaterialTheme.typography.bodyMedium,
            color = Walnut,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun TabLabel(text: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall.copy(
            letterSpacing = 0.1.em,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        ),
        color = if (selected) Espresso else Walnut,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    )
}
