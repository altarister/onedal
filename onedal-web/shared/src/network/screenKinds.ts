/**
 * 화면 상태 종류
 * 누가: 서버 기기 세션 · 위치 보고
 * 언제: 원달앱이 지금 어느 화면인지 보고할 때
 * 어디서: 서버의 기기 상태 자리
 * 무엇을: 보내는 화면 값 목록 REPORTED_SCREENS · 화면 칸 셋 모양 ScreenReport · 목록 · 상세 · 잠깐 뜨는 화면 묶음과 screenNowOf
 * 어떻게: 종류 묶음을 상수로 두고 함수로 묻는다
 * 왜: 화면 종류마다 할 일을 사실로 가르기 위해서다
 */
import { STANDARD_SCREENS, listReturnOf, landsAfterAcceptOf } from './networkPages';

/**
 * 🛡️ **원달앱이 서버로 보내는 화면 값** — 우리 기준 페이지(`STANDARD_SCREENS`) + 배차망 밖 바탕화면 · 모름.
 * 팝업 · 목록 복귀 같은 원달앱 안 값은 보내지 않는다 — 덧칸 이름(`screenOverlay`)과 페이지 이름(`screenPage`)이 따로 간다.
 */
export const REPORTED_SCREENS = [...STANDARD_SCREENS, 'LAUNCHER', 'UNKNOWN'] as const;
export type ScreenContextType = typeof REPORTED_SCREENS[number];

/**
 * 🔴 **"콜에서 손을 뗀 화면"의 정의 — 여기 하나뿐이다.**
 *
 * 완료 탭은 `MY_ORDERS` + 정의 표 `listReturn` 으로 목록 복귀다(`isListScreen` 아래 줄) — 원달앱도 같은 칸으로 세션을 리셋한다.
 * 서버가 하나만 인정하면 **앱은 다음 콜을 찾는데 서버는 그 콜을 계속 쥐어**, 결재 카드가 영원히 남고
 * 콜 잡기가 멈춘다. 같은 판단을 두 곳에서 따로 정의하면 갈라진다 — 화면이 늘어나면 **이 배열에만** 넣는다.
 */
export const LIST_SCREENS: readonly ScreenContextType[] = ['LIST'];

/**
 * 🖐️ **이 화면이 «잡은 콜을 놓았다»를 뜻하나 — 목록 복귀이되, 배차망이 수락 뒤 스스로 보내는 페이지는 아니다** (38 F42).
 * 화물24시는 «신청» 뒤 같은 화면의 «배차내역»을 누르면 «배차내역 목록»으로 간다 — 계약한 화면이지 놓은 화면이 아니다(표의 `landsAfterAccept`).
 * 인성 «완료 탭»은 기사님이 손으로 가는 목록이라 놓음이다. 서버 목록 이탈 유예가 쓴다 · 미리보기 정리 · 목록 복귀 알림은 `isListScreen` 그대로.
 */
export function isLetGoScreen(screenContext?: string | null, targetApp?: string | null, screenPage?: string | null): boolean {
    return isListScreen(screenContext, targetApp, screenPage) && !landsAfterAcceptOf(targetApp, screenPage);
}

/** 지금 화면이 "콜에서 손을 뗀" 상태인가 (= 서버가 쥐고 있던 콜을 놓아도 되는가) */
export function isListScreen(screenContext?: string | null, targetApp?: string | null, screenPage?: string | null): boolean {
    if (!screenContext) return false;
    if ((LIST_SCREENS as readonly string[]).includes(screenContext)) return true;
    /* 📋 새 원달앱은 «내 오더» 하나로 보내고 페이지 이름을 싣는다 — 목록 복귀인가는 배차망 정의 표의 사실 */
    return screenContext === 'MY_ORDERS' && listReturnOf(targetApp, screenPage);
}

/**
 * 🔎 **«상세를 보고 있는 화면» — 여기 하나뿐이다** (기사님 확정: *"미리보기 판정을 연 스캔폰의 상태값이
 *    상세페이지일 때만 노출하고 페이지를 이탈하면 끈다"*).
 *
 * 🔴 **양의 목록으로 적는다.** «목록도 모름도 아니면 상세»로 뒤집어 재면 `HOME` · `MY_ORDERS` ·
 *    운행 화면(`RUN_*`)까지 상세가 된다 — 수락한 뒤 화면인데 미리보기가 계속 떠 있게 된다.
 * 🔴 **팝업은 상세를 떠난 것이 아니다.** 인성은 상세 위에 적요 · 출발지 · 도착지 팝업을 띄워 훑는다
 *    (`DetailCollectMachine`). 원달앱이 팝업 위에서도 상세 페이지 값을 보낸다 — 팝업 이름은 덧칸 이름으로 간다.
 */
export const DETAIL_SCREENS: readonly ScreenContextType[] = ['DETAIL_PRE_CONFIRM', 'DETAIL_CONFIRMED'];

/**
 * ⏳ **스치는 화면** — 상세도 이탈도 아직 아니다. 이어진 시간이 `UNKNOWN_LEAVE_SEC` 를 넘어야 이탈로 본다(서버 `devices.leftDetail`).
 * 알 수 없는 화면은 카드를 여는 순간 잠깐 끼고, 넘어가는 중은 콜을 누른 직후 0.3~0.7초 보인다.
 */
export const BLIP_SCREENS: readonly ScreenContextType[] = ['UNKNOWN', 'TRANSITION'];

/** 지금 화면이 스치는 화면인가 (`BLIP_SCREENS`) */
export function isBlipScreen(screenContext?: string | null): boolean {
    return !!screenContext && (BLIP_SCREENS as readonly string[]).includes(screenContext);
}

/** 지금 화면이 상세 계열인가 (`DETAIL_SCREENS`) — `UNKNOWN` 은 «모름»이라 여기서 거짓이다 */
export function isDetailScreen(screenContext?: string | null): boolean {
    return !!screenContext && (DETAIL_SCREENS as readonly string[]).includes(screenContext);
}

/**
 * 📵 **끊긴 폰의 화면은 «지금»이 아니다 — 말하지 않는다** (기사님 지시: *"페이지를 모르는 것 상위에
 *    상태가 노출되면 모순이 사라진다"*).
 *
 * 마지막으로 들은 화면 이름은 «아까 그것»이다. 그대로 쓰면 전원이 나간 폰이 영영 «상세»로 남아
 * 미리보기 심사석이 안 꺼진다. 표시(`screenLabels.deviceScreenBadge`)는 이미 이 층위를 지킨다 —
 * 판정도 **같은 함수**를 봐야 두 벌이 안 된다 (규칙 ③).
 */
export function screenNowOf(device: { status?: string | null; screenContext?: ScreenContextType | null }): ScreenContextType | null {
    if (device.status === 'OFFLINE') return null;
    return device.screenContext ?? null;
}

/** 🧭 **화면 칸 셋** — 원달앱이 보고마다 싣는 화면 값 · 배차망 페이지 이름 · 그 위에 뜬 것(덧칸) 이름 */
export interface ScreenReport {
    screenContext: ScreenContextType | null;
    screenPage: string | null;
    screenOverlay: string | null;
}

/** 보고 몸에서 화면 칸 셋을 꺼낸다 — 글자가 아니거나 보내는 값 목록(`REPORTED_SCREENS`) 밖이면 null */
export function screenReportOf(body: unknown): ScreenReport {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
    const context = text(b.screenContext);
    return {
        screenContext: context !== null && (REPORTED_SCREENS as readonly string[]).includes(context) ? context as ScreenContextType : null,
        screenPage: text(b.screenPage),
        screenOverlay: text(b.screenOverlay),
    };
}
