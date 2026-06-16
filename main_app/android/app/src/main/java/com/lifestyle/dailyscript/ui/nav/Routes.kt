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
    const val OZ_HOUSE = "oz_house"
    const val DETAIL = "detail/{cardId}"
    fun archiveWork(workId: Long) = "archive/$workId"
    fun detail(cardId: Long) = "detail/$cardId"

    /** 하단 네비게이션 탭의 루트 목적지들 (상세 등 임시 화면과 구분). */
    val bottomTabs = setOf(DAILY, HOME, ARCHIVE, FEED, SETTINGS)
}
