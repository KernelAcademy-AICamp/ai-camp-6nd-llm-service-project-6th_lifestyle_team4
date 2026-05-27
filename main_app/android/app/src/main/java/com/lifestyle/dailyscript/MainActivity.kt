package com.lifestyle.dailyscript

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.ui.DailyScriptRoot
import com.lifestyle.dailyscript.ui.theme.DailyScriptTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val darkTheme by AppPreferences.darkTheme.collectAsState(initial = false)
            DailyScriptTheme(darkTheme = darkTheme) {
                DailyScriptRoot()
            }
        }
    }
}
