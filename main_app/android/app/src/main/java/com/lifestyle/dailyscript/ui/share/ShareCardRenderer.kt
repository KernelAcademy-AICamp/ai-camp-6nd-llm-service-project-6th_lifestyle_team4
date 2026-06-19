package com.lifestyle.dailyscript.ui.share

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import androidx.core.content.res.ResourcesCompat
import com.lifestyle.dailyscript.R
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * PWA renderShareCard (m-app.js:8295) 이식 — 명대사 카드를 9:16 비트맵에 그린다.
 * 좌표/크기는 PWA 기준 540×960 의 값을 s = W/540f 로 스케일(본 카드 1080×1920 → s=2).
 * baseline 'top' 흉내: drawText y 에 -ascent 를 더한다(Canvas 는 alphabetic baseline).
 */
class ShareCardRenderer(context: Context) {

    private val appCtx = context.applicationContext
    private val sans: Typeface by lazy { ResourcesCompat.getFont(appCtx, R.font.noto_sans_kr) ?: Typeface.SANS_SERIF }
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
        drawText(canvas, payload, ink, width)
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

    private fun drawText(c: Canvas, p: ShareCardPayload, ink: Int, w: Int) {
        val s = w / 540f

        // 'Daily Script' 상단 워터마크 — alphabetic baseline.
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = weighted(sans, 700); applyFakeBold(700)
            textSize = 22f * s
            color = withAlpha(ink, 0x80)
            textAlign = Paint.Align.CENTER
        }.also { c.drawText("Daily Script", w / 2f, 110f * s, it) }

        // 따옴표 — 본문 위, 매우 여린 농도. left + alphabetic.
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = serif
            textSize = 48f * s
            color = withAlpha(ink, 0x38)
            textAlign = Paint.Align.LEFT
        }.also { c.drawText("“", 90f * s, 270f * s, it) }

        // 본문 — 영역(290~760) 안 자동 줄바꿈 + 크기 점진 축소. center + top baseline.
        val bodyTop = 290f * s
        val bodyMaxH = (760f - 290f) * s
        val bodyMaxW = w - 160f * s
        val body = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = weighted(sans, 600); applyFakeBold(600)
            color = ink
            textAlign = Paint.Align.CENTER
        }
        var lines: List<String> = emptyList()
        var lineH = 0
        for (fs in intArrayOf(44, 40, 36, 32, 28, 24)) {
            body.textSize = fs * s
            lines = wrapText(body, p.quote, bodyMaxW)
            lineH = (fs * s * 1.55f).roundToInt()
            if ((lines.size * lineH).toFloat() <= bodyMaxH) break
        }
        val topOffset = -body.ascent()
        var y = bodyTop + max(0f, (bodyMaxH - lines.size * lineH) / 2f)
        for (ln in lines) {
            c.drawText(ln, w / 2f, y + topOffset, body)
            y += lineH
        }

        // speaker — 본문 아래. center + top baseline.
        if (p.speaker.isNotBlank()) {
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                typeface = weighted(sans, 500)
                textSize = 24f * s
                color = withAlpha(ink, 0xCC)
                textAlign = Paint.Align.CENTER
            }.also { c.drawText("— ${p.speaker}", w / 2f, 800f * s + (-it.ascent()), it) }
        }

        // 작품 · 작가 — 최하단. center + top baseline. (한글 italic 금지 → 정자체 serif)
        val workLine = listOf(p.work, p.author).filter { it.isNotBlank() }.joinToString(" · ")
        if (workLine.isNotBlank()) {
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                typeface = serif
                textSize = 24f * s
                color = withAlpha(ink, 0xCC)
                textAlign = Paint.Align.CENTER
            }.also { c.drawText(workLine, w / 2f, 880f * s + (-it.ascent()), it) }
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

    private fun weighted(base: Typeface, weight: Int): Typeface =
        if (Build.VERSION.SDK_INT >= 28) Typeface.create(base, weight, false) else base

    private fun Paint.applyFakeBold(weight: Int) {
        if (Build.VERSION.SDK_INT < 28) isFakeBoldText = weight >= 600
    }

    companion object {
        const val W = 1080
        const val H = 1920
    }
}
