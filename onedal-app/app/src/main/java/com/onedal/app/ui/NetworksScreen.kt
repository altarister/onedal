package com.onedal.app.ui

import androidx.compose.foundation.background
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
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import java.text.NumberFormat
import java.util.Locale

/**
 * 🚚 배차망 탭 화면
 *
 * 원달이 지원하는 3대 배차망(인성데이타, 화물24시, 카카오픽커)의
 * 고유 동작 모드, 단가/알람 판정 수식, 대기 시간 및 특수 수순을
 * 배차망별로 명확하게 분리하여 보여줍니다.
 */
@Composable
fun NetworksScreen(viewModel: MainViewModel) {
    val filterConfig = viewModel.getFilterConfig()
    val filter = viewModel.getParsedFilter()
    var selectedNetwork by remember { mutableStateOf(0) } // 0: 인성, 1: 화물24시, 2: 카카오픽커

    val networkNames = listOf("인성콜", "화물24시", "카카오픽커")
    val networkIcons = listOf("🔵", "🟠", "🟡")

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // ── 1. 상단 배차망 선택 탭 (3개 분할) ──
        TabRow(
            selectedTabIndex = selectedNetwork,
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxWidth()
        ) {
            networkNames.forEachIndexed { index, name ->
                Tab(
                    selected = selectedNetwork == index,
                    onClick = { selectedNetwork = index },
                    text = {
                        Text(
                            text = "${networkIcons[index]} $name",
                            fontWeight = if (selectedNetwork == index) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 13.sp
                        )
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // ── 2. 선택된 배차망 상세 카드 ──
        when (selectedNetwork) {
            0 -> InsungDetailCard(filterConfig = filterConfig)
            1 -> Hwamul24DetailCard(filterConfig = filterConfig)
            2 -> KakaoPickerDetailCard(filterConfig = filterConfig, parsedFilter = filter)
        }

        Spacer(modifier = Modifier.height(14.dp))

        // ── 3. 3대 배차망 한눈에 비교 카드 ──
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
            shape = RoundedCornerShape(10.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = "📊 3대 배차망 동작 요약 비교",
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(8.dp))

                ComparisonRow(
                    label = "인성콜",
                    badge = "⚡ 자동잡기",
                    color = Color(0xFF1565C0),
                    desc = "거리×단가표 · 안전취소 ${filterConfig?.safeCancelSecInsung ?: 30}초 · 팝업검증"
                )
                Spacer(modifier = Modifier.height(6.dp))
                ComparisonRow(
                    label = "화물24시",
                    badge = "⚡ 자동잡기",
                    color = Color(0xFFE65100),
                    desc = "목록거리 판정 · 안전취소 ${filterConfig?.safeCancelSecHwamul24 ?: 30}초 · 24시마커"
                )
                Spacer(modifier = Modifier.height(6.dp))
                ComparisonRow(
                    label = "카카오픽커",
                    badge = "🔔 알람전용",
                    color = Color(0xFFF57F17),
                    desc = "1차 하한 ${NumberFormat.getNumberInstance(Locale.KOREA).format(filter.pickerAlarmMinFare)}원 · 2차 상단OCR · 상세복귀 ${filterConfig?.pickerAlarmDetailSec ?: 30}초"
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 1. 인성콜 상세 카드
// ─────────────────────────────────────────────────────────────
@Composable
private fun InsungDetailCard(filterConfig: com.onedal.app.models.FilterConfig?) {
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.KOREA) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF0F4F8)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // 헤더
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = "🔵", fontSize = 18.sp)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "인성데이타 (인성콜)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
                Surface(
                    color = Color(0xFFE3F2FD),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = "⚡ 자동 배차 지원",
                        color = Color(0xFF1565C0),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFD0DCE5))
            Spacer(modifier = Modifier.height(10.dp))

            // 판정 수식 & 하한
            Text(text = "💰 단가 및 수락 판정", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFF1565C0))
            Spacer(modifier = Modifier.height(4.dp))
            DetailBullet("기본 수식: 요금 ≥ 목록거리(km) × 차종별 단가(원/km) × 할인율")
            DetailBullet("최저 요금 하한: ${numberFormat.format(filterConfig?.minFare ?: 30000)}원")
            DetailBullet("수집 방식: 접근성 노드 텍스트 트리 직접 고속 파싱")

            // 차종별 단가표
            filterConfig?.ratePerKm?.takeIf { it.isNotEmpty() }?.let { rates ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "📋 서버 연동 차종별 단가표 (원/km)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall, color = Color(0xFF37474F))
                Spacer(modifier = Modifier.height(4.dp))
                RatesGrid(rates = rates)
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFD0DCE5))
            Spacer(modifier = Modifier.height(10.dp))

            // 안전 규칙 & 특수 수순
            Text(text = "⏱️ 안전 대기 & 특수 수순", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFF1565C0))
            Spacer(modifier = Modifier.height(4.dp))
            DetailBullet("안전취소 시간: ${filterConfig?.safeCancelSecInsung ?: 30}초 (오잡기 즉시 안전 취소)")
            DetailBullet("인성 고유 수순: 상세 진입 시 요율표·거리·동명이동 팝업 3장 연속 수집 및 검증")
            DetailBullet("패키지 식별: insung 키워드 포함 앱 감지")
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 2. 화물24시 상세 카드
// ─────────────────────────────────────────────────────────────
@Composable
private fun Hwamul24DetailCard(filterConfig: com.onedal.app.models.FilterConfig?) {
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.KOREA) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8F0)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // 헤더
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = "🟠", fontSize = 18.sp)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "화물24시 (24시콜)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
                Surface(
                    color = Color(0xFFFFE0B2),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = "⚡ 자동 배차 지원",
                        color = Color(0xFFE65100),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFFFE0B2))
            Spacer(modifier = Modifier.height(10.dp))

            // 판정 수식 & 하한
            Text(text = "💰 단가 및 수락 판정", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFFE65100))
            Spacer(modifier = Modifier.height(4.dp))
            DetailBullet("기본 수식: 요금 ≥ 목록거리(km) × 차종별 단가(원/km)")
            DetailBullet("최저 요금 하한: ${numberFormat.format(filterConfig?.minFare ?: 30000)}원")
            DetailBullet("수집 방식: 접근성 노드 텍스트 트리 직접 고속 파싱")

            // 차종별 단가표
            filterConfig?.ratePerKm?.takeIf { it.isNotEmpty() }?.let { rates ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "📋 서버 연동 차종별 단가표 (원/km)", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall, color = Color(0xFF37474F))
                Spacer(modifier = Modifier.height(4.dp))
                RatesGrid(rates = rates)
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFFFE0B2))
            Spacer(modifier = Modifier.height(10.dp))

            // 안전 규칙 & 특수 수순
            Text(text = "⏱️ 안전 대기 & 특수 수순", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFFE65100))
            Spacer(modifier = Modifier.height(4.dp))
            DetailBullet("안전취소 시간: ${filterConfig?.safeCancelSecHwamul24 ?: 30}초 (오잡기 즉시 안전 취소)")
            DetailBullet("패키지 식별: logione, carrier 키워드 포함 앱 감지")
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 3. 카카오픽커 상세 카드
// ─────────────────────────────────────────────────────────────
@Composable
private fun KakaoPickerDetailCard(
    filterConfig: com.onedal.app.models.FilterConfig?,
    parsedFilter: MainViewModel.ParsedFilter
) {
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.KOREA) }
    val formattedAlarmFare = numberFormat.format(parsedFilter.pickerAlarmMinFare)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFDE7)),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // 헤더
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = "🟡", fontSize = 18.sp)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "카카오 T 픽커", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                }
                Surface(
                    color = Color(0xFFFFF59D),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = "🔔 수집·알람 전용",
                        color = Color(0xFFF57F17),
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFFFF176))
            Spacer(modifier = Modifier.height(10.dp))

            // 픽커 2단계 정밀 판정 로직 강조 박스
            Surface(
                color = Color(0xFFFFF8E1),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(10.dp)) {
                    Text(
                        text = "🎯 픽커 고유 2단계 필터링 체계",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.labelMedium,
                        color = Color(0xFFE65100)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "• 1단계 (목록 수집): 요금 ≥ ${formattedAlarmFare}원 (콜할인율 연동 자동 하한)\n" +
                               "  → 걷기/소액 초단거리 똥콜 1차 원천 차단\n" +
                               "• 2단계 (상세 확인): 상단 스냅샷 OCR 배송거리 판정\n" +
                               "  → 요금 ≥ OCR 배송거리(km) × 단가표 기준 충족 시 알람",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                        color = Color(0xFF4E342E)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // 세부 설정
            Text(text = "⏱️ 시간 & 안전 규칙", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = Color(0xFFF57F17))
            Spacer(modifier = Modifier.height(4.dp))
            DetailBullet("안전취소: 🚫 미지원 (픽커는 기사 직접 수락 시 즉시 계약 체결)")
            DetailBullet("상세 복귀 대기: ${filterConfig?.pickerAlarmDetailSec ?: 30}초 (상세 머문 후 목록 자동 복귀)")
            DetailBullet("차종 처리: 픽커는 크기 구분만 있으므로 [${KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE} (${KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG})] 기준 단가 적용")
            DetailBullet("화면 판독: 주소가 노드 트리에 없어 상단 스냅샷 OCR(PickerDetailOcrParser) 탑재")
            DetailBullet("패키지 식별: flexer 키워드 포함 앱 감지")
        }
    }
}

// ─────────────────────────────────────────────────────────────
// 공통 컴포넌트
// ─────────────────────────────────────────────────────────────

@Composable
private fun DetailBullet(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(text = "• ", style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), fontWeight = FontWeight.Bold)
        Text(text = text, style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp))
    }
}

@Composable
private fun RatesGrid(rates: Map<String, Int>) {
    val numberFormat = remember { NumberFormat.getNumberInstance(Locale.KOREA) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.7f), RoundedCornerShape(6.dp))
            .padding(8.dp),
        horizontalArrangement = Arrangement.SpaceAround
    ) {
        rates.entries.take(4).forEach { (vehicle, rate) ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = vehicle, style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), color = Color.Gray)
                Text(
                    text = "${numberFormat.format(rate)}원",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp)
                )
            }
        }
    }
}

@Composable
private fun ComparisonRow(label: String, badge: String, color: Color, desc: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            color = color.copy(alpha = 0.15f),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = badge,
                color = color,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
        Spacer(modifier = Modifier.width(6.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
            Text(text = desc, style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
