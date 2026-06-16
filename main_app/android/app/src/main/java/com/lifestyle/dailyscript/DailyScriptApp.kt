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
        AppPreferences.warmDecorCache() // 오즈의 집 진입 전 꾸미기 캐시 예열 → 첫 진입 깜빡임 방지
        AppAnalytics.init(this, BuildConfig.AMPLITUDE_API_KEY, BuildConfig.CLARITY_PROJECT_ID)
    }
}
