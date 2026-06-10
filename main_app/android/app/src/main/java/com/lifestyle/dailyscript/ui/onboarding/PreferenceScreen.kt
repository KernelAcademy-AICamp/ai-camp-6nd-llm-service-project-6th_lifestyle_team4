package com.lifestyle.dailyscript.ui.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.lifestyle.dailyscript.ui.components.BrandWordmark
import com.lifestyle.dailyscript.ui.theme.CardWarm
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.EditorialSerif
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Highlight
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Sand
import com.lifestyle.dailyscript.ui.theme.Walnut

/**
 * 선호도 온보딩 — 사용법 코치 투어 직전 1회 노출 (PWA preferences.js + #pref-screen 이식).
 *   STEP 1) 읽고 싶은 장르 (복수 선택)
 *   STEP 2) 관심 가는 주제 (복수 선택 + "상관없음")
 * 완료/건너뛰기 시 [onFinish]로 결과 전달. 저장·게이팅은 호출 측(DailyScriptRoot)이 담당.
 */
data class PrefFlowResult(
    val genres: List<String>,
    val themes: List<String>,
    val any: Boolean,
    val skipped: Boolean,
)

// PWA preferences.js GENRES — format 값은 works.format / users.pref_genres 저장값.
private data class PrefGenre(val ko: String, val en: String, val format: String, val full: Boolean = false)

private val GENRES = listOf(
    PrefGenre("소설", "Novel", "novel"),
    PrefGenre("연극(희곡)", "Play", "play"),
    PrefGenre("에세이", "Essay", "essay"),
    PrefGenre("오페라(대본)", "Opera", "opera"),
    PrefGenre("산문", "Prose", "prose", full = true),
)

// PWA preferences.js THEMES — ko 는 users.pref_themes 저장값(분류기 범주명과 동일해야 함).
private data class PrefTheme(val ko: String, val kw: String, val color: Color)

private val THEMES = listOf(
    PrefTheme("관계·사랑", "사랑 · 연애 · 가족 · 우정", Color(0xFFC75D4A)),
    PrefTheme("상실·애도", "죽음 · 이별 · 그리움 · 애도", Color(0xFF5E6B7A)),
    PrefTheme("자기·정체성", "자아 · 성장 · 자존 · 양심", Color(0xFFB98A3E)),
    PrefTheme("결단·행동", "결심 · 선택 · 복수 · 저항", Color(0xFFA64238)),
    PrefTheme("세계관·환멸", "권력 · 사회 · 운명 · 진실", Color(0xFF4A5240)),
    PrefTheme("욕망·집착", "욕망 · 유혹 · 소유 · 야망", Color(0xFF8E3B52)),
    PrefTheme("시간·기억", "시간 · 기억 · 추억 · 회상", Color(0xFF6E7B86)),
    PrefTheme("희망·구원", "희망 · 구원 · 믿음 · 치유", Color(0xFFC99A2E)),
    PrefTheme("삶·일상", "삶 · 노동 · 생계 · 생존", Color(0xFF7A6A52)),
    PrefTheme("정서 상태", "불안 · 분노 · 공허 · 권태", Color(0xFF88736B)),
)

// 화면 회전/프로세스 재생성에도 선택을 보존 (PWA는 SPA라 상태가 살아있음 — 동등 보장).
private val StringSetSaver = listSaver<Set<String>, String>(
    save = { it.toList() },
    restore = { it.toSet() },
)

@Composable
fun PreferenceOverlay(onFinish: (PrefFlowResult) -> Unit) {
    var step by rememberSaveable { mutableStateOf(1) }
    var genres by rememberSaveable(stateSaver = StringSetSaver) { mutableStateOf(setOf<String>()) }
    var themes by rememberSaveable(stateSaver = StringSetSaver) { mutableStateOf(setOf<String>()) }
    var any by rememberSaveable { mutableStateOf(false) }

    // 뒤로가기: 2단계 → 1단계, 1단계에선 소비(온보딩은 닫기 없음 — 건너뛰기만 가능).
    BackHandler { if (step == 2) step = 1 }

    val scrollState = rememberScrollState()
    LaunchedEffect(step) { scrollState.scrollTo(0) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Paper)
            .pointerInput(Unit) { detectTapGestures { } }, // 아래 화면으로 터치 통과 방지
    ) {
        Column(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
            // 상단 — 워드마크 + 건너뛰기 (= 전체 주제 폭넓게, 이후 다시 묻지 않음)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BrandWordmark()
                Text(
                    text = "건너뛰기",
                    fontSize = 13.sp,
                    color = Walnut,
                    modifier = Modifier.clickable {
                        onFinish(PrefFlowResult(genres.toList(), emptyList(), any = true, skipped = true))
                    },
                )
            }

            // 진행 세그먼트 2개
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ProgressSegment(filled = step >= 1)
                ProgressSegment(filled = step >= 2)
            }

            // 본문 (스크롤)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState)
                    .padding(start = 24.dp, end = 24.dp, top = 6.dp, bottom = 24.dp),
            ) {
                AnimatedContent(
                    targetState = step,
                    transitionSpec = {
                        (fadeIn(tween(420)) + slideInVertically(tween(420)) { it / 20 }) togetherWith fadeOut(tween(150))
                    },
                    label = "pref-step",
                ) { s ->
                    if (s == 1) {
                        Column {
                            StepHead(
                                num = "STEP 1 / 2",
                                title = "어떤 글을 즐겨 읽으세요?",
                                desc = "읽고 싶은 장르를 골라주세요. 선택한 장르의 명대사를 더 자주 만나게 돼요.",
                            )
                            GenreGrid(selected = genres, onToggle = { fmt ->
                                genres = if (fmt in genres) genres - fmt else genres + fmt
                            })
                        }
                    } else {
                        Column {
                            StepHead(
                                num = "STEP 2 / 2",
                                title = "어떤 이야기에 마음이 가나요?",
                                desc = "관심 가는 주제를 골라주세요.",
                            )
                            ThemeList(
                                selected = themes,
                                muted = any,
                                onToggle = { ko ->
                                    themes = if (ko in themes) themes - ko else themes + ko
                                },
                            )
                            AnyButton(selected = any, onClick = {
                                any = !any
                                if (any) themes = emptySet()
                            })
                        }
                    }
                }
            }

            // 푸터 — 안내문 + CTA (+ 2단계 이전 버튼)
            Column(modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 14.dp, bottom = 22.dp)) {
                val info = if (step == 1) {
                    if (genres.isEmpty()) "장르를 1개 이상 골라주세요" else "${genres.size}개 장르 선택됨"
                } else {
                    when {
                        any -> "모든 주제에서 추천받아요"
                        themes.isNotEmpty() -> "${themes.size}개 주제 선택됨"
                        else -> "주제를 고르거나 '상관없음'을 눌러주세요"
                    }
                }
                Text(
                    text = info,
                    fontSize = 11.5.sp,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                )
                Button(
                    onClick = {
                        if (step == 1) step = 2
                        else onFinish(PrefFlowResult(genres.toList(), themes.toList(), any = any, skipped = false))
                    },
                    enabled = if (step == 1) genres.isNotEmpty() else (themes.isNotEmpty() || any),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Cta,
                        contentColor = Color.White,
                        disabledContainerColor = Sand.copy(alpha = 0.7f),
                        disabledContentColor = Color.White,
                    ),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = if (step == 1) "다음" else "내 추천 받기",
                        fontSize = 14.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.04.em,
                    )
                }
                if (step == 2) {
                    Text(
                        text = "← 이전",
                        fontSize = 13.sp,
                        color = Walnut,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 2.dp)
                            .clickable { step = 1 }
                            .padding(12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RowScope.ProgressSegment(filled: Boolean) {
    val fraction by animateFloatAsState(if (filled) 1f else 0f, tween(450), label = "pref-seg")
    Box(
        modifier = Modifier
            .weight(1f)
            .height(3.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(Latte),
    ) {
        if (fraction > 0f) {
            Box(modifier = Modifier.fillMaxWidth(fraction).height(3.dp).background(Cta))
        }
    }
}

@Composable
private fun StepHead(num: String, title: String, desc: String) {
    Column(modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)) {
        Text(
            text = num,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.22.em,
            color = Cta,
        )
        Text(
            text = title,
            style = TextStyle(fontFamily = EditorialSerif, fontSize = 24.sp, lineHeight = 32.sp),
            color = Espresso,
            modifier = Modifier.padding(vertical = 8.dp),
        )
        Text(text = desc, fontSize = 13.sp, lineHeight = 21.sp, color = Walnut)
        Text(text = "복수 선택 가능", fontSize = 11.5.sp, color = Sand, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun GenreGrid(selected: Set<String>, onToggle: (String) -> Unit) {
    Column(
        modifier = Modifier.padding(top = 18.dp),
        verticalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        val half = GENRES.filter { !it.full }
        half.chunked(2).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                rowItems.forEach { g ->
                    GenreTile(g, g.format in selected, onToggle, modifier = Modifier.weight(1f))
                }
                if (rowItems.size == 1) Box(modifier = Modifier.weight(1f))
            }
        }
        GENRES.filter { it.full }.forEach { g ->
            GenreTile(g, g.format in selected, onToggle, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun GenreTile(
    genre: PrefGenre,
    selected: Boolean,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(if (selected) Cta.copy(alpha = 0.08f) else CardWarm)
            .border(1.dp, if (selected) Cta else Latte, RoundedCornerShape(16.dp))
            .clickable { onToggle(genre.format) }
            .padding(horizontal = 15.dp, vertical = 16.dp),
    ) {
        // 체크 원(우상단)과 라벨이 겹치지 않게 텍스트 영역 오른쪽을 비워둔다.
        Column(modifier = Modifier.padding(end = 24.dp)) {
            Text(
                text = genre.ko,
                style = TextStyle(fontFamily = EditorialSerif, fontSize = 18.sp),
                color = Espresso,
            )
            Text(
                text = genre.en.uppercase(),
                fontSize = 10.sp,
                letterSpacing = 0.16.em,
                color = Sand,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        CheckCircle(selected = selected, size = 21.dp, modifier = Modifier.align(Alignment.TopEnd))
    }
}

@Composable
private fun ThemeList(selected: Set<String>, muted: Boolean, onToggle: (String) -> Unit) {
    Column(
        // "상관없음" 선택 중엔 흐리게 + 클릭 차단 (PWA .pf-themes.muted — pointer-events:none)
        modifier = Modifier.padding(top = 18.dp).alpha(if (muted) 0.4f else 1f),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        THEMES.forEach { t ->
            val isSel = t.ko in selected
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isSel) Cta.copy(alpha = 0.08f) else CardWarm)
                    .border(1.dp, if (isSel) Cta else Latte, RoundedCornerShape(14.dp))
                    .clickable(enabled = !muted) { onToggle(t.ko) }
                    .padding(horizontal = 15.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                Box(
                    modifier = Modifier
                        .width(9.dp)
                        .height(42.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(t.color),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = t.ko,
                        style = TextStyle(fontFamily = EditorialSerif, fontSize = 16.5.sp),
                        color = Espresso,
                    )
                    Text(
                        text = t.kw,
                        fontSize = 11.5.sp,
                        color = Walnut,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
                CheckCircle(selected = isSel, size = 20.dp)
            }
        }
    }
}

@Composable
private fun AnyButton(selected: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.padding(top = 14.dp)) {
        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Latte))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 14.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (selected) Espresso else Color.Transparent)
                .border(1.5.dp, if (selected) Espresso else Latte, RoundedCornerShape(14.dp))
                .clickable { onClick() }
                .padding(horizontal = 16.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text(
                    text = "아직 잘 모르겠어요",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (selected) Paper else Espresso,
                )
                Text(
                    text = "모든 주제에서 폭넓게 추천받기",
                    fontSize = 11.5.sp,
                    color = if (selected) Sand else Walnut,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            if (selected) {
                Box(
                    modifier = Modifier.size(20.dp).clip(CircleShape).background(Highlight),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "✓", fontSize = 11.sp, color = Espresso)
                }
            } else {
                Box(modifier = Modifier.size(20.dp).clip(CircleShape).border(1.5.dp, Sand, CircleShape))
            }
        }
    }
}

@Composable
private fun CheckCircle(selected: Boolean, size: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier) {
    if (selected) {
        Box(
            modifier = modifier.size(size).clip(CircleShape).background(Cta),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = "✓", fontSize = 12.sp, color = Color.White)
        }
    } else {
        Box(modifier = modifier.size(size).clip(CircleShape).border(1.5.dp, Sand, CircleShape))
    }
}
