package com.lifestyle.dailyscript.ui.nav

object Routes {
    const val DAILY = "daily"
    const val HOME = "home"
    const val ARCHIVE = "archive"
    const val ARCHIVE_WORK = "archive/{workId}"
    const val FEED = "feed"
    const val NOTICE = "notice"
    const val SETTINGS = "settings"
    const val FEEDBACK = "feedback"
    const val MY_COMMENTS = "my_comments"
    const val MY_FEED = "my_feed"
    const val BOOKMARKS = "bookmarks"
    const val TERMS = "terms"
    const val PRIVACY = "privacy"
    const val YARN_PURCHASE = "yarn_purchase"
    const val DETAIL = "detail/{cardId}"
    fun archiveWork(workId: Long) = "archive/$workId"
    fun detail(cardId: Long) = "detail/$cardId"
}
