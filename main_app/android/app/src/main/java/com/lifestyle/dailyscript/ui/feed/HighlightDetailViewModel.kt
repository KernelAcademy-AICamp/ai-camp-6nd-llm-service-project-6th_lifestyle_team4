package com.lifestyle.dailyscript.ui.feed

import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.HighlightComment
import com.lifestyle.dailyscript.data.repo.FeedRepository

/** 하이라이트 카드 상세 시트의 댓글 (FeedPostDetailViewModel 미러, highlight_id 기준). */
class HighlightDetailViewModel : CommentThreadViewModel<HighlightComment>() {

    private val feedRepo = FeedRepository()

    override fun commentIdOf(comment: HighlightComment): Long = comment.commentId

    override suspend fun fetchComments(threadId: Long): List<HighlightComment> =
        feedRepo.loadHighlightComments(threadId)

    override suspend fun fetchLikes(commentIds: List<Long>): Map<Long, Set<Long>> =
        feedRepo.loadHighlightCommentLikes(commentIds)

    override suspend fun postComment(
        threadId: Long,
        userId: Long,
        body: String,
        nickname: String?,
        parentId: Long?,
    ): HighlightComment = feedRepo.addHighlightComment(threadId, userId, body, nickname, parentId)

    override suspend fun removeComment(commentId: Long, userId: Long) {
        feedRepo.deleteHighlightComment(commentId, userId)
    }

    override suspend fun putLike(commentId: Long, userId: Long, liked: Boolean) {
        feedRepo.setHighlightCommentLike(commentId, userId, liked)
    }

    override fun trackSubmitted(threadId: Long, commentId: Long, isReply: Boolean) {
        AppAnalytics.track(
            "highlight_comment_submitted",
            mapOf("highlight_id" to threadId, "comment_id" to commentId, "is_reply" to isReply),
        )
    }
}
