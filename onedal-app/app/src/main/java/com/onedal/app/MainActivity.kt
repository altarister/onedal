package com.onedal.app

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import android.content.Context
import android.content.ComponentName
import android.text.TextUtils
import com.onedal.app.ui.MainViewModel
import com.onedal.app.ui.DashboardScreen
import com.onedal.app.ui.NetworksScreen
import com.onedal.app.ui.SettingsScreen
import com.onedal.app.ui.CheckScreen

fun isAccessibilityServiceEnabled(context: Context, service: Class<*>): Boolean {
    val expectedComponentName = ComponentName(context, service)
    val enabledServicesSetting = Settings.Secure.getString(
        context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false

    val colonSplitter = TextUtils.SimpleStringSplitter(':')
    colonSplitter.setString(enabledServicesSetting)

    while (colonSplitter.hasNext()) {
        val componentNameString = colonSplitter.next()
        val enabledService = ComponentName.unflattenFromString(componentNameString)
        if (enabledService == expectedComponentName) {
            return true
        }
    }
    return false
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 🔋 배터리 최적화 예외는 켤 때 창을 바로 띄우지 않는다 — 점검 탭 «예외로 두기» 버튼이 맡는다 (`FirstRunCheck`)
        /* 📶 «근처 기기» 허락이 없으면 안드로이드 허락 창을 한 번 — 접근성 서비스는 스스로 물을 수 없다 · 거절하면 점검 탭 줄이 빨갛다 (기사님 2 가 · reviews/50 ①-3) */
        if (android.os.Build.VERSION.SDK_INT >= 31 && !com.onedal.app.core.BleLink.hasPermission(this))
            requestPermissions(arrayOf(android.Manifest.permission.BLUETOOTH_ADVERTISE, android.Manifest.permission.BLUETOOTH_CONNECT), 3001)

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val context = LocalContext.current
                    val vm = remember { MainViewModel() }

                    // 폴링 시작 (1회만) — 켤 때 사실을 한 번 읽어 첫 탭을 고른다
                    remember { vm.startPolling(context); true }

                    // 4탭 구조: 대시보드 / 배차망 / 설정 / 점검 — 🩺 켤 때 빨강(먼저 띄울 것)이 있으면 점검 탭부터
                    var selectedTab by remember { mutableStateOf(if (com.onedal.app.core.FirstRunCheck.mustShow(com.onedal.app.core.FirstRunCheck.rows(vm.checkFacts()))) 3 else 0) }
                    val tabs = listOf("📊 대시보드", "🚚 배차망", "⚙️ 설정", "🩺 점검")

                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = stringResource(id = R.string.main_title),
                            modifier = Modifier.padding(top = 24.dp, bottom = 8.dp)
                        )

                        TabRow(selectedTabIndex = selectedTab) {
                            tabs.forEachIndexed { index, title ->
                                Tab(
                                    selected = selectedTab == index,
                                    onClick = { selectedTab = index },
                                    text = { Text(title) }
                                )
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(vertical = 16.dp),
                            verticalArrangement = Arrangement.Top,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            when (selectedTab) {
                                0 -> DashboardScreen(viewModel = vm)
                                1 -> NetworksScreen(viewModel = vm)
                                2 -> SettingsScreen(viewModel = vm, onOpenCheck = { selectedTab = 3 })
                                3 -> CheckScreen(viewModel = vm, onOpenSettings = { selectedTab = 2 })
                            }
                        }
                    }
                }
            }
        }
    }
}
