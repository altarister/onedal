package com.onedal.app.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.onedal.app.R
import com.onedal.app.api.ApiClient

/**
 * 설정 탭 화면
 *
 * PIN 연동, 서버 환경, 타겟 앱, 데스밸리 타이머 등을 설정합니다.
 */
@Composable
fun SettingsScreen(viewModel: MainViewModel) {
    val context = LocalContext.current
    val apiClient = remember { ApiClient(context) }

    // PIN 연동 상태
    var pinInput by remember { mutableStateOf("") }
    var pinDeviceName by remember { mutableStateOf("") }
    var isPairing by remember { mutableStateOf(false) }

    // 로컬 IP (개발 모드 전용)
    val prefs = remember { context.getSharedPreferences("OneDalPrefs", android.content.Context.MODE_PRIVATE) }
    var customIp by remember { mutableStateOf(prefs.getString("localPcIp", "172.30.1.89") ?: "172.30.1.89") }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // ── 기기 ID ──
        Text(
            text = "기기 ID: ${viewModel.deviceId}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))

        // ── 계정 연동 (PIN) ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFEDE7F6))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("🔗 계정 연동 (PIN)", fontWeight = FontWeight.Bold, color = Color(0xFF4527A0))
                Spacer(modifier = Modifier.height(8.dp))
                Text("관제 웹 대시보드에서 발급받은 6자리 PIN 번호를 입력하세요.", style = MaterialTheme.typography.bodySmall, color = Color.DarkGray)
                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = pinInput,
                    onValueChange = { if (it.length <= 6) pinInput = it },
                    label = { Text("6자리 PIN 번호") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
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
                                if (success) pinInput = ""
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

        // ── 서버 접속 환경 ──
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (viewModel.isLiveMode) "📡 실서버로 발송 중 (1dal.altari.com)" else "🏠 개발용 로컬망 전송 (아래 IP 참조)")
            Spacer(modifier = Modifier.width(16.dp))
            Switch(checked = viewModel.isLiveMode, onCheckedChange = { viewModel.saveLiveMode(context, it) })
        }

        if (!viewModel.isLiveMode) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = customIp,
                onValueChange = {
                    customIp = it
                    viewModel.saveLocalIp(context, it)
                },
                label = { Text("개발용 PC IP (기본 172.30.1.89)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp)
            )
            Text(
                "※ 실기기 연결 시 PC의 접속 IP(예: 192.168.0.x:4000)를 수동으로 입력해주세요.",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray,
                modifier = Modifier.padding(horizontal = 32.dp, vertical = 4.dp)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── 타겟 앱 선택 ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("🎯 타겟 스크래핑 앱 선택", fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = viewModel.targetApp == "인성콜",
                        onClick = { viewModel.saveTargetApp(context, "인성콜") }
                    )
                    Text("인성콜 (기본)")
                    Spacer(modifier = Modifier.width(16.dp))
                    RadioButton(
                        selected = viewModel.targetApp == "24시",
                        onClick = { viewModel.saveTargetApp(context, "24시") }
                    )
                    Text("24시 (준비중)")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── 데스밸리 타이머 설정 ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFCE4EC))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("⏱️ 데스밸리 비상 자동취소 타이머", fontWeight = FontWeight.Bold, color = Color(0xFFC2185B))
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val options = listOf(30000L to "30초", 40000L to "40초", 50000L to "50초")
                    options.forEach { (ms, label) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(
                                selected = viewModel.deathValleyTimeout == ms,
                                onClick = { viewModel.saveDeathValleyTimeout(context, ms) }
                            )
                            Text(label)
                        }
                        if (ms != 50000L) Spacer(modifier = Modifier.width(8.dp))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── 접근성 설정 열기 ──
        Button(onClick = {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            context.startActivity(intent)
        }) {
            Text(stringResource(id = R.string.btn_open_accessibility_settings))
        }
    }
}
