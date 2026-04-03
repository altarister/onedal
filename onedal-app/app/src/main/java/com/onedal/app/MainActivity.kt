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
                        
                        // 기기 ID (자동 생성 or 기존값 표시)
                        val deviceId = remember {
                            sharedPref.getString("deviceId", null) ?: run {
                                val generated = "앱폰-${android.os.Build.MODEL.take(8)}-${(100..999).random()}"
                                sharedPref.edit().putString("deviceId", generated).apply()
                                generated
                            }
                        }
                        
                        Text(text = stringResource(id = R.string.main_title))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "기기 ID: $deviceId",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
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
