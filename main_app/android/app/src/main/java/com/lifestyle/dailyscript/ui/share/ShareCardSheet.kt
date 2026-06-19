package com.lifestyle.dailyscript.ui.share

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.lifestyle.dailyscript.ui.theme.Cta
import com.lifestyle.dailyscript.ui.theme.Espresso
import com.lifestyle.dailyscript.ui.theme.Latte
import com.lifestyle.dailyscript.ui.theme.Paper
import com.lifestyle.dailyscript.ui.theme.Walnut
import com.lifestyle.dailyscript.ui.yarn.SpendResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 공유 시트 탭 — PWA Free / Premium·999🧶 / Royal·2999🧶 패리티. */
private data class ShareTab(val tier: ShareTier, val label: String)

private val SHARE_TABS = listOf(
    ShareTab(ShareTier.Free, "Free"),
    ShareTab(ShareTier.Premium, "Premium · 999🧶"),
    ShareTab(ShareTier.Royal, "Royal · 2999🧶"),
)

/** PWA normalizeWorkTitle 흉내 — 영문 관사 제거 + 공백·구두점 무시(한/영/숫자만). 카드지↔책 제목 매칭용. */
private fun normalizeWorkTitle(s: String?): String {
    if (s.isNullOrBlank()) return ""
    var t = s.trim().lowercase()
    t = t.removePrefix("the ").removePrefix("a ").removePrefix("an ")
    return t.filter { it.isLetterOrDigit() }
}

/**
 * 명대사 공유 카드 시트 (PWA #share-modal 이식) — 카드 펼치기(미리보기 토글) + Free/Premium/Royal 탭 +
 * 배경 그리드 + 다운로드/카카오톡/공유하기.
 *
 * - Premium/Royal 은 PWA 와 동일하게 아직 배경 이미지가 없어 '곧 만나요' 빈 상태(구매·잠금해제 미연결).
 * - 미리보기는 540×960, 썸네일은 144×256 으로 백그라운드 스레드 렌더 후 캐시. 최종 저장/공유만 1080×1920.
 * - 다운로드/카카오톡/공유하기 성공 시 [onShared] 1회 호출 → HomeViewModel 이 공유수 +1 & RPC 담당.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareCardSheet(
    payload: ShareCardPayload,
    onDismiss: () -> Unit,
    onShared: () -> Unit,
    yarnBalance: Int = 0,
    purchasedIds: Set<String> = emptySet(),
    onBuy: suspend (ShareBackground) -> SpendResult = { SpendResult.ERROR },
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val renderer = remember { ShareCardRenderer(context) }

    var selectedTier by remember { mutableStateOf(ShareTier.Free) }
    var selectedBg by remember { mutableStateOf(SHARE_BACKGROUNDS.first()) }
    var previewExpanded by remember { mutableStateOf(false) }
    var preview by remember { mutableStateOf<Bitmap?>(null) }
    var busy by remember { mutableStateOf(false) }
    var pendingBuy by remember { mutableStateOf<ShareBackground?>(null) }  // 구매 확인 다이얼로그 대상
    val thumbCache = remember { mutableStateMapOf<String, Bitmap>() }

    // 미리보기 — 펼쳤을 때만, 배경 바뀔 때마다 백그라운드 스레드에서 540×960 렌더.
    LaunchedEffect(previewExpanded, selectedBg, payload.cardId) {
        if (previewExpanded) {
            preview = withContext(Dispatchers.Default) { renderer.render(selectedBg, payload, 540, 960) }
        }
    }

    // 최종(풀 해상도) 비트맵.
    suspend fun finalBitmap(): Bitmap = withContext(Dispatchers.Default) { renderer.render(selectedBg, payload) }

    fun runSave() {
        scope.launch {
            busy = true
            val ok = saveToGallery(context, finalBitmap())
            Toast.makeText(context, if (ok) "갤러리에 저장됐어요" else "저장에 실패했어요", Toast.LENGTH_SHORT).show()
            if (ok) onShared()
            busy = false
        }
    }

    // API 26–28 만 WRITE_EXTERNAL_STORAGE 필요(saveToGallery 의 public Pictures 경로). API29+ 는 불필요.
    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) runSave() else Toast.makeText(context, "저장 권한이 필요해요", Toast.LENGTH_SHORT).show()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = Paper) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                text = "공유 카드",
                style = MaterialTheme.typography.headlineSmall,
                color = Espresso,
                modifier = Modifier.fillMaxWidth(),
            )
            Box(modifier = Modifier.height(12.dp))

            // 미리보기 토글 — 기본 접힘.
            Box(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .border(1.dp, Latte, RoundedCornerShape(18.dp))
                    .clickable { previewExpanded = !previewExpanded }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(
                    text = if (previewExpanded) "접기" else "카드 펼치기",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.04.em),
                    color = Espresso,
                )
            }

            if (previewExpanded) {
                Box(modifier = Modifier.height(12.dp))
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .height(340.dp)
                        .aspectRatio(9f / 16f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(Latte),
                    contentAlignment = Alignment.Center,
                ) {
                    preview?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
            }
            Box(modifier = Modifier.height(16.dp))

            // 탭 — Free / Premium·999🧶 / Royal·2999🧶.
            Row(modifier = Modifier.fillMaxWidth()) {
                SHARE_TABS.forEach { tab ->
                    val active = tab.tier == selectedTier
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { selectedTier = tab.tier }
                            .padding(bottom = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = tab.label,
                                style = MaterialTheme.typography.labelLarge.copy(
                                    fontSize = 13.sp,
                                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                ),
                                color = if (active) Espresso else Walnut,
                                maxLines = 1,
                            )
                            Box(modifier = Modifier.height(8.dp))
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(2.dp)
                                    .background(if (active) Espresso else Color.Transparent),
                            )
                        }
                    }
                }
            }
            Box(modifier = Modifier.fillMaxWidth().height(0.5.dp).background(Latte))
            Box(modifier = Modifier.height(14.dp))

            // 배경 그리드(4열) 또는 빈 상태. Premium/Royal 은 PWA 처럼 카드지 name(=책 제목)이
            // 공유 카드의 책 제목과 같은 것을 맨 앞으로 정렬(normalizeWorkTitle 비교).
            val items = remember(selectedTier, payload.work) {
                val base = SHARE_BACKGROUNDS.filter { it.tier == selectedTier }
                val target = normalizeWorkTitle(payload.work)
                if (selectedTier == ShareTier.Free || target.isEmpty()) base
                else base.sortedByDescending { if (normalizeWorkTitle(it.name) == target) 1 else 0 }
            }
            if (items.isEmpty()) {
                Text(
                    text = "곧 만나요 ✨\n새 배경을 준비하고 있어요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Walnut,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 36.dp),
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items.chunked(4).forEach { rowItems ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            rowItems.forEach { bg ->
                                val locked = bg.tier != ShareTier.Free && bg.id !in purchasedIds
                                ShareBgCell(
                                    bg = bg,
                                    selected = bg.id == selectedBg.id,
                                    locked = locked,
                                    thumb = thumbCache[bg.id],
                                    modifier = Modifier.weight(1f),
                                    requestThumb = {
                                        if (thumbCache[bg.id] == null) {
                                            thumbCache[bg.id] = withContext(Dispatchers.Default) {
                                                renderer.renderBackground(bg, 144, 256, payload.cardId)
                                            }
                                        }
                                    },
                                    // 잠긴 카드지 탭 → 구매 확인 다이얼로그. 보유/무료면 바로 선택.
                                    onClick = { if (locked) pendingBuy = bg else selectedBg = bg },
                                )
                            }
                            repeat(4 - rowItems.size) { Box(modifier = Modifier.weight(1f)) }
                        }
                    }
                }
            }
            Box(modifier = Modifier.height(20.dp))

            // 액션 — 다운로드 / 카카오톡 / 공유하기.
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SheetActionButton(
                    label = if (busy) "처리 중⋯" else "다운로드",
                    container = Color.Transparent,
                    content = Espresso,
                    outline = true,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                ) {
                    val needPerm = Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
                        ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
                        PackageManager.PERMISSION_GRANTED
                    if (needPerm) permLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE) else runSave()
                }
                SheetActionButton(
                    label = "카카오톡",
                    container = Color(0xFFFEE500),
                    content = Color(0xFF191919),
                    outline = false,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                ) {
                    scope.launch {
                        busy = true
                        val ok = shareCardToKakao(context, finalBitmap(), payload)
                        if (ok) {
                            onShared()
                            onDismiss()
                        } else {
                            Toast.makeText(context, "카카오톡이 설치되어 있지 않아요", Toast.LENGTH_SHORT).show()
                        }
                        busy = false
                    }
                }
                SheetActionButton(
                    label = "공유하기",
                    container = Espresso,
                    content = Paper,
                    outline = false,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                ) {
                    scope.launch {
                        busy = true
                        shareCard(context, finalBitmap(), payload)
                        onShared()
                        busy = false
                        onDismiss()
                    }
                }
            }
        }
    }

    // 카드지 구매 확인 — 잠긴 카드지 탭 시. 실타래 차감(onBuy)→성공이면 선택+잠금 해제.
    pendingBuy?.let { bg ->
        val tierName = if (bg.tier == ShareTier.Royal) "Royal" else "Premium"
        AlertDialog(
            onDismissRequest = { pendingBuy = null },
            confirmButton = {
                TextButton(onClick = {
                    pendingBuy = null
                    scope.launch {
                        when (onBuy(bg)) {
                            SpendResult.SUCCESS -> {
                                selectedBg = bg
                                Toast.makeText(context, "${bg.name} 잠금 해제!", Toast.LENGTH_SHORT).show()
                            }
                            SpendResult.INSUFFICIENT ->
                                Toast.makeText(context, "실타래가 부족해요 (보유 ${yarnBalance}개)", Toast.LENGTH_SHORT).show()
                            SpendResult.ERROR ->
                                Toast.makeText(context, "구매에 실패했어요. 잠시 후 다시 시도해 주세요.", Toast.LENGTH_SHORT).show()
                        }
                    }
                }) { Text("구매", color = Cta) }
            },
            dismissButton = {
                TextButton(onClick = { pendingBuy = null }) { Text("취소", color = Walnut) }
            },
            title = { Text("$tierName 카드지 구매", color = Espresso) },
            text = {
                Text(
                    text = "이 배경을 실타래 ${bg.price}개로 잠금 해제할까요?\n보유 실타래 ${yarnBalance}개",
                    color = Walnut,
                )
            },
            containerColor = Paper,
        )
    }
}

/**
 * 배경 썸네일 셀 — 9:16. 선택 시 코랄 테두리. [locked](미보유 유료 티어)면 자물쇠+가격 오버레이를 덮고
 * 선택 테두리를 숨긴다(탭하면 호출측이 구매 확인 다이얼로그를 띄움).
 */
@Composable
private fun ShareBgCell(
    bg: ShareBackground,
    selected: Boolean,
    locked: Boolean,
    thumb: Bitmap?,
    modifier: Modifier = Modifier,
    requestThumb: suspend () -> Unit,
    onClick: () -> Unit,
) {
    LaunchedEffect(bg.id) { requestThumb() }
    Column(modifier = modifier.clickable(onClick = onClick), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(6.dp))
                .border(2.dp, if (selected && !locked) Cta else Color.Transparent, RoundedCornerShape(6.dp)),
        ) {
            thumb?.let {
                Image(
                    bitmap = it.asImageBitmap(),
                    contentDescription = bg.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            if (locked) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.42f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Outlined.Lock,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = "${bg.price}🧶",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold),
                            color = Color.White,
                        )
                    }
                }
            }
        }
        Box(modifier = Modifier.height(4.dp))
        Text(
            text = bg.name,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            color = Espresso,
            maxLines = 1,
            textAlign = TextAlign.Center,
        )
    }
}

/** 시트 하단 액션 버튼 — SharpButton 과 같은 8dp 모서리/52dp 높이, 색만 커스텀(카카오 노랑 등). */
@Composable
private fun SheetActionButton(
    label: String,
    container: Color,
    content: Color,
    outline: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .height(52.dp)
            .background(if (outline) Color.Transparent else container, shape)
            .then(if (outline) Modifier.border(1.dp, Walnut, shape) else Modifier)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = content,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = 0.03.em),
            maxLines = 1,
        )
    }
}
