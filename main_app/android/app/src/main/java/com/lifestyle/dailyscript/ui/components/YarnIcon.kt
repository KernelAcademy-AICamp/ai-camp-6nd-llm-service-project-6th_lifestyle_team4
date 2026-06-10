package com.lifestyle.dailyscript.ui.components

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import com.lifestyle.dailyscript.R
import com.lifestyle.dailyscript.ui.theme.Cta

/** 실타래 일러스트 PNG — 하단탭 '오늘의 명대사' 홈 버튼과 실타래 아이콘이 공유. */
const val YarnAssetName = "daily script bar.png"

/**
 * assets/ 폴더의 PNG를 ImageBitmap 으로 로드. 파일명에 공백/대문자가 있어도 됨
 * (res/drawable 은 소문자·언더스코어만 허용하므로 assets/ 사용).
 * 파일이 없으면 null 반환 → 호출부에서 폴백 처리.
 */
@Composable
fun rememberAssetBitmap(name: String): ImageBitmap? {
    val context = LocalContext.current
    return remember(name) {
        runCatching {
            context.assets.open(name).use { BitmapFactory.decodeStream(it).asImageBitmap() }
        }.getOrNull()
    }
}

/**
 * 실타래 아이콘 — 하단탭 홈 버튼과 같은 실타래 일러스트를 사용한다.
 * 원본 PNG(677x369)는 가로로 넓은 투명 배경 + 중앙 실타래(폭 297px)라
 * 정사각 칸에 ContentScale.Crop 으로 좌우 여백만 잘려 실타래는 온전히 보인다.
 * 에셋이 없으면 기존 ic_yarn 벡터(Cta 틴트)로 폴백.
 */
@Composable
fun YarnIcon(modifier: Modifier = Modifier, contentDescription: String? = null) {
    val bitmap = rememberAssetBitmap(YarnAssetName)
    if (bitmap != null) {
        Image(
            bitmap = bitmap,
            contentDescription = contentDescription,
            contentScale = ContentScale.Crop,
            modifier = modifier.clip(CircleShape),
        )
    } else {
        Icon(
            painter = painterResource(R.drawable.ic_yarn),
            contentDescription = contentDescription,
            tint = Cta,
            modifier = modifier,
        )
    }
}
