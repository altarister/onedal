package com.onedal.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.onedal.app.core.AppInfo
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 대시보드 탭 화면
 *
 * 스크롤 없이 한 화면에서 접근성 상태, 실시간 필터(픽커 알람 하한 요금 포함),
 * 서버 통계/제어 상태를 확인하고, 상세 API 원시 로그는 필요 시 펼쳐볼 수 있습니다.
 */
@Composable
fun DashboardScreen(viewModel: MainViewModel) {
    val dateFormat = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    val timeString = if (viewModel.lastScrapTime > 0) dateFormat.format(Date(viewModel.lastScrapTime)) else "대기"
    val filter = viewModel.getParsedFilter()
    var showRawLogs by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // ── 1. 상단 상태 바 (배지 2개 한 줄) ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                color = if (viewModel.isServiceActive) Color(0xFFE8F5E9) else Color(0xFFFFEBEE),
                shape = RoundedCornerShape(6.dp)
            ) {
                Text(
                    text = if (viewModel.isServiceActive) "🟢 엔진 작동 중" else "🔴 엔진 정지됨",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = if (viewModel.isServiceActive) Color(0xFF2E7D32) else Color(0xFFC62828)
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "📦 ${AppInfo.versionLabel(LocalContext.current)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "📡 $timeString",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFF1565C0)
                )
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // ── 2. 핵심: 픽커 알람 & 서버 필터 카드 ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "🎯 실시간 배차 & 알람 필터",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary
                )

                Spacer(modifier = Modifier.height(8.dp))

                // ⭐ 픽커 알람 요금 하한 하이라이트 박스 (콜할인율 연동)
                Surface(
                    color = Color(0xFFFFF3E0),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "🔔 픽커 알람 요금 하한",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color(0xFFE65100),
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "콜할인율 연동 자동 계산",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                color = Color(0xFF8D6E63)
                            )
                        }
                        Text(
                            text = if (filter.pickerAlarmMinFare == 0) "0원 (전부 허용)"
                                   else "${NumberFormat.getNumberInstance(Locale.KOREA).format(filter.pickerAlarmMinFare)}원",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black),
                            color = if (filter.pickerAlarmMinFare == 0) Color(0xFF2E7D32) else Color(0xFFD84315)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // 필터 상세 정보 (2열 컴팩트)
                Row(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        FilterLabelValue(label = "차종", value = filter.allowedVehicles)
                        Spacer(modifier = Modifier.height(4.dp))
                        val radiusStr = if (filter.pickupRadiusKm > 0) String.format(Locale.KOREA, "%.1fkm", filter.pickupRadiusKm) else "미설정"
                        FilterLabelValue(label = "상차반경", value = radiusStr)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        FilterLabelValue(label = "도착목표", value = "${filter.destinationCity} (${filter.destKeywordsCount}개)")
                        Spacer(modifier = Modifier.height(4.dp))
                        FilterLabelValue(label = "제외단어", value = "${filter.excludedKeywordsCount}개 등록")
                    }
                }

                if (filter.waitTimes.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "⏱️ ${filter.waitTimes}",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // ── 3. 서버 통계 & 기기 제어 카드 ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
            shape = RoundedCornerShape(10.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("서버 통계 및 제어", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFF2E7D32))
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(viewModel.getStatusDisplayText().replace("\n", " · "), style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp))
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(viewModel.getControlDisplayText(), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // ── 4. API 통신 로그 (접이식 아코디언 — 기본 접힘으로 스크롤 방지) ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD)),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { showRawLogs = !showRawLogs },
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "📡 실시간 API 통신 로그",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFF1565C0)
                    )
                    Text(
                        text = if (showRawLogs) "▲ 닫기" else "▼ 디버그 로그 펼치기",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFF0D47A1),
                        fontWeight = FontWeight.Bold
                    )
                }

                if (showRawLogs) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("[ /api/scrap ]", fontWeight = FontWeight.SemiBold, color = Color(0xFF0D47A1), style = MaterialTheme.typography.labelSmall)
                    Text("보낸값: ${viewModel.apiScrapReq}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp))
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("받은값: ${viewModel.apiScrapRes}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp))

                    Spacer(modifier = Modifier.height(8.dp))
                    Text("[ /api/orders/confirm ]", fontWeight = FontWeight.SemiBold, color = Color(0xFF0D47A1), style = MaterialTheme.typography.labelSmall)
                    Text("보낸값: ${viewModel.apiConfirmReq}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp))
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("받은값: ${viewModel.apiConfirmRes}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp))
                }
            }
        }
    }
}

@Composable
private fun FilterLabelValue(label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = "$label: ",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
            fontWeight = FontWeight.Medium
        )
    }
}
