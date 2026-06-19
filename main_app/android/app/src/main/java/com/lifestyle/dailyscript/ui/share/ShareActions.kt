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
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/** FileProvider authority — AndroidManifest 의 <provider> 와 반드시 일치. */
const val SHARE_AUTHORITY = "com.lifestyle.dailyscript.fileprovider"

/** 공유 텍스트 — PWA sendShareCard: `"명대사" — 작품` (referral 링크는 이번 범위 밖). */
fun buildShareText(p: ShareCardPayload): String {
    val quote = if (p.quote.isNotBlank()) "“${p.quote}”" else ""
    val credit = if (p.work.isNotBlank()) " — ${p.work}" else ""
    return (quote + credit).trim().ifBlank { "Daily Script" }
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

/**
 * 카카오톡으로 바로 보내기 — ACTION_SEND 를 com.kakao.talk 패키지로 지정해 카카오톡만 띄운다.
 * 카카오톡 미설치(또는 차단)면 startActivity 가 ActivityNotFoundException → false 반환(호출측이 안내).
 * 정식 Kakao SDK 피드 템플릿('카드 보기' 버튼 등)은 네이티브 앱키·키해시 등록이 필요해 이번 범위 밖.
 * (Android 11+ 패키지 가시성 때문에 AndroidManifest 에 <queries> com.kakao.talk 필요.)
 */
suspend fun shareCardToKakao(context: Context, bmp: Bitmap, payload: ShareCardPayload): Boolean {
    val uri = withContext(Dispatchers.IO) { writePngToCache(context, bmp) }
    val send = Intent(Intent.ACTION_SEND).apply {
        setPackage("com.kakao.talk")
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, buildShareText(payload))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return runCatching { context.startActivity(send); true }.getOrDefault(false)
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
