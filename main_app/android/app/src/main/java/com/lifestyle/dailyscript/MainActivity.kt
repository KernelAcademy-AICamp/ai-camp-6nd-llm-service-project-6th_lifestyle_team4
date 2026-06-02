package com.lifestyle.dailyscript

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.lifestyle.dailyscript.data.AppPreferences
import com.lifestyle.dailyscript.ui.DailyScriptRoot
import com.lifestyle.dailyscript.ui.SplashIntro
import com.lifestyle.dailyscript.ui.theme.DailyScriptTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val darkTheme by AppPreferences.darkTheme.collectAsState(initial = false)
            DailyScriptTheme(darkTheme = darkTheme) {
                var introDone by rememberSaveable { mutableStateOf(false) }
                Box(modifier = Modifier.fillMaxSize()) {
                    DailyScriptRoot()
                    if (!introDone) {
                        SplashIntro(onFinished = { introDone = true })
                    }
                }
            }
        }
    }
}
