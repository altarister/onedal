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
    /** 같은 기사님의 다른 등록 폰도 자동 명령인가 — 자동은 한 폰만(reviews/48 가) */
    otherAuto: boolean;
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
    /** 배차망마다 원달앱이 자동으로 확정 · 수락을 누를 수 있나 — 원달앱 플러그인 `availableModes` 와 같다(`ModeTablePairTest`) */
    networks: Record<TargetAppType, { autoContract: boolean }>;
}

export const MODE_TABLE: ModeTable = /*JSON*/{
    "situations": [
        {
            "id": "beforeReply", "say": "접근성을 막 활성화 · 서버 답을 아직 못 받음",
            "replied": false, "reachable": false, "webAttached": true, "autoLive": true, "otherAuto": false, "network": "insung",
            "phone": null,
            "running": { "AUTO": "MANUAL", "ALARM": "MANUAL", "MANUAL": "MANUAL", "SIMULATION": "MANUAL" }
        },
        {
            "id": "normal", "say": "평소 — 응답 받음 · 관제웹 붙음 · 허락 살아 있음 · 인성",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "otherAuto": false, "network": "insung",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "normalHwamul24", "say": "평소 — 화물24시",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "otherAuto": false, "network": "hwamul24",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "picker", "say": "평소와 같고 화면이 픽커 — 확정 버튼이 없어 자동이 알람으로 돈다",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "otherAuto": false, "network": "kakaopicker",
            "phone": { "AUTO": "AUTO", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "autoNotAllowed", "say": "자동 잡기 허락이 꺼짐",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": false, "otherAuto": false, "network": "insung",
            "phone": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" }
        },
        {
            "id": "noWeb", "say": "서버는 살았고 관제웹이 없음 — 로그인 대기 · 창 닫힘 · 서버 재시작 뒤 아직 안 붙음",
            "replied": true, "reachable": true, "webAttached": false, "autoLive": true, "otherAuto": false, "network": "insung",
            "phone": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "note": "결재할 관제웹이 없으면 자동으로 잡은 콜은 전부 안전취소로 끝난다 — 서버가 기사님 없이 KEEP 하는 길은 없다 · 관제앱 화면을 꺼 웹 화면 소켓이 끊긴 때도 이 줄이다(관제앱 공급 소켓 /supply 는 셈하지 않는다 · reviews/50 ④ 나)"
        },
        {
            "id": "otherAuto", "say": "같은 기사님의 다른 폰도 자동 명령 — 자동은 한 폰만(새로 자동을 누른 폰이 이기고 앞 폰은 알람으로 옮겨진다 · 이미 둘이면 둘 다 알람)",
            "replied": true, "reachable": true, "webAttached": true, "autoLive": true, "otherAuto": true, "network": "insung",
            "phone": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "running": { "AUTO": "ALARM", "ALARM": "ALARM", "MANUAL": "MANUAL", "SIMULATION": "SIMULATION" },
            "note": "두 폰이 같은 순간 함께 확정하는 일을 원리상 없앤다 — 다른 폰은 알람(소리 + 미리보기)"
        },
        {
            "id": "noReply", "say": "원달앱이 서버 응답을 못 받음 — 첫 실패 · 200 아님",
            "replied": true, "reachable": false, "webAttached": true, "autoLive": true, "otherAuto": false, "network": "insung",
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
    },
    "networks": {
        "insung": { "autoContract": true },
        "hwamul24": { "autoContract": true },
        "kakaopicker": { "autoContract": false }
    }
}/*JSON*/ as ModeTable;

/** 이 배차망에서 원달앱이 자동으로 확정할 수 있나 — 모르는 배차망은 «못 한다»(모르면 잡지 않는다 · 규칙 ④) */
export function networkCanAutoContract(network: string | undefined | null): boolean {
    return !!network && (MODE_TABLE.networks as Record<string, { autoContract: boolean } | undefined>)[network]?.autoContract === true;
}

/** 자동은 한 폰만을 가르는 데 쓰는 폰 사실 — 기기 세션에서 그대로 옮긴다 */
export interface PhoneForAuto {
    deviceId: string;
    /** 기사님 명령 */
    mode: string;
    /** 폰이 «받았다»고 보고한 모드 — 명령을 옮긴 뒤에도 폰이 아직 자동을 들고 있는지 */
    appliedMode?: string;
    /** 지금 화면의 배차망 */
    targetApp?: string;
    /** 마지막 보고 시각(ms) */
    lastSeen: number;
}

/**
 * 🔁 **지금 확정을 누를 수 있는 다른 폰이 있나** (reviews/48 가 · onedal-69 리뷰) — 낱개 사실 셋을 모두 본다.
 * ① 살아 있다(마지막 보고가 `aliveMs` 안 — 서랍 속 등록 폰 · 꺼진 옛 폰이 진짜 폰을 끌어내리지 않게)
 * ② 자동이다(명령이 자동 **또는** 아직 자동을 받았다고 보고 — 넘기는 순간 앞 폰이 알람을 받기 전까지 새 폰도 기다려 틈 0)
 * ③ 지금 배차망이 자동으로 확정할 수 있다(픽커는 수락 칸이 없다 — 계약 못 하는 폰이 계약하는 폰을 끌어내리지 않게)
 */
export function otherContractingAuto(selfId: string, phones: PhoneForAuto[], now: number, aliveMs: number): boolean {
    return phones.some(p => p.deviceId !== selfId
        && now - p.lastSeen <= aliveMs
        && (p.mode === 'AUTO' || p.appliedMode === 'AUTO')
        && networkCanAutoContract(p.targetApp));
}
