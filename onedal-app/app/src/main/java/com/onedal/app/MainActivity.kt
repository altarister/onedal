package com.onedal.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import android.content.Context
import androidx.compose.material3.Switch
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.foundation.layout.Row
import android.content.ComponentName
import android.text.TextUtils
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.ui.text.font.FontWeight
import org.json.JSONObject

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
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        val context = LocalContext.current
                        val sharedPref = context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
                        var isLiveMode by remember { mutableStateOf(sharedPref.getBoolean("isLiveMode", false)) }
                        
                        // 기기 ID 표시 (실제 생성은 HijackService 시작 시 ApiClient가 담당)
                        val deviceId = remember {
                            sharedPref.getString("deviceId", null) ?: "(서비스 시작 시 자동 생성됨)"
                        }

                        // 접근 권한 상태 체크 (화면이 다시 켜질 때 & 1초마다 실시간 갱신)
                        val lifecycleOwner = LocalLifecycleOwner.current
                        var isServiceActive by remember { mutableStateOf(isAccessibilityServiceEnabled(context, HijackService::class.java)) }
                        
                        DisposableEffect(lifecycleOwner) {
                            val observer = LifecycleEventObserver { _, event ->
                                if (event == Lifecycle.Event.ON_RESUME) {
                                    isServiceActive = isAccessibilityServiceEnabled(context, HijackService::class.java)
                                }
                            }
                            lifecycleOwner.lifecycle.addObserver(observer)
                            onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                        }

                        // 서버로부터 전달받은 최신 필터 상태 (JSON 문자열)
                        var activeFilterJson by remember { mutableStateOf(sharedPref.getString("activeFilter", "{}")) }
                        
                        // 전송 정보 및 기록
                        var lastScrapTime by remember { mutableStateOf(sharedPref.getLong("lastScrapTime", 0L)) }
                        var lastScrapSize by remember { mutableStateOf(sharedPref.getInt("lastScrapSize", 0)) }
                        var lastScrapPreview by remember { mutableStateOf(sharedPref.getString("lastScrapPreview", "-")) }

                        LaunchedEffect(Unit) {
                            while (true) {
                                isServiceActive = isAccessibilityServiceEnabled(context, HijackService::class.java)
                                activeFilterJson = sharedPref.getString("activeFilter", "{}")
                                lastScrapTime = sharedPref.getLong("lastScrapTime", 0L)
                                lastScrapSize = sharedPref.getInt("lastScrapSize", 0)
                                lastScrapPreview = sharedPref.getString("lastScrapPreview", "-")
                                
                                delay(1000)
                            }
                        }
                        
                        val dateFormat = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
                        val timeString = if (lastScrapTime > 0) dateFormat.format(Date(lastScrapTime)) else "발송 전"
                        
                        Text(text = stringResource(id = R.string.main_title))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "기기 ID: $deviceId",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 접근성 상태 배지
                        Surface(
                            color = if (isServiceActive) androidx.compose.ui.graphics.Color(0xFFE8F5E9) else androidx.compose.ui.graphics.Color(0xFFFFEBEE),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = if (isServiceActive) "🟢 접근성 자동화 엔진 작동 중" else "🔴 접근성 권한이 꺼져있습니다",
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isServiceActive) androidx.compose.ui.graphics.Color(0xFF2E7D32) else androidx.compose.ui.graphics.Color(0xFFC62828)
                            )
                        }
                        
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        // 서버 접속 토글 스위치 (Local vs Live)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (isLiveMode) "📡 실서버로 발송 중 (1dal.altari.com)" else "🏠 내 PC로 발송 중 (10.0.2.2)")
                            Spacer(modifier = Modifier.width(16.dp))
                            Switch(
                                checked = isLiveMode,
                                onCheckedChange = { checked ->
                                    isLiveMode = checked
                                    sharedPref.edit().putBoolean("isLiveMode", checked).apply()
                                }
                            )
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        Button(onClick = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("http://10.0.2.2:5173/?mode=standalone"))
                            context.startActivity(intent)
                        }) {
                            Text("테스트 가상 콜 화면 열기")
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 서버 필터 상태 표시 카드
                        val filterText = try {
                            val json = JSONObject(activeFilterJson ?: "{}")
                            if (json.length() == 0) "대기 중 (서버 응답 없음)"
                            else {
                                "• 모드: ${json.optString("mode")}\n" +
                                "• 최소운임: ${json.optString("minFare")}원\n" +
                                "• 목표지역: ${json.optString("targetCity")} (반경 ${json.optString("targetRadius")}km)\n" +
                                "• 제외단어: ${json.optString("blacklist")}"
                            }
                        } catch (e: Exception) {
                            "필터 파싱 오류"
                        }
                        
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("서버 동기화 필터 상태", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(filterText, style = MaterialTheme.typography.bodyMedium)
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 발송 정보 표시 카드
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFFF3E0))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("방금 보낸 데이터 (${lastScrapSize}건)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, color = androidx.compose.ui.graphics.Color(0xFFE65100))
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(lastScrapPreview ?: "-", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFFEF6C00))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("📡 마지막 전송 시간: $timeString", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall, color = androidx.compose.ui.graphics.Color(0xFFE65100).copy(alpha=0.7f))
                            }
                        }

                        Spacer(modifier = Modifier.height(32.dp))
                        
                        Button(onClick = {
                            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                            startActivity(intent)
                        }) {
                            Text(stringResource(id = R.string.btn_open_accessibility_settings))
                        }
                    }
                }
            }
        }
    }
}
