package com.lifestyle.dailyscript.ui.nav

object Routes {
    const val HOME = "home"
    const val ARCHIVE = "archive"
    const val FEED = "feed"
    const val NOTICE = "notice"
    const val SETTINGS = "settings"
    const val FEEDBACK = "feedback"
    const val DETAIL = "detail/{cardId}"
    fun detail(cardId: Long) = "detail/$cardId"
}
