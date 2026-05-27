package com.lifestyle.dailyscript.widget

import android.content.Context
import android.content.Intent
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

class DailyScriptWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DailyScriptWidget

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        scheduleRefreshWork(context)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: android.appwidget.AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        scheduleRefreshWork(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WorkManager.getInstance(context).cancelUniqueWork(REFRESH_WORK_NAME)
    }

    companion object {
        private const val REFRESH_WORK_NAME = "ds-widget-refresh"

        fun scheduleRefreshWork(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = PeriodicWorkRequestBuilder<RefreshWidgetWorker>(1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                REFRESH_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                work,
            )
        }
    }
}

/** WorkManager가 주기적으로 깨워 카드 1장을 다시 fetch 후 위젯 갱신. */
class RefreshWidgetWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        return try {
            DailyScriptWidget.updateAll(applicationContext)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }
}
