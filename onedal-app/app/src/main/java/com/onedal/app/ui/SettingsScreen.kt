package com.onedal.app.ui

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.onedal.app.R
import com.onedal.app.api.ApiClient

/**
 * 설정 탭 화면
 *
 * PIN 연동, 서버 환경, 안전 대기 시간, 디버그 터치 마커 토글 및 접근성 설정을 제공합니다.
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
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // ── 상단 기기 ID 배지 ──
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
            modifier = Modifier.padding(top = 4.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "📱 기기 식별자: ",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = viewModel.deviceId,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold
                    ),
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }

        // ── 카드 1: 관제 계정 연동 (PIN) ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFFF6F4FE)
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "🔗 관제 계정 연동 (PIN)",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF3F2B96)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "관제 웹 대시보드(설정)에서 발급받은 6자리 PIN을 입력하여 기기를 등록하세요.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF5E548E),
                    lineHeight = 18.sp
                )
                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = pinInput,
                    onValueChange = { if (it.length <= 6) pinInput = it },
                    label = { Text("6자리 PIN 번호") },
                    placeholder = { Text("123456") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = pinDeviceName,
                    onValueChange = { pinDeviceName = it },
                    label = { Text("기기 별명 (선택)") },
                    placeholder = { Text("예: 픽커전용 A24") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
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
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF5E35B1)
                    ),
                    enabled = !isPairing
                ) {
                    Text(
                        text = if (isPairing) "연동 처리 중..." else "기기 연동하기",
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // ── 카드 2: 서버 접속 환경 ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "🌐 서버 접속 환경",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (viewModel.isLiveMode) "실서버 (운영)" else "로컬 개발망",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = if (viewModel.isLiveMode) "1dal.altari.com (운영 클라우드)" else "개발 PC IP 직접 연결",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = viewModel.isLiveMode,
                        onCheckedChange = { viewModel.saveLiveMode(context, it) }
                    )
                }

                if (!viewModel.isLiveMode) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = customIp,
                        onValueChange = {
                            customIp = it
                            viewModel.saveLocalIp(context, it)
                        },
                        label = { Text("개발용 PC IP:포트") },
                        placeholder = { Text("172.30.1.89:4000") },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "※ 개발용 로컬 서버 IP 및 포트를 입력하세요.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }
        }

        // ── 카드 3: 안전 대기 시간 정보 ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = Color(0xFFFFF7ED)
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "⏱️ 배차망별 안전 대기 시간",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFC2410C)
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = viewModel.waitTimesLabel,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF7C2D12),
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "※ 대기 시간 기준은 관제웹 [⚙️ 설정 → 일반 설정]에서 안전하게 변경됩니다.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF9A3412).copy(alpha = 0.8f)
                )
            }
        }

        // ── 카드 4: 디버그 및 모니터링 (TapMarker 토글) ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text(
                    text = "🛠️ 디버깅 도구",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f).padding(end = 8.dp)) {
                        Text(
                            text = "화면 터치 위치 표시 (TapMarker)",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = if (viewModel.showTapMarker) {
                                "클릭한 위치에 붉은 점 자국을 표시합니다."
                            } else {
                                "터치 표시 끔 (실전 0ms 최고 반응속도 유지)"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (viewModel.showTapMarker) Color(0xFFDC2626) else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = viewModel.showTapMarker,
                        onCheckedChange = { viewModel.saveShowTapMarker(context, it) }
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "※ 실전 주행 및 야간 알람 시에는 잔상과 딜레이 방지를 위해 끄는 것(OFF)을 권장합니다.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }

        // ── 버튼: 시스템 접근성 설정 바로가기 ──
        OutlinedButton(
            onClick = {
                val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                context.startActivity(intent)
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = "⚙️ " + stringResource(id = R.string.btn_open_accessibility_settings),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
