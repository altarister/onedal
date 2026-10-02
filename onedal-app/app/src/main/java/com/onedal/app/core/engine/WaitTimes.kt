package com.onedal.app.core.engine

import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.DispatchPluginRegistry

/**
 * ⏱️ **배차망별 대기 시간 — 서버가 정하고 원달앱은 받아 쓴다** (기사님 확정)
 *
 * 기사님: *"서버가 30초란걸 알고 있고 그걸 받아서 스켄앱이 그렇게 작동해야 하는거야."*
 *
 * 값의 원천은 서버 하나다 — 폰 안 저장소나 코드 숫자에 따로 두면 서버가 모르는 값이 된다.
 *
 * 🔴 **뜻이 다른 둘이다**
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간 (안전취소)
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다**. 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
object WaitTimes {

    /** 그 배차망의 안전취소 시간 — 픽커는 안전취소가 없어 `null` */
    fun safeCancelMs(filter: FilterConfig, targetApp: String): Long? =
        DispatchPluginRegistry.get(targetApp).getSafeCancelMs(filter)

    /**
     * ↩️ **상세에서 목록으로 돌아오는 시간** — 지금 배차망의 상세 대기 시간, 없으면 안전취소 시간 (기사님 확정).
     * 픽커는 안전취소가 없어 상세 대기 시간으로 채운다. 안전취소 시간이 두 질문의 답이 되는 것은 기사님 확정이다(배차망_모드표.md).
     */
    fun detailBackMs(filter: FilterConfig, targetApp: String): Long {
        val plugin = DispatchPluginRegistry.get(targetApp)
        return plugin.getDetailBackTimeoutMs(filter) ?: plugin.getSafeCancelMs(filter) ?: pickerAlarmDetailMs(filter)
    }

    /** 상세 대기 설정값(서버 DB `picker_alarm_detail_sec`) — 상세 대기도 안전취소도 없는 배차망의 마지막 대체값 */
    fun pickerAlarmDetailMs(filter: FilterConfig): Long = filter.pickerAlarmDetailSec * 1000L
}
