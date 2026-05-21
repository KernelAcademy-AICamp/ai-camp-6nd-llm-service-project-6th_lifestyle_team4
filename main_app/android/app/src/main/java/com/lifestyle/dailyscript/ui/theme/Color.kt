package com.lifestyle.dailyscript.ui.theme

import androidx.compose.ui.graphics.Color

// LongBlack mood — foundation
val Espresso = Color(0xFF0E0C0A)   // 본문·로고·강조 텍스트, 다크 카드 배경
val Roast    = Color(0xFF2C2620)   // 보조 다크 (네비, 모달)
val Walnut   = Color(0xFF6B5D4F)   // 보조 텍스트, 메타정보
val Paper    = Color(0xFFFAF8F2)   // 메인 배경 (따뜻한 크림)
val Latte    = Color(0xFFE8E1D3)   // 구분선, 보조 패널
val Sand     = Color(0xFFC9B89A)   // 뉴트럴 액센트

// LongBlack mood — signal
val Highlight = Color(0xFFF4C20D)  // D-day, 별점, "LIVE"
val Cta       = Color(0xFFD85A30)  // 결제·1차 전환 버튼

// Backwards-compatible aliases (older code imports these names).
val PaperWhite        = Paper
val InkBlack          = Espresso
val SignatureOrange   = Cta
val BorderSubtle      = Latte
val SurfaceMuted      = Latte
val OnSurfaceVariant  = Walnut
val OutlineVariant    = Sand
