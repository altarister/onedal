package com.onedal.app.ui

import android.content.Intent
import android.provider.Settings
import android.widget.Toast
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
import com.onedal.app.core.TargetApp

/**
 * 설정 탭 화면
 *
 * PIN 연동, 서버 환경, 안전취소 타이머 등을 설정합니다. (배차망 선택 칸은 2026-09-14 에 지웠다 — 화면 글자로 안다)
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

        // 🖥️ 배차망 선택 칸은 지웠다 (기사님 확정 2026-09-14) — 스캔앱이 화면 글자로 배차망을 알고,
        //    알아낸 배차망은 관제앱 폰 영역 배지로 본다 (docs/기획/원달앱_시뮬레이터_낱말사전_정리.md ③)

        // ── 안전취소 타이머 설정 ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFCE4EC))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // ⏱️ 폰에서 고르지 않는다 — 원천은 서버 DB, 고치는 곳은 관제웹 ⚙️ 설정 → 일반 설정 (docs/지금/배차망별_대기_시간.md)
                Text("⏱️ 대기 시간 (서버에서 받음)", fontWeight = FontWeight.Bold, color = Color(0xFFC2185B))
                Spacer(modifier = Modifier.height(4.dp))
                Text(viewModel.waitTimesLabel)
                Text("고치는 곳: 관제웹 ⚙️ 설정 → 일반 설정", color = Color.Gray)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── 테스트 가상 콜 화면 열기 ──
        // 🧪 배차망 시뮬레이터 앱을 켠다 (2026-09-14). 예전엔 브라우저로 옛 주소를 열었는데 거기는
        //    다른 프로젝트의 지도 게임이다. 그리고 브라우저로 연 시뮬레이터는 원달앱이 글자를 못 읽는다.
        Button(onClick = {
            val intent = context.packageManager.getLaunchIntentForPackage(TargetApp.SIMULATOR_PACKAGE)
            if (intent != null) context.startActivity(intent)
            else Toast.makeText(context, "배차망 시뮬레이터 앱이 설치되어 있지 않습니다", Toast.LENGTH_LONG).show()
        }) {
            Text("테스트 가상 콜 화면 열기")
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
