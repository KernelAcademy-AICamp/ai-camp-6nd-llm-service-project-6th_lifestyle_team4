package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.AppNotification
import com.lifestyle.dailyscript.data.model.NotificationIdRow
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

/**
 * 댓글/대댓글 알림 (PWA 확성기). notifications 테이블을 recipient_user_id 로 조회.
 * RLS 는 select/update 모두 USING(true) — 실제 본인 필터는 .eq("recipient_user_id", me) 로 한다(040_notifications).
 */
class NotificationRepository {

    private val client get() = SupabaseProvider.client

    private val select = Columns.raw(
        "notification_id, actor_nickname, kind, target_post_id, target_highlight_id, " +
            "target_comment_id, body_preview, is_read, created_at"
    )

    /** 미읽음 개수 — 배지용. id 만 가볍게 읽어 개수를 센다(최대 100). */
    suspend fun unreadCount(userId: Long): Int =
        client.postgrest["notifications"]
            .select(Columns.raw("notification_id")) {
                filter {
                    eq("recipient_user_id", userId)
                    eq("is_read", false)
                }
                limit(100)
            }
            .decodeList<NotificationIdRow>()
            .size

    /** 최근 알림 50개(최신순). */
    suspend fun list(userId: Long): List<AppNotification> =
        client.postgrest["notifications"]
            .select(select) {
                filter { eq("recipient_user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()

    /** 내 미읽음 전부 읽음 처리(시트 오픈 시). */
    suspend fun markAllRead(userId: Long) {
        client.postgrest["notifications"].update({ set("is_read", true) }) {
            filter {
                eq("recipient_user_id", userId)
                eq("is_read", false)
            }
        }
    }
}
