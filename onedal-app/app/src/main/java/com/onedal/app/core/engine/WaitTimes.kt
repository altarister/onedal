package com.onedal.app.core.engine

import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.DispatchPluginRegistry

/**
 * ⏱️ **배차망별 대기 시간 — 서버가 정하고 원달앱은 받아 쓴다** (기사님 확정 2026-09-14 · docs/지금/배차망별_대기_시간.md)
 *
 * 기사님: *"서버가 30초란걸 알고 있고 그걸 받아서 스켄앱이 그렇게 작동해야 하는거야."*
 *
 * 예전엔 폰 안 저장소(설정 화면 30·40·50초)와 코드 숫자 30초가 따로 돌았고 서버는 몰랐다.
 *
 * 🔴 **뜻이 다른 둘이다**
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간 (안전취소)
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다**. 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
object WaitTimes {

    /** 그 배차망의 안전취소 시간 — 픽커는 안전취소가 없어 `null` */
    fun safeCancelMs(filter: FilterConfig, targetApp: String): Long? =
        DispatchPluginRegistry.get(targetApp).getSafeCancelMs(filter)

    /** 픽커 상세를(누가 열었든) 이 시간 뒤 닫고 리스트로 돌아간다 */
    fun pickerAlarmDetailMs(filter: FilterConfig): Long =
        DispatchPluginRegistry.get(TargetApp.KAKAOPICKER).getDetailBackTimeoutMs(filter)
            ?: (filter.pickerAlarmDetailSec * 1000L)
}
