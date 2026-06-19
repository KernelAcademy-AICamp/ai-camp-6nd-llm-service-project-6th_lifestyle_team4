package com.lifestyle.dailyscript

import android.app.Application
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.data.AppAnalytics
import com.lifestyle.dailyscript.data.SupabaseProvider

class DailyScriptApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SupabaseProvider.init(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
        AppPreferences.init(this)
        AppAnalytics.init(this, BuildConfig.AMPLITUDE_API_KEY, BuildConfig.CLARITY_PROJECT_ID)
    }
}
