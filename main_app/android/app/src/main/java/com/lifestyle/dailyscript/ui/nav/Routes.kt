package com.lifestyle.dailyscript.ui.nav

object Routes {
    const val HOME = "home"
    const val ARCHIVE = "archive"
    const val FEED = "feed"
    const val NOTICE = "notice"
    const val SETTINGS = "settings"
    const val FEEDBACK = "feedback"
    const val MY_COMMENTS = "my_comments"
    const val MY_FEED = "my_feed"
    const val TERMS = "terms"
    const val PRIVACY = "privacy"
    const val DETAIL = "detail/{cardId}"
    fun detail(cardId: Long) = "detail/$cardId"
}
