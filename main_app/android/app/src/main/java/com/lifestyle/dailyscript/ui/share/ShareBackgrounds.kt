package com.lifestyle.dailyscript.ui.share

import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import com.lifestyle.dailyscript.data.model.ShareBackgroundDto
import java.util.Random

/**
 * 공유 카드 배경 — PWA SHARE_BACKGROUNDS (m-app.js:8223) 이식.
 * 8종 전부 free(이미지 에셋 없이 절차적 그림). Premium/Royal 은 PWA 도 아직 빈 placeholder.
 *
 * paint 함수는 PWA 기준 캔버스(540×960)의 절대 좌표를 s = W/540f 로 스케일해
 * 썸네일(소형)과 본 카드(1080×1920)에서 같은 비율로 그려진다. ink 색(불투명 ARGB)을 반환.
 */
enum class ShareTier { Free, Premium, Royal }

data class ShareBackground(
    val id: String,
    val name: String,
    val tier: ShareTier,
    val price: Int = 0,
    /** 로컬 이미지 배경(프리미엄/로얄) — assets/ 경로. 절차적·원격 이미지면 null. 원격 로드 실패 시 폴백. */
    val assetPath: String? = null,
    /** 원격 이미지 배경(프리미엄/로얄) — share_backgrounds 의 Supabase Storage 공개 URL. */
    val imageUrl: String? = null,
    /** 책 제목 우선정렬 타깃(없으면 name 으로 매칭). DB 카드지에서 채워진다. */
    val workTitle: String? = null,
    /**
     * 이미지 배경 위에 그릴 글자색(ARGB, 명대사·화자·작품). 기본은 어두운 에스프레소.
     * 배경 이미지가 어두우면 밝게(예: 0xFFFAF8F2.toInt())로 바꿔야 글자가 보인다.
     */
    val ink: Int = 0xFF3B2A1A.toInt(),
    /** 절차적 배경(무료 8종) — 캔버스에 직접 그리고 잉크색 반환. 이미지 배경이면 null. */
    val paint: ((canvas: Canvas, w: Int, h: Int, seed: Long) -> Int)? = null,
)

/** ink 색에 알파 바이트만 입힌 ARGB (PWA 의 ink+'40' 같은 8자리 hex 대응). */
internal fun withAlpha(color: Int, alpha: Int): Int = (alpha shl 24) or (color and 0x00FFFFFF)

/** 세로 그라데이션 편지지 + 점선 안쪽 테두리 (PWA paintLetter). ink 반환. */
private fun paintLetter(c: Canvas, w: Int, h: Int, topHex: String, botHex: String, inkHex: String): Int {
    val s = w / 540f
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = LinearGradient(
            0f, 0f, 0f, h.toFloat(),
            AndroidColor.parseColor(topHex), AndroidColor.parseColor(botHex), Shader.TileMode.CLAMP,
        )
    }
    c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), fill)
    val ink = AndroidColor.parseColor(inkHex)
    val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * s
        color = withAlpha(ink, 0x40)
        pathEffect = DashPathEffect(floatArrayOf(6f * s, 8f * s), 0f)
    }
    val inset = 36f * s
    c.drawRect(inset, inset, w - inset, h - inset, border)
    return ink
}

/** 양피지 — 방사형 그라데이션 + 노이즈 점 + 실선 테두리 (PWA paintParchment). */
private fun paintParchment(c: Canvas, w: Int, h: Int, seed: Long): Int {
    val s = w / 540f
    val ink = AndroidColor.parseColor("#3A2614")
    val light = AndroidColor.parseColor("#F0E0BB")
    val dark = AndroidColor.parseColor("#C9A872")
    // PWA: createRadialGradient(W/2,H/2, W*0.2, W/2,H/2, W*0.85). Android RadialGradient 엔 내부 반경이
    // 없어 첫 stop 을 0.2/0.85≈0.235 plateau 로 근사.
    val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = RadialGradient(
            w / 2f, h / 2f, w * 0.85f,
            intArrayOf(light, light, dark), floatArrayOf(0f, 0.235f, 1f), Shader.TileMode.CLAMP,
        )
    }
    c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), fill)
    // 종이 결 노이즈 — 썸네일/재구성 시 깜빡임 방지를 위해 cardId 로 시드(PWA 는 매번 랜덤).
    val rnd = Random(seed)
    val dot = Paint()
    val dotSize = 2f * s
    repeat(1400) {
        val x = rnd.nextFloat() * w
        val y = rnd.nextFloat() * h
        val a = (rnd.nextFloat() * 0.06f * 255).toInt()
        dot.color = withAlpha(0x3A2614, a)
        c.drawRect(x, y, x + dotSize, y + dotSize, dot)
    }
    val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f * s
        color = withAlpha(ink, 0x50)
    }
    val inset = 40f * s
    c.drawRect(inset, inset, w - inset, h - inset, border)
    return ink
}

/**
 * 무료 8종 (전부 절차적 그림 — 코드에 남는다). PWA SHARE_BACKGROUNDS 와 패리티.
 * Premium 999🧶 / Royal 2999🧶 는 더 이상 여기 하드코딩하지 않는다 — share_backgrounds 테이블에서
 * 원격으로 받아(ShareRepository.listBackgrounds → toShareBackground) 이 리스트 뒤에 합쳐진다.
 */
val SHARE_BACKGROUNDS: List<ShareBackground> = listOf(
    ShareBackground("beige", "크림 편지지", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#F4ECDB", "#E0D5BC", "#3B2A1A") },
    ShareBackground("rose", "로즈 편지지", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#FAEAE2", "#E6C9BD", "#4A2A24") },
    ShareBackground("mint", "민트 편지지", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#E8F1E4", "#C6D6BF", "#2B3B2A") },
    ShareBackground("sky", "스카이 편지지", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#E4ECF5", "#C0CDDC", "#2A344A") },
    ShareBackground("parchment", "양피지", ShareTier.Free) { c, w, h, seed -> paintParchment(c, w, h, seed) },
    ShareBackground("kraft", "크라프트", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#C8A876", "#A88858", "#1F140A") },
    ShareBackground("midnight", "미드나잇", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#1B2436", "#0E1626", "#F4ECDB") },
    ShareBackground("rosegold", "로즈골드", ShareTier.Free) { c, w, h, _ -> paintLetter(c, w, h, "#E8C9B7", "#C9A88E", "#3A1F18") },
)

/** tier 문자열("premium"/"royal") → 열거형. 알 수 없으면 Free. */
fun shareTierFromString(s: String): ShareTier = when (s.trim().lowercase()) {
    "royal" -> ShareTier.Royal
    "premium" -> ShareTier.Premium
    else -> ShareTier.Free
}

/** "#RRGGBB" → 불투명 ARGB Int. 파싱 실패 시 기본 에스프레소(#3B2A1A). */
fun parseInkHex(hex: String?): Int = runCatching {
    (0xFF shl 24) or (AndroidColor.parseColor(hex) and 0x00FFFFFF)
}.getOrDefault(0xFF3B2A1A.toInt())

/**
 * 시드 4종(premium_1/2·royal_1/2)은 APK 에 번들 PNG 가 있어 원격 로드 실패(오프라인/타임아웃) 시
 * 폴백으로 쓴다. 그 외 slug 는 번들이 없으므로 null → 원격만 사용.
 */
private val BUNDLED_SHARE_ASSETS: Map<String, String> = mapOf(
    "premium_1" to "share-premium/premium_1.png",
    "premium_2" to "share-premium/premium_2.png",
    "royal_1" to "share-royal/royal_1.png",
    "royal_2" to "share-royal/royal_2.png",
)

/** DB 행(ShareBackgroundDto) → 런타임 카드지. 원격 이미지 배경이므로 paint=null, imageUrl 채움. */
fun ShareBackgroundDto.toShareBackground(): ShareBackground = ShareBackground(
    id = slug,
    name = name,
    tier = shareTierFromString(tier),
    price = price,
    assetPath = BUNDLED_SHARE_ASSETS[slug],   // 시드 4종은 원격 실패 시 번들 PNG 폴백
    imageUrl = imageUrl,
    workTitle = workTitle,
    ink = parseInkHex(ink),
)
