package com.lifestyle.dailyscript.ui.nav

object Routes {
    const val HOME = "home"
    const val ARCHIVE = "archive"
    const val SETTINGS = "settings"
    const val DETAIL = "detail/{cardId}"
    fun detail(cardId: Long) = "detail/$cardId"
}
