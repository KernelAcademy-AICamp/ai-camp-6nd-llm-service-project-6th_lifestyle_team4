package com.lifestyle.dailyscript.ui.share

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.content.res.ResourcesCompat
import com.lifestyle.dailyscript.R
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.max

/**
 * PWA renderShareCard (m-app.js:8295) 이식 — 명대사 카드를 9:16 비트맵에 그린다.
 * 좌표/크기는 PWA 기준 540×960 의 값을 s = W/540f 로 스케일(본 카드 1080×1920 → s=2).
 * baseline 'top' 흉내: drawText y 에 -ascent 를 더한다(Canvas 는 alphabetic baseline).
 */
class ShareCardRenderer(context: Context) {

    private val appCtx = context.applicationContext
    private val serif: Typeface by lazy { ResourcesCompat.getFont(appCtx, R.font.nanum_myeongjo) ?: Typeface.SERIF }

    // 디코드 캐시 — 성공만 캐시(일시 실패는 다음 렌더에 재시도). 썸네일 그리드는 셀마다
    // Dispatchers.Default 로 동시 렌더되어 같은 renderer 의 캐시에 동시 접근하므로 ConcurrentHashMap 필수.
    /** assets/ 경로별 디코드 캐시. */
    private val assetCache = ConcurrentHashMap<String, Bitmap>()
    /** 원격 이미지(Storage URL)별 디코드 캐시. */
    private val urlCache = ConcurrentHashMap<String, Bitmap>()

    /** 배경만 그린 비트맵 — 선택 그리드 썸네일용(텍스트 없음). */
    fun renderBackground(bg: ShareBackground, width: Int, height: Int, seed: Long): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        paintBackground(Canvas(bmp), bg, width, height, seed)
        return bmp
    }

    /** 배경 + 텍스트 전체 카드. 기본 1080×1920. */
    fun render(bg: ShareBackground, payload: ShareCardPayload, width: Int = W, height: Int = H): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val ink = paintBackground(canvas, bg, width, height, payload.cardId)
        drawText(canvas, payload, ink, width, height)
        return bmp
    }

    /** 배경 그리기 — 절차적이면 paint(), 이미지면 원격(Storage URL)→번들 에셋 순으로 cover. 글자 잉크색 반환. */
    private fun paintBackground(canvas: Canvas, bg: ShareBackground, w: Int, h: Int, seed: Long): Int {
        bg.paint?.let { return it(canvas, w, h, seed) }
        // 원격 우선 → 실패하면 번들 에셋(구버전/오프라인 호환) → 그래도 없으면 종이톤(빈 칸 방지).
        val src = bg.imageUrl?.let { loadRemote(it) } ?: bg.assetPath?.let { loadAsset(it) }
        if (src != null) {
            drawCover(canvas, src, w, h)
        } else {
            canvas.drawColor(0xFFEDE7DA.toInt())
        }
        return bg.ink
    }

    private fun loadAsset(path: String): Bitmap? {
        assetCache[path]?.let { return it }
        val bmp = runCatching { appCtx.assets.open(path).use { BitmapFactory.decodeStream(it) } }.getOrNull()
        if (bmp != null) assetCache[path] = bmp
        return bmp
    }

    /**
     * 원격 이미지 비트맵 — blocking GET(렌더는 Dispatchers.Default 에서 호출되므로 안전).
     * 성공만 캐시 → 일시적 네트워크 실패는 다음 렌더에 재시도. 실패하면 null(호출측이 에셋/종이톤 폴백).
     */
    private fun loadRemote(url: String): Bitmap? {
        urlCache[url]?.let { return it }
        val bmp = runCatching {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 15_000
            }
            try {
                conn.inputStream.use { BitmapFactory.decodeStream(it) }
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
        if (bmp != null) urlCache[url] = bmp
        return bmp
    }

    /** 원본을 9:16 캔버스에 cover(중앙 크롭)로 그린다. */
    private fun drawCover(canvas: Canvas, src: Bitmap, w: Int, h: Int) {
        val scale = max(w.toFloat() / src.width, h.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = (w - dw) / 2f
        val top = (h - dh) / 2f
        canvas.drawBitmap(src, null, RectF(left, top, left + dw, top + dh), Paint(Paint.FILTER_BITMAP_FLAG))
    }

    private fun drawText(c: Canvas, p: ShareCardPayload, ink: Int, w: Int, h: Int) {
        val s = w / 540f
        // 카드지 상/하단 장식을 피하는 안전 영역. 명대사+화자+메타 한 블록을 이 안에 세로 중앙 배치.
        val zoneTop = h * 0.27f
        val zoneBot = h * 0.75f
        val zoneH = zoneBot - zoneTop
        val maxW = w - 260f * s   // 좌우 장식(코너 장미 등) 여백 — 넉넉히(여백 클수록 본문 자동 줄바꿈 ↑)

        // 1) 명대사 — 명조체(정자), 폭 맞춰 줄바꿈 + 크기 점진 축소(메타 공간 위해 영역 62% 안).
        val quote = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = serif
            color = ink
            textAlign = Paint.Align.CENTER
        }
        var qLines: List<String> = emptyList()
        var qLineH = 0f
        for (fs in intArrayOf(40, 36, 32, 28, 24, 20)) {
            quote.textSize = fs * s
            qLines = wrapText(quote, p.quote, maxW)
            qLineH = fs * s * 1.6f
            if (qLines.size * qLineH <= zoneH * 0.62f) break
        }

        val speakerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = serif; textSize = 22f * s; color = withAlpha(ink, 0xCC); textAlign = Paint.Align.CENTER
        }
        val metaKoPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = serif; textSize = 19f * s; color = withAlpha(ink, 0x99); textAlign = Paint.Align.CENTER
        }
        val metaEnPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = serif; textSize = 16f * s; color = withAlpha(ink, 0x80); textAlign = Paint.Align.CENTER
        }

        val hasSpeaker = p.speaker.isNotBlank()
        val gapSpeaker = 18f * s
        val speakerLineH = 30f * s
        val gapMeta = 40f * s
        val metaKoLineH = 26f * s
        val metaEnLineH = 22f * s

        // 2) 블록 전체 높이 → 안전 영역 세로 중앙.
        var blockH = qLines.size * qLineH
        if (hasSpeaker) blockH += gapSpeaker + speakerLineH
        if (p.metaKo.isNotBlank()) blockH += gapMeta + metaKoLineH
        if (p.metaEn.isNotBlank()) blockH += metaEnLineH

        var y = zoneTop + max(0f, (zoneH - blockH) / 2f)

        // 명대사(top baseline: baseline = y - ascent)
        for (ln in qLines) { c.drawText(ln, w / 2f, y - quote.ascent(), quote); y += qLineH }
        // 화자
        if (hasSpeaker) {
            y += gapSpeaker
            c.drawText("— ${p.speaker}", w / 2f, y - speakerPaint.ascent(), speakerPaint)
            y += speakerLineH
        }
        // 메타 — 한글 / 영문 2줄
        if (p.metaKo.isNotBlank()) {
            y += gapMeta
            c.drawText(p.metaKo, w / 2f, y - metaKoPaint.ascent(), metaKoPaint)
            y += metaKoLineH
        }
        if (p.metaEn.isNotBlank()) {
            c.drawText(p.metaEn, w / 2f, y - metaEnPaint.ascent(), metaEnPaint)
        }
    }

    /**
     * PWA wrapText (m-app.js:8809) 이식 — 어절(공백) 토큰 단위 줄바꿈 + 의미 묶음(chunk).
     * 한국어 의존명사·관형사·보조용언이 줄 머리/꼬리에 단독으로 떨어지지 않도록, 1~2자 짧은 어절은
     * 다음 어절 1개를 흡수해 한 chunk 로 묶고("그 명을"·"있는 거죠"·"제 몸을"), chunk 사이에서만 줄을
     * 끊는다 → 어절 중간이 잘리지 않는다. 한 chunk 가 maxWidth 보다 넓으면 overflow(정상 텍스트엔 거의 없음).
     */
    private fun wrapText(paint: Paint, text: String, maxWidth: Float): List<String> {
        val out = ArrayList<String>()
        for (para in text.split("\n")) {
            if (para.isBlank()) { out.add(""); continue }
            val words = para.split(Regex("\\s+")).filter { it.isNotEmpty() }
            // 1) 의미 묶음 — 첫 어절이 1~2자면 다음 어절 1개만 흡수(무한정 길어짐 방지).
            val chunks = ArrayList<String>()
            var i = 0
            while (i < words.size) {
                var chunk = words[i++]
                if (chunk.length <= 2 && i < words.size) {
                    chunk += " " + words[i++]
                }
                chunks.add(chunk)
            }
            // 2) chunk 단위 wrap — 한 줄에 가능한 한 많은 chunk, chunk 사이에서만 끊김.
            var cur = ""
            for (ch in chunks) {
                if (cur.isEmpty()) { cur = ch; continue }
                val test = "$cur $ch"
                if (paint.measureText(test) <= maxWidth) {
                    cur = test
                } else {
                    out.add(cur)
                    cur = ch
                }
            }
            if (cur.isNotEmpty()) out.add(cur)
        }
        return out
    }

    companion object {
        const val W = 1080
        const val H = 1920
    }
}
