import type { DeviceModeType, TargetAppType } from './index';

/**
 * 🎛️ **네 모드 표 — 한 곳** (reviews/44 · 기사님 «모든 상황에 대처할 수 있도록 표를 만들어 검수 코드에도 사용하자»).
 * 모드는 두 걸음으로 정해진다 — `situations`(기사님이 누른 단추 × 상황 → 원달앱이 실제로 도는 모드) · `acts`(도는 모드 → 원달앱이 하는 일 · 보이는 것).
 * 🔴 **원천이다 — 여기를 고친다.** 서버 쪽은 shared `modeTable.test.ts` 가 `modeForPhone` · `DEVICE_MODE_LABEL` 과 견주고,
 *    원달앱 쪽은 `ModeTablePairTest` 가 같은 표를 읽어 원달앱 함수와 견준다 — 한쪽만 고치면 그쪽 검사가 빨갛다.
 * 겹치면 «덜 자동» 쪽이 이긴다 — 자동을 알람으로 내릴 까닭이 하나라도 있으면 알람. 저장된 명령은 어느 줄에서도 안 바뀐다.
 * 줄마다 사실이 다르다 — 같은 사실의 설명용 줄을 두지 않는다. 빈틈: 관제웹 탭이 소리 없이 죽으면 서버는 소켓이 끊겼다고 알기까지(socket.io 기본값 · 최대 약 45초) `webAttached` 를 true 로 본다 — 그동안은 «평소» 줄대로 돈다(기사님 «그대로» · 운행 중에는 관제앱을 켜 둔다).
 * 몸통은 JSON 표시 주석 둘(별표 주석 «JSON») 사이의 엄격한 JSON 이다 — 원달앱 검사가 그 사이를 그대로 읽는다. 표시를 지우지 않는다.
 */
export interface ModeSituation {
    id: string;
    /** 기사님 말로 그 상황 */
    say: string;
    /** 원달앱이 서버 답을 한 번이라도 받았나 */
    replied: boolean;
    /** 원달앱의 마지막 보고가 서버에 닿았나(200) */
    reachable: boolean;
    /** 서버가 보는 «이 기사의 관제웹 소켓이 붙어 있나» */
    webAttached: boolean;
    /** 자동 잡기 허락이 살아 있나 */
    autoLive: boolean;
    /** 지금 화면의 배차망 */
    network: TargetAppType;
    /** 서버가 보고 응답에 내려주는 모드(명령마다) — 응답이 없는 줄은 null */
    phone: Record<DeviceModeType, DeviceModeType> | null;
    /** 원달앱이 실제로 도는 모드(명령마다) */
    running: Record<DeviceModeType, DeviceModeType>;
    /** 한 줄 덧말 */
    note?: string;
}

export interface ModeActs {
    /** 목록에서 통과 콜(요금 최고 하나)을 누르나 */
    tapsList: boolean;
    /** 통과 콜에 소리 · 진동을 내나 */
    sound: boolean;
    /** 원달앱이 확정 · 수락을 누를 수 있나(오늘 콜 · 확정 버튼 있는 배차망일 때) */
    contracts: boolean;
    /** 확정 · 수락 누르기 자체를 막나 */
    blocksAccept: boolean;
    /** 원달앱 테두리 색(ARGB 16진) */
    frame: string;
    /** 관제웹 단추 글자 */
    label: string;
}

export interface ModeTable {
    situations: ModeSituation[];
    acts: Record<DeviceModeType, ModeActs>;
}

export const MODE_TABLE: ModeTable = /*JSON*/{
    "situations": [
        {
            "id": "beforeReply", "say": "접근성을 막 활성화 · 서버 답을 아직 못 받음",
            "replied": false, "reachable": false, "webAttached": true, "autoLive": true, "network": "insung",
            "phone": null,
            "running": { "AUTO": "MANUAL", "ALARM": "MANUAL", "MANUAL": "MANUAL", "SIMULATION": "MANUAL" }
        },
        {
            "id": "normal", "say": "평소 — 응답 받음 · 관제웹 붙음 · 허락 살아 있음 · 인성",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "network": "insung",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "normalHwamul24", "say": "평소 — 화물24시",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "network": "hwamul24",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "picker", "say": "평소와 같고 화면이 픽커 — 확정 버튼이 없어 자동이 알람으로 돈다",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "network": "kakaopicker",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "autoNotAllowed", "say": "자동 잡기 허락이 꺼짐",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": false, "network": "insung",
            "phone": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "noWeb", "say": "서버는 살았고 관제웹이 없음 — 로그인 대기 · 창 닫힘 · 서버 재시작 뒤 아직 안 붙음",
            "replied": true, "reachable": true, "webAttached": false, "autoLive": true, "network": "insung",
            "phone": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "note": "결재할 관제웹이 없으면 자동으로 잡은 콜은 전부 안전취소로 끝난다 — 서버가 기사님 없이 KEEP 하는 길은 없다"
        },
        {
            "id": "noReply", "say": "원달앱이 서버 응답을 못 받음 — 첫 실패 · 200 아님",
            "replied": true, "reachable": false, "webAttached": true, "autoLive": true, "network": "insung",
            "phone": null,
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "note": "다음 200 응답에서 서버 모드로 돌아온다"
        }
    ],
    "acts": {
        "AUTO":       { "tapsList": true,  "sound": false, "contracts": true,  "blocksAccept": false, "frame": "FF1D4ED8", "label": "자동" },
        "ALARM":      { "tapsList": true,  "sound": true,  "contracts": false, "blocksAccept": false, "frame": "FF22C55E", "label": "알람" },
        "MANUAL":     { "tapsList": false, "sound": false, "contracts": false, "blocksAccept": false, "frame": "FF64748B", "label": "직접" },
        "SIMULATION": { "tapsList": true,  "sound": false, "contracts": false, "blocksAccept": true,  "frame": "FFF59E0B", "label": "체험" }
    }
}/*JSON*/ as ModeTable;
