package com.lifestyle.dailyscript

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lifestyle.dailyscript.ui.DailyScriptRoot
import com.lifestyle.dailyscript.ui.theme.DailyScriptTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DailyScriptTheme {
                DailyScriptRoot()
            }
        }
    }
}
