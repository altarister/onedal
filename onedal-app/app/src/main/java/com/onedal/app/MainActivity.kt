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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
        
        // --- 배터리 최적화 제외 권한 요청 (P1-2) ---
        val powerManager = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
        if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:$packageName")
            startActivity(intent)
        }
        // ----------------------------------------

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(vertical = 24.dp),
                        verticalArrangement = Arrangement.Top,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        val context = LocalContext.current
                        val sharedPref = context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
                        var isLiveMode by remember { mutableStateOf(sharedPref.getBoolean("isLiveMode", false)) }
                        
                        val apiClient = remember { com.onedal.app.api.ApiClient(context) }
                        var pinInput by remember { mutableStateOf("") }
                        var pinDeviceName by remember { mutableStateOf("") }
                        var isPairing by remember { mutableStateOf(false) }
                        
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

                        // 서버로부터 전달받은 최신 상태값 (JSON 문자열)
                        var activeFilterJson by remember { mutableStateOf(sharedPref.getString("activeFilter", "{}")) }
                        var apiStatusJson by remember { mutableStateOf(sharedPref.getString("apiStatus", "{}")) }
                        var deviceControlJson by remember { mutableStateOf(sharedPref.getString("deviceControl", "{}")) }
                        
                        // 전송 정보 및 기록
                        var lastScrapTime by remember { mutableStateOf(sharedPref.getLong("lastScrapTime", 0L)) }
                        var lastScrapSize by remember { mutableStateOf(sharedPref.getInt("lastScrapSize", 0)) }
                        var lastScrapPreview by remember { mutableStateOf(sharedPref.getString("lastScrapPreview", "-")) }
                        
                        // API 디버깅 로그
                        var apiScrapReq by remember { mutableStateOf(sharedPref.getString("api_scrap_req", "없음")) }
                        var apiScrapRes by remember { mutableStateOf(sharedPref.getString("api_scrap_res", "없음")) }
                        var apiConfirmReq by remember { mutableStateOf(sharedPref.getString("api_confirm_req", "없음")) }
                        var apiConfirmRes by remember { mutableStateOf(sharedPref.getString("api_confirm_res", "없음")) }

                        LaunchedEffect(Unit) {
                            while (true) {
                                isServiceActive = isAccessibilityServiceEnabled(context, HijackService::class.java)
                                activeFilterJson = sharedPref.getString("activeFilter", "{}")
                                apiStatusJson = sharedPref.getString("apiStatus", "{}")
                                deviceControlJson = sharedPref.getString("deviceControl", "{}")
                                lastScrapTime = sharedPref.getLong("lastScrapTime", 0L)
                                lastScrapSize = sharedPref.getInt("lastScrapSize", 0)
                                lastScrapPreview = sharedPref.getString("lastScrapPreview", "-")
                                
                                apiScrapReq = sharedPref.getString("api_scrap_req", "없음")
                                apiScrapRes = sharedPref.getString("api_scrap_res", "없음")
                                apiConfirmReq = sharedPref.getString("api_confirm_req", "없음")
                                apiConfirmRes = sharedPref.getString("api_confirm_res", "없음")
                                
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

                        // --- 📱 기기 연동 (PIN) UI ---
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFEDE7F6))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("🔗 계정 연동 (PIN)", fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color(0xFF4527A0))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("관제 웹 대시보드에서 발급받은 6자리 PIN 번호를 입력하세요.", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color.DarkGray)
                                Spacer(modifier = Modifier.height(8.dp))
                                
                                androidx.compose.material3.OutlinedTextField(
                                    value = pinInput,
                                    onValueChange = { if (it.length <= 6) pinInput = it },
                                    label = { Text("6자리 PIN 번호") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                androidx.compose.material3.OutlinedTextField(
                                    value = pinDeviceName,
                                    onValueChange = { pinDeviceName = it },
                                    label = { Text("기기 별명 (선택)") },
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Button(
                                    onClick = {
                                        if (pinInput.length != 6) {
                                            android.widget.Toast.makeText(context, "PIN 번호 6자리를 모두 입력해주세요.", android.widget.Toast.LENGTH_SHORT).show()
                                            return@Button
                                        }
                                        isPairing = true
                                        apiClient.pairDevice(pinInput, pinDeviceName) { success, msg ->
                                            android.os.Handler(android.os.Looper.getMainLooper()).post {
                                                isPairing = false
                                                android.widget.Toast.makeText(context, msg, android.widget.Toast.LENGTH_LONG).show()
                                                if (success) {
                                                    pinInput = ""
                                                }
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = !isPairing
                                ) {
                                    Text(if (isPairing) "연동 중..." else "기기 등록하기")
                                }
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 서버 접속 환경 설정 구간
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (isLiveMode) "📡 실서버로 발송 중 (1dal.altari.com)" else "🏠 개발용 로컬망 전송 (아래 IP 참조)")
                            Spacer(modifier = Modifier.width(16.dp))
                            Switch(checked = isLiveMode, onCheckedChange = { checked ->
                                isLiveMode = checked
                                sharedPref.edit().putBoolean("isLiveMode", checked).apply()
                            })
                        }
                        
                        // 실기기 접속을 위한 로컬 IP 입력 필드
                        if (!isLiveMode) {
                            var customIp by remember { mutableStateOf(sharedPref.getString("localPcIp", "172.30.1.89") ?: "172.30.1.89") }
                            Spacer(modifier = Modifier.height(8.dp))
                            androidx.compose.material3.OutlinedTextField(
                                value = customIp,
                                onValueChange = { newValue ->
                                    customIp = newValue
                                    sharedPref.edit().putString("localPcIp", newValue).apply()
                                },
                                label = { Text("개발용 PC IP (기본 172.30.1.89)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp)
                            )
                            Text(
                                "※ 실기기 연결 시 PC의 접속 IP(예: 192.168.0.x:4000)를 수동으로 입력해주세요.",
                                style = MaterialTheme.typography.bodySmall,
                                color = androidx.compose.ui.graphics.Color.Gray,
                                modifier = Modifier.padding(horizontal = 32.dp, vertical = 4.dp)
                            )
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // --- 타겟 앱 선택 (P2/P3) ---
                        var targetApp by remember { mutableStateOf(sharedPref.getString("targetApp", "인성콜") ?: "인성콜") }
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFFF3E0))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("🎯 타겟 스크래핑 앱 선택", fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    androidx.compose.material3.RadioButton(
                                        selected = targetApp == "인성콜",
                                        onClick = { targetApp = "인성콜"; sharedPref.edit().putString("targetApp", "인성콜").apply() }
                                    )
                                    Text("인성콜 (기본)")
                                    Spacer(modifier = Modifier.width(16.dp))
                                    androidx.compose.material3.RadioButton(
                                        selected = targetApp == "24시",
                                        onClick = { targetApp = "24시"; sharedPref.edit().putString("targetApp", "24시").apply() }
                                    )
                                    Text("24시 (준비중)")
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // --- 데스밸리 타이머 설정 UI (P1-1) ---
                        var deathValleyValue by remember { mutableStateOf(sharedPref.getLong("deathValleyTimeout", 30000L)) }
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFFCE4EC))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("⏱️ 데스밸리 비상 자동취소 타이머", fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color(0xFFC2185B))
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    val options = listOf(30000L to "30초", 40000L to "40초", 50000L to "50초")
                                    options.forEach { (ms, label) ->
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            androidx.compose.material3.RadioButton(
                                                selected = deathValleyValue == ms,
                                                onClick = {
                                                    deathValleyValue = ms
                                                    sharedPref.edit().putLong("deathValleyTimeout", ms).apply()
                                                }
                                            )
                                            Text(label)
                                        }
                                        if (ms != 50000L) Spacer(modifier = Modifier.width(8.dp))
                                    }
                                }
                            }
                        }
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        
                        Button(onClick = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("http://172.30.1.89:5173/inseong"))
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
                                val vehicleArr = json.optJSONArray("allowedVehicleTypes")
                                val vehicleStr = if (vehicleArr != null && vehicleArr.length() > 0) {
                                    (0 until vehicleArr.length()).map { vehicleArr.getString(it) }.joinToString(", ")
                                } else "전체 허용"

                                "allowedVehicleTypes: $vehicleStr\n" +
                                "minFare: ${json.optString("minFare", "0")}원\n" +
                                "pickupRadiusKm: ${json.optString("pickupRadiusKm", "0")}km\n" +
                                "destinationCity: ${json.optString("destinationCity", "미설정")}\n" +
                                "destinationKeywords: ${json.optString("destinationKeywords", "없음")}\n" +
                                "excludedKeywords: ${json.optString("excludedKeywords", "없음")}"
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
                        
                        // 서버 누적 통계 및 제어 상태 카드
                        val statusText = try {
                            val json = JSONObject(apiStatusJson ?: "{}")
                            if (json.length() == 0) "대기 중.."
                            else "• 통신 성공여부: ${json.optBoolean("success")}\n• 누적 수집된 오더: ${json.optInt("totalItems")}건"
                        } catch (e: Exception) { "파싱 오류" }

                        val controlText = try {
                            val json = JSONObject(deviceControlJson ?: "{}")
                            if (json.length() == 0) "대기 중.."
                            else "• 데스맨 스위치 모드: ${json.optString("mode")}"
                        } catch (e: Exception) { "파싱 오류" }

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFE8F5E9))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("서버 통계 및 제어 상태", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = androidx.compose.ui.graphics.Color(0xFF2E7D32))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(statusText, style = MaterialTheme.typography.bodyMedium)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(controlText, style = MaterialTheme.typography.bodyMedium)
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // API 통신 로그
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFE3F2FD))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("📡 마지막 전송 시간: $timeString", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall, color = androidx.compose.ui.graphics.Color(0xFFE65100).copy(alpha=0.7f))
                                Text("📡 실시간 API 통신 로그", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = androidx.compose.ui.graphics.Color(0xFF1565C0))
                                Spacer(modifier = Modifier.height(8.dp))
                                
                                Text("[ /api/scrap ]", fontWeight = FontWeight.SemiBold, color = androidx.compose.ui.graphics.Color(0xFF0D47A1))
                                Text("보낸값: ${apiScrapReq}", style = MaterialTheme.typography.bodySmall)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("받은값: ${apiScrapRes}", style = MaterialTheme.typography.bodySmall)
                                
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("[ /api/orders/confirm ]", fontWeight = FontWeight.SemiBold, color = androidx.compose.ui.graphics.Color(0xFF0D47A1))
                                Text("보낸값: ${apiConfirmReq}", style = MaterialTheme.typography.bodySmall)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("받은값: ${apiConfirmRes}", style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        
                        // 기획상 미구현된 기능 목록
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 32.dp),
                            colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color(0xFFF5F5F5))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("🚧 기획상 미구현된 기능 (PRD)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = androidx.compose.ui.graphics.Color(0xFF424242))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("1. [3단계] 인성앱 상세 대화상자 스크래핑", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFF616161))
                                Text("2. [4단계] 데스밸리 방어 (15초 내 자동 취소 매크로)", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFF616161))
                                Text("3. 서버에서 취소요청(CANCEL) 시 인성앱 제어 로직", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFF616161))
                                Text("4. 앱 비인가 우회 및 포그라운드 고정화 고도화", style = MaterialTheme.typography.bodySmall, color = androidx.compose.ui.graphics.Color(0xFF616161))
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
