package com.onedal.app.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.onedal.app.core.FirstRunCheck

/**
 * 🩺 **점검 탭** — 줄마다 ●초록/●빨강 · 한 줄 설명 · 빨간 줄 옆 버튼 · 안내 글 자리 (판단은 `FirstRunCheck`).
 * 뷰모델이 1초마다 사실을 다시 읽으니, 설정에서 돌아오면 바로 초록으로 바뀐다.
 */
@Composable
fun CheckScreen(viewModel: MainViewModel, onOpenSettings: () -> Unit) {
    val context = LocalContext.current
    fun run(action: FirstRunCheck.Action) {
        when (action) {
            FirstRunCheck.Action.SETTINGS_TAB -> onOpenSettings()
            FirstRunCheck.Action.ACCESSIBILITY_SETTINGS -> context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            FirstRunCheck.Action.BATTERY_EXEMPT -> context.startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).setData(Uri.parse("package:${context.packageName}")))
            FirstRunCheck.Action.APP_DETAILS -> context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${context.packageName}")))
        }
    }
    fun label(action: FirstRunCheck.Action) = when (action) {
        FirstRunCheck.Action.SETTINGS_TAB -> "설정 열기"
        FirstRunCheck.Action.ACCESSIBILITY_SETTINGS -> "접근성 열기"
        FirstRunCheck.Action.BATTERY_EXEMPT -> "예외로 두기"
        FirstRunCheck.Action.APP_DETAILS -> "앱 정보"
    }

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text("🩺 첫 실행 점검", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.height(8.dp))
        FirstRunCheck.rows(viewModel.checkFacts()).forEach { row ->
            Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("●", color = if (row.ok) Color(0xFF2E7D32) else Color(0xFFD32F2F), fontSize = 18.sp)
                        Spacer(Modifier.width(8.dp))
                        Text(row.title, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        row.action2?.let { a -> OutlinedButton(onClick = { run(a) }) { Text(label(a)) }; Spacer(Modifier.width(4.dp)) }
                        row.action?.let { a -> Button(onClick = { run(a) }) { Text(label(a)) } }
                    }
                    Text(row.detail, fontSize = 13.sp)
                    if (row.guide.isNotEmpty()) Text(row.guide, fontSize = 12.sp, color = Color.Gray)
                }
            }
        }
    }
}
