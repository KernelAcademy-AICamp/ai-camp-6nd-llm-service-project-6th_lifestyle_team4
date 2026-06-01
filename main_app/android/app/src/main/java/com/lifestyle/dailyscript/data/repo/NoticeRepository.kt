package com.lifestyle.dailyscript.data.repo

import com.lifestyle.dailyscript.data.SupabaseProvider
import com.lifestyle.dailyscript.data.model.Notice
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

class NoticeRepository {

    private val client get() = SupabaseProvider.client

    /** Published notices, pinned first then newest. RLS hides unpublished rows from non-admins. */
    suspend fun list(): List<Notice> =
        client.postgrest["notices"]
            .select(Columns.raw("notice_id, tag, title, body, pinned, created_at")) {
                filter { eq("published", true) }
                order("pinned", Order.DESCENDING)
                order("created_at", Order.DESCENDING)
                limit(100)
            }
            .decodeList()
}
