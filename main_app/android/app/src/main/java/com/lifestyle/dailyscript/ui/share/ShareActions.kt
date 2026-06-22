package com.lifestyle.dailyscript.ui.share

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import com.lifestyle.dailyscript.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/** FileProvider authority — AndroidManifest 의 <provider> 와 반드시 일치. */
const val SHARE_AUTHORITY = "com.lifestyle.dailyscript.fileprovider"

/** 공유 텍스트 — PWA sendShareCard: `"명대사" — 작품`. 링크 공유 시 뒤에 URL 한 줄을 덧붙인다. */
fun buildShareText(p: ShareCardPayload): String {
    val quote = if (p.quote.isNotBlank()) "“${p.quote}”" else ""
    val credit = if (p.work.isNotBlank()) " — ${p.work}" else ""
    return (quote + credit).trim().ifBlank { "Daily Script" }
}

/** 공유 short URL 이 열리는 웹(PWA) 도메인. */
private val webBase: String get() = BuildConfig.WEB_BASE_URL.trimEnd('/')

/** PWA urlSafeB64Encode 와 동일 — UTF-8 → base64url(패딩 제거). 한글 quote 단축용. */
fun urlSafeB64Encode(s: String): String =
    Base64.encodeToString(s.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

/** short_id → /m/?s=<id> (PWA shareLink 성공 경로). */
fun buildShortShareUrl(shortId: String): String = "$webBase/m/?s=$shortId"

/** create_share_link 실패 시 long URL 폴백 — /m/?r=&c=&b=&q= (PWA buildReferralUrl). */
fun buildReferralUrl(referrerId: Long?, cardId: Long?, bgId: String?, quote: String?): String {
    val params = buildList {
        if (referrerId != null) add("r=$referrerId")
        if (cardId != null) add("c=$cardId")
        if (!bgId.isNullOrBlank()) add("b=${Uri.encode(bgId)}")
        if (!quote.isNullOrBlank()) add("q=${urlSafeB64Encode(quote.take(300))}")
    }
    return if (params.isEmpty()) "$webBase/m/" else "$webBase/m/?${params.joinToString("&")}"
}

/** 링크 보내기 — 명대사+작품 텍스트에 공유 URL 한 줄을 덧붙여 시스템 공유 시트(text/plain)로. */
fun shareLink(context: Context, url: String, payload: ShareCardPayload) {
    val text = listOf(buildShareText(payload), url).filter { it.isNotBlank() }.joinToString("\n")
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_TITLE, "Daily Script")
    }
    context.startActivity(Intent.createChooser(send, "Daily Script"))
}

/** PNG 를 cacheDir/share 에 쓰고 FileProvider content:// URI 반환. */
private fun writePngToCache(context: Context, bmp: Bitmap): Uri {
    val dir = File(context.cacheDir, "share").apply { mkdirs() }
    val file = File(dir, "daily-script-${System.currentTimeMillis()}.png")
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    return FileProvider.getUriForFile(context, SHARE_AUTHORITY, file)
}

/** 시스템 공유 시트 — 이미지(PNG) + 명대사 텍스트. 카카오톡 등이 SEND 대상으로 자동 노출. */
suspend fun shareCard(context: Context, bmp: Bitmap, payload: ShareCardPayload) {
    val uri = withContext(Dispatchers.IO) { writePngToCache(context, bmp) }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, buildShareText(payload))
        putExtra(Intent.EXTRA_TITLE, "Daily Script")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, "Daily Script").apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(chooser)
}

/** 갤러리(Pictures/DailyScript) 저장. 성공 시 true. */
suspend fun saveToGallery(context: Context, bmp: Bitmap): Boolean = withContext(Dispatchers.IO) {
    val name = "daily-script-${System.currentTimeMillis()}.png"
    runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, name)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DailyScript")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: return@runCatching false
            resolver.openOutputStream(uri)?.use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                ?: return@runCatching false
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } else {
            // API 26–28: RELATIVE_PATH/IS_PENDING 미지원 → public Pictures 에 직접 기록(WRITE_EXTERNAL_STORAGE 필요).
            @Suppress("DEPRECATION")
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                "DailyScript",
            ).apply { mkdirs() }
            val file = File(dir, name)
            FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/png"), null)
            true
        }
    }.getOrDefault(false)
}
