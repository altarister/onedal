plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.parcelize)
}

android {
    namespace = "com.onedal.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.onedal.app"
        minSdk = 26
        targetSdk = 35
        // 어떤 빌드가 폰에 깔려 있는지 눈으로 구분하기 위한 버전 표기.
        // 앱 대시보드 상단과 서비스 기동 로그에 그대로 노출된다.
        versionCode = 22
        versionName = "2.5.4-alarm-dong"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    // 서버 URL은 BuildConfig가 아니라 SharedPreferences(isLiveMode / localPcIp)가 결정합니다.
    // → ApiClient.getTargetUrl() 참조
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    /**
     * 🧪 **JVM 테스트에서 android.util.Log 가 터지지 않게 한다** (2026-08-25).
     *
     * 필터 판정(`InsungParser.decide`)은 로그를 남기는데, 단위 테스트에는 안드로이드
     * 런타임이 없어 `Log.d` 가 *"not mocked"* 로 예외를 던진다. 기본값(0/false/null)을
     * 돌려주게 해 두면 판정 자체를 폰 없이 채점할 수 있다.
     *
     * 기사님(2026-08-25): *"도대체 어떻게 하면 필터가 잘 작동하는지 확인할 수 있는 거야.
     * 지금 이것만 2시간 동안 하고 있어."* — 폰 한 판 3분에 실패 지점이 여섯 개였다.
     */
    testOptions {
        unitTests.isReturnDefaultValues = true
        /**
         * 🔴 **표를 보여 주는 것이 이 검사의 목적이다.** Gradle 은 표준 출력을 기본으로
         *    숨기는데, 그러면 «몇 개 통과」만 남고 **어느 축에서 갈렸는지**를 못 본다.
         *    기사님이 필요한 건 통과/실패 숫자가 아니라 그 표다.
         */
        unitTests.all {
            it.testLogging { showStandardStreams = true }
        }
    }
}

dependencies {
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.window)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
    
    // JSON Parser
    implementation("com.google.code.gson:gson:2.10.1")
}
