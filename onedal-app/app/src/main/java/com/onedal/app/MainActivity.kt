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
                        
                        Text(text = stringResource(id = R.string.main_title))
                        Spacer(modifier = Modifier.height(32.dp))
                        
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
