import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.kotlin.compose)
}

val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val supabaseUrl: String = localProps.getProperty("SUPABASE_URL", "")
val supabaseAnonKey: String = localProps.getProperty("SUPABASE_ANON_KEY", "")
// 네이티브 구글 로그인용 "웹 애플리케이션" OAuth 클라이언트 ID(...apps.googleusercontent.com).
// Supabase Auth → Providers → Google 의 Client ID 와 동일해야 한다. 비어 있으면 구글 로그인만 비활성.
val googleWebClientId: String = localProps.getProperty("GOOGLE_WEB_CLIENT_ID")
    ?: System.getenv("GOOGLE_WEB_CLIENT_ID")
    ?: ""
val amplitudeApiKey: String = localProps.getProperty("AMPLITUDE_API_KEY")
    ?: System.getenv("AMPLITUDE_API_KEY")
    ?: ""
val clarityProjectId: String = localProps.getProperty("CLARITY_PROJECT_ID")
    ?: System.getenv("CLARITY_PROJECT_ID")
    ?: ""
// 공유 short URL(/m/?s=<id>)이 열리는 웹(PWA) 도메인. prod 기본값, local.properties 로 덮어쓰기 가능.
val webBaseUrl: String = localProps.getProperty("WEB_BASE_URL")
    ?: System.getenv("WEB_BASE_URL")
    ?: "https://ai-camp-6nd-llm-service-project-6th-psi.vercel.app"

// Release signing. Values live in keystore.properties (git-ignored, per machine);
// absent on machines without the keystore, so debug builds keep working.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasReleaseKeystore = keystoreProps.getProperty("storeFile") != null

fun buildConfigString(value: String): String =
    "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

android {
    namespace = "com.lifestyle.dailyscript"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lifestyle.dailyscript"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "1.0.2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        buildConfigField("String", "SUPABASE_URL", buildConfigString(supabaseUrl))
        buildConfigField("String", "SUPABASE_ANON_KEY", buildConfigString(supabaseAnonKey))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", buildConfigString(googleWebClientId))
        buildConfigField("String", "AMPLITUDE_API_KEY", buildConfigString(amplitudeApiKey))
        buildConfigField("String", "CLARITY_PROJECT_ID", buildConfigString(clarityProjectId))
        buildConfigField("String", "WEB_BASE_URL", buildConfigString(webBaseUrl))
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // 자체(C/C++) 네이티브 코드가 있으면 디버그 기호를 AAB에 포함시킨다.
            // 현재는 자체 네이티브 코드가 없고 .so 가 전부 stripped 된 AndroidX prebuilt
            // (libandroidx.graphics.path / libdatastore_shared_counter)뿐이라 추출되는 기호가
            // 없어 Play Console "네이티브 디버그 기호 미업로드" 경고는 남지만 무해하다.
            // 이후 자체 네이티브 코드를 추가하면 이 설정으로 자동 포함된다.
            ndk {
                debugSymbolLevel = "FULL"
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.ui.text.google.fonts)
    debugImplementation(libs.androidx.ui.tooling)

    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.browser)
    implementation(libs.kotlinx.serialization.json)

    // 네이티브 구글 로그인 (Credential Manager + Sign in with Google)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.google.identity.googleid)

    val supabaseBom = platform(libs.supabase.bom)
    implementation(supabaseBom)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.ktor.client.android)

    // Home-screen widget (Glance)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime.ktx)

    implementation(libs.amplitude.analytics.android)
    implementation(libs.microsoft.clarity.compose)

    // 네트워크 이미지 (피드 책 표지 works.cover_url)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}
