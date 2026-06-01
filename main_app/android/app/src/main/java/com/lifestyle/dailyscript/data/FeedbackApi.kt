package com.lifestyle.dailyscript.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.android.Android
import io.ktor.client.request.forms.submitForm
import io.ktor.http.Parameters

/**
 * Posts user feedback to the shared Google Apps Script endpoint, form-urlencoded.
 * Mirrors web_pwa/api/feedback.js (same endpoint + field set). The Apps Script
 * follows a redirect on success; ktor follows it automatically.
 */
object FeedbackApi {

    // Public endpoint, identical to web_pwa/api/feedback.js:17.
    private const val ENDPOINT =
        "https://script.google.com/macros/s/AKfycbxhzZUOrfnN-kfLoj2zXvPinBR_po7zclUmEcXjRa66f0la8C0GGYRzNrRfn7eKUxn6rw/exec"

    suspend fun submit(
        rating: Int,
        gender: String,
        age: String,
        liked: String,
        improve: String,
        message: String,
        email: String,
    ) {
        val client = HttpClient(Android)
        try {
            client.submitForm(
                url = ENDPOINT,
                formParameters = Parameters.build {
                    append("rating", rating.toString())
                    append("gender", gender)
                    append("age", age)
                    append("liked", liked)
                    append("improve", improve)
                    append("message", message)
                    append("email", email)
                    append("page", "android")
                },
            )
        } finally {
            client.close()
        }
    }
}
