package com.onedal.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 대시보드 탭 화면
 *
 * 접근성 서비스 상태, 서버 필터/통계, API 통신 로그를 표시합니다.
 */
@Composable
fun DashboardScreen(viewModel: MainViewModel) {
    val dateFormat = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    val timeString = if (viewModel.lastScrapTime > 0) dateFormat.format(Date(viewModel.lastScrapTime)) else "발송 전"

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // ── 접근성 상태 배지 ──
        Surface(
            color = if (viewModel.isServiceActive) Color(0xFFE8F5E9) else Color(0xFFFFEBEE),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                text = if (viewModel.isServiceActive) "🟢 접근성 자동화 엔진 작동 중" else "🔴 접근성 권한이 꺼져있습니다",
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                color = if (viewModel.isServiceActive) Color(0xFF2E7D32) else Color(0xFFC62828)
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── 서버 필터 상태 ──
        InfoCard(
            title = "서버 동기화 필터 상태",
            content = viewModel.getFilterDisplayText(),
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )

        Spacer(modifier = Modifier.height(16.dp))

        // ── 서버 통계 + 제어 ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("서버 통계 및 제어 상태", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF2E7D32))
                Spacer(modifier = Modifier.height(8.dp))
                Text(viewModel.getStatusDisplayText(), style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(8.dp))
                Text(viewModel.getControlDisplayText(), style = MaterialTheme.typography.bodyMedium)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // ── API 통신 로그 ──
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("📡 마지막 전송 시간: $timeString", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall, color = Color(0xFFE65100).copy(alpha = 0.7f))
                Text("📡 실시간 API 통신 로그", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF1565C0))
                Spacer(modifier = Modifier.height(8.dp))

                Text("[ /api/scrap ]", fontWeight = FontWeight.SemiBold, color = Color(0xFF0D47A1))
                Text("보낸값: ${viewModel.apiScrapReq}", style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(8.dp))
                Text("받은값: ${viewModel.apiScrapRes}", style = MaterialTheme.typography.bodySmall)

                Spacer(modifier = Modifier.height(8.dp))
                Text("[ /api/orders/confirm ]", fontWeight = FontWeight.SemiBold, color = Color(0xFF0D47A1))
                Text("보낸값: ${viewModel.apiConfirmReq}", style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(8.dp))
                Text("받은값: ${viewModel.apiConfirmRes}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

/**
 * 재사용 가능한 정보 카드
 */
@Composable
fun InfoCard(
    title: String,
    content: String,
    containerColor: Color,
    titleColor: Color = MaterialTheme.colorScheme.onSurface
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = titleColor)
            Spacer(modifier = Modifier.height(8.dp))
            Text(content, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
