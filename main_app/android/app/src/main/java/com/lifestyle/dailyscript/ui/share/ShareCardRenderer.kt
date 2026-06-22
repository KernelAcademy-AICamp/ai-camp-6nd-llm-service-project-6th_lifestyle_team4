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
import kotlin.math.max

/**
 * PWA renderShareCard (m-app.js:8295) 이식 — 명대사 카드를 9:16 비트맵에 그린다.
 * 좌표/크기는 PWA 기준 540×960 의 값을 s = W/540f 로 스케일(본 카드 1080×1920 → s=2).
 * baseline 'top' 흉내: drawText y 에 -ascent 를 더한다(Canvas 는 alphabetic baseline).
 */
class ShareCardRenderer(context: Context) {

    private val appCtx = context.applicationContext
    private val serif: Typeface by lazy { ResourcesCompat.getFont(appCtx, R.font.nanum_myeongjo) ?: Typeface.SERIF }

    /** 이미지 배경 디코드 캐시 — assets/ 경로별 1회만 디코드(썸네일/미리보기/최종이 공유). */
    private val assetCache = HashMap<String, Bitmap?>()

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

    /** 배경 그리기 — 절차적이면 paint(), 이미지면 에셋을 cover 로 채운다. 글자 잉크색 반환. */
    private fun paintBackground(canvas: Canvas, bg: ShareBackground, w: Int, h: Int, seed: Long): Int {
        bg.paint?.let { return it(canvas, w, h, seed) }
        val src = bg.assetPath?.let { loadAsset(it) }
        if (src != null) {
            drawCover(canvas, src, w, h)
        } else {
            // 이미지 미배치/디코드 실패 — 투명 대신 종이톤으로 채워 빈 칸 방지.
            canvas.drawColor(0xFFEDE7DA.toInt())
        }
        return bg.ink
    }

    private fun loadAsset(path: String): Bitmap? = assetCache.getOrPut(path) {
        runCatching { appCtx.assets.open(path).use { BitmapFactory.decodeStream(it) } }.getOrNull()
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

    /** PWA wrapText — \n 분할 후 글자 단위 누적 measureText (한글엔 공백이 없어 char-wrap 필수). */
    private fun wrapText(paint: Paint, text: String, maxWidth: Float): List<String> {
        val out = ArrayList<String>()
        for (para in text.split("\n")) {
            if (para.isBlank()) { out.add(""); continue }
            val cur = StringBuilder()
            for (ch in para) {
                val test = cur.toString() + ch
                if (paint.measureText(test) > maxWidth && cur.isNotEmpty()) {
                    out.add(cur.toString()); cur.setLength(0); cur.append(ch)
                } else {
                    cur.append(ch)
                }
            }
            if (cur.isNotEmpty()) out.add(cur.toString())
        }
        return out
    }

    companion object {
        const val W = 1080
        const val H = 1920
    }
}
