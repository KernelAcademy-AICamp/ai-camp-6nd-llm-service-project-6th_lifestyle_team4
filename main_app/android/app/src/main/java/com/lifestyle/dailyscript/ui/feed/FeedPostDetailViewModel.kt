package com.lifestyle.dailyscript.ui.feed

import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.model.FeedComment
import com.lifestyle.dailyscript.data.repo.FeedRepository

/** Comments for a single feed post detail sheet (post 객체는 UI가 직접 들고 있고, 댓글만 로드). */
class FeedPostDetailViewModel : CommentThreadViewModel<FeedComment>() {

    private val feedRepo = FeedRepository()

    override fun commentIdOf(comment: FeedComment): Long = comment.commentId

    override suspend fun fetchComments(threadId: Long): List<FeedComment> =
        feedRepo.loadComments(threadId)

    override suspend fun fetchLikes(commentIds: List<Long>): Map<Long, Set<Long>> =
        feedRepo.loadCommentLikes(commentIds)

    override suspend fun postComment(
        threadId: Long,
        userId: Long,
        body: String,
        nickname: String?,
        parentId: Long?,
    ): FeedComment = feedRepo.addComment(threadId, userId, body, nickname, parentId)

    override suspend fun removeComment(commentId: Long, userId: Long) {
        feedRepo.deleteComment(commentId, userId)
    }

    override suspend fun putLike(commentId: Long, userId: Long, liked: Boolean) {
        feedRepo.setCommentLike(commentId, userId, liked)
    }

    override fun trackSubmitted(threadId: Long, commentId: Long, isReply: Boolean) {
        AppAnalytics.track(
            "feed_comment_submitted",
            mapOf("post_id" to threadId, "comment_id" to commentId, "is_reply" to isReply),
        )
    }
}
