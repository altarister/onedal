import { TARGET_APP_LABEL, DEVICE_OFFLINE_LABEL } from './index';
import type { ScreenContextType, TargetAppType, DeviceOfflineReason } from './index';

/**
 * 🏷️ **화면 이름표 — 배차망마다 따로 둔다** (기사님 설계).
 *
 * 기사님: *"`SCREEN_LABELS` 가 인성·픽커·화물24 이렇게 따로따로 있어야 할 것 같아.
 * 이 파일에 있으면 안 되고, 각 라벨들을 import 해 와서 가지고 있다가
 * **망에 따라 바꿔서 보일 수 있도록** 해야 할 것 같은데."*
 *
 * ── 왜 가르나 ──
 * 이름표가 한 벌이면 한 배차망의 화면만 담긴다. 픽커의 운행 화면처럼 갈 자리가 없는 화면은
 * **«알 수 없는 화면»(빨간 깜빡임)** 으로 뜬다.
 *
 * ── 왜 `client-app` 이 아니라 `shared` 인가 ──
 * 관제웹만 쓰는 것이 아니다 — 운행일지도 «어느 화면이었나»를 보여 줄 수 있고, 서버가
 * 로그에 찍을 수도 있다. `client-app` 안에 두면 나중에 두 벌이 된다 (규칙 ③).
 * 배차망 상수(`TARGET_APP_LABEL`)가 이미 `shared` 에 있는 것과 같은 이유다.
 *
 * ── 색의 뜻 (기사님 확정) ──
 * **이동은 파랑 · 도착은 초록.** 먼발치에서 1~2초에 «가는 중인가 닿았는가»가 읽혀야 한다
 * (규칙 ⑤-3 · 「운전 중에는 입력을 못 한다」와 같은 결).
 */

export interface ScreenLabel {
    label: string;
    color: string;
}

const GREEN = "text-success bg-success/15 border-success/20";
const BLUE = "text-info bg-info/15 border-info/20";
const AMBER = "text-warning bg-warning/15 border-warning/20";
const PURPLE = "text-accent-alt bg-accent-alt/15 border-accent-alt/20";
const RED_BLINK = "text-danger bg-danger/20 animate-pulse border-danger/30";
/** 🏠 «일을 안 잡고 있다» — 색으로 눈을 끌지 않는다. 파랑·초록은 «일하는 중»의 몫이다 */
const GRAY = "text-text-muted bg-text-muted/15 border-text-muted/20";

/** 어느 배차망에도 있는 화면 — 이름이 같으면 여기서 한 번만 적는다 */
const COMMON: Partial<Record<ScreenContextType, ScreenLabel>> = {
    LIST: { label: "콜 리스트", color: GREEN },
    // 완료 리스트도 "콜에서 손을 뗀" 화면이다 — 앱이 여기로 빠져나가면 서버가 콜을 놓는다.
    // 이 값이 shared 타입에 있어야 서버·관제웹이 읽는다 — 빠지면 앱만 보내고 아무도 못 읽어 유령 카드가 남는다
    LIST_COMPLETED: { label: "완료 리스트", color: GREEN },
    UNKNOWN: { label: "⚠️ 미등록 팝업", color: RED_BLINK },
    LAUNCHER: { label: "바탕화면 (홈)", color: GRAY },
    OTHER_APP: { label: "기타 앱 (배차망 밖)", color: AMBER },
};

/** 🏢 인성콜 — 잡는 수순이 곧 화면이다. 진행은 GPS 가 답한다 */
export const INSUNG_SCREEN_LABELS: Partial<Record<ScreenContextType, ScreenLabel>> = {
    ...COMMON,
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: BLUE },
    DETAIL_CONFIRMED: { label: "확정페이지", color: AMBER },
    POPUP_PICKUP: { label: "출발지 팝업", color: BLUE },
    POPUP_DROPOFF: { label: "도착지 팝업", color: BLUE },
    POPUP_MEMO: { label: "적요 팝업", color: PURPLE },
    POPUP_ERROR: { label: "취소 불가 팝업", color: RED_BLINK },
};

/** 🚚 화물24시 — 아직 인성과 같은 모양으로 둔다 (실물로 갈라지면 그때 고친다) */
export const HWAMUL24_SCREEN_LABELS: Partial<Record<ScreenContextType, ScreenLabel>> = {
    ...INSUNG_SCREEN_LABELS,
};

/**
 * 🌐 카카오T픽커 — **수락 뒤의 운행 화면이 있다.** 인성에 없는 축이다.
 *
 * 🔴 **낱말은 픽커 화면 그대로 쓴다** (기사님 확정 · «픽커 말 그대로»).
 *    폰 화면에 「픽업 완료해주세요」라고 떠 있는데 관제웹이 «상차지 도착»이라 하면
 *    폰과 화면을 대조할 때 한 번 더 옮겨 생각해야 한다. 배지 앞에 「픽커」가 이미
 *    붙으므로 어느 배차망의 말인지도 헷갈리지 않는다.
 *
 * ⚠️ 픽커에는 인성식 팝업(출발지·도착지·적요)이 **없다** — 그래서 그 셋을 안 적는다.
 *    빠진 화면은 `screenLabelOf` 가 «알 수 없는 화면»으로 답한다.
 */
export const PICKER_SCREEN_LABELS: Partial<Record<ScreenContextType, ScreenLabel>> = {
    ...COMMON,
    /**
     * 🏠 「시작하기」 버튼이 있는 화면 (기사님 확정 · *"'시작하기' 이 버튼이
     * 있어야 홈 화면이야"*). 인성에는 이 층이 없어서 여기에만 적는다.
     */
    HOME: { label: "홈", color: GRAY },
    /** 📋 잡은 콜 목록 (인성 «완료» 탭과 같은 자리) — 목록이라 콜 리스트와 같은 색 */
    MY_ORDERS: { label: "내 오더", color: GREEN },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: BLUE },
    DETAIL_CONFIRMED: { label: "확정페이지", color: AMBER },
    POPUP_ERROR: { label: "이미 배정됨", color: RED_BLINK },
    // 🚚 수락 뒤 — 이동은 파랑, 도착은 초록 (기사님 확정)
    RUN_TO_PICKUP: { label: "픽업지 이동", color: BLUE },
    RUN_AT_PICKUP: { label: "픽업 완료 대기", color: GREEN },
    RUN_TO_DROPOFF: { label: "배송지 이동", color: BLUE },
    RUN_AT_DROPOFF: { label: "배송 완료 대기", color: GREEN },
    RUN_DONE: { label: "배송 완료", color: GREEN },
};

const BY_NETWORK: Record<TargetAppType, Partial<Record<ScreenContextType, ScreenLabel>>> = {
    insung: INSUNG_SCREEN_LABELS,
    hwamul24: HWAMUL24_SCREEN_LABELS,
    kakaopicker: PICKER_SCREEN_LABELS,
};

/**
 * 🔴 **고르는 곳은 여기 하나다** — 화면은 «어느 배차망인가»만 넘기고 이름은 안 짓는다.
 * 모르는 배차망은 인성으로 (오프라인 안전망과 같은 결 — 지어내지 않고 기본값으로).
 */
export function screenLabelsOf(targetApp?: string | null) {
    return BY_NETWORK[(targetApp ?? 'insung') as TargetAppType] ?? INSUNG_SCREEN_LABELS;
}

/**
 * 🏷️ 이 배차망의 이 화면을 뭐라 부르나 — 목록에 없으면 배차망 내부 시 «⚠️ 미등록 팝업», 배차망 밖이면 «⚠️ 알 수 없는 화면».
 *
 * 🔴 **빠진 화면을 조용히 비우지 않는다.** 비우면 «못 읽는 중»과 «그런 화면이 없음»이
 *    같아 보인다 — 이 레포가 «연결됐다»와 «읽고 있다»를 섞어 당한 것과 같은 모양이다.
 */
export function screenLabelOf(targetApp: string | null | undefined, screen?: ScreenContextType | null): ScreenLabel | null {
    if (!screen) return null;
    if (screen === 'LAUNCHER') {
        return { label: "바탕화면 (홈)", color: GRAY };
    }
    if (screen === 'OTHER_APP') {
        return { label: "기타 앱 (배차망 밖)", color: AMBER };
    }
    if (screen === 'UNKNOWN') {
        return targetApp
            ? { label: "⚠️ 미등록 팝업", color: RED_BLINK }
            : { label: "알 수 없는 화면", color: RED_BLINK };
    }
    return screenLabelsOf(targetApp)[screen] ?? { label: "알 수 없는 화면", color: RED_BLINK };
}

/** 💤 화면이 꺼졌을 때의 색 — 배지 하나가 통째로 이 색이 된다 (경고지 오류가 아니다) */
const SLEEP = "text-warning bg-warning/15 border-warning/30";
/** 화면명도 배차망도 못 그릴 때의 무채색 — «아직 모른다»이지 «고장»이 아니다 */
const MUTED = "bg-surface-alt text-text-muted border-border";

/** 🖥️ 폰 상태 바의 **한 배지** — 배차망·화면명·화면 꺼짐이 여기서 하나로 골라진다 */
export interface DeviceScreenBadge {
    /** 배차망 이름(«인성»·«픽커») — 붙일 이유가 없으면 `null` */
    network: string | null;
    /** 화면명. 배차망만 아는 폰이면 빈 문자열 */
    label: string;
    color: string;
}

/**
 * 🖥️ **6번(화면 켜짐)과 9번(화면명)을 한 배지로 고른다** (기사님과 확정).
 *
 * 포함 관계가 이렇게 서 있다 — **위가 꺼지면 아래는 뜻이 없다.**
 * ```
 * 2 살아있나 → 6 화면 켜짐 → 7 접근성 → 8 배차망 → 9 화면명
 * ```
 * 그래서 화면이 꺼진 폰에 «픽커 홈»을 그리면 **읽지도 않고 단언하는 것**이다 —
 * 그 값은 화면이 꺼지기 **전에** 읽은 것이고, 그 사이 기사님이 무엇을 하셨는지 앱은 모른다.
 * (같은 규칙을 `tests/rules/screenTruth.test.ts` 가 문다)
 *
 * 🔴 **표시를 합치는 것이지 값을 합치는 것이 아니다.** `isScreenOn`·`screenContext` 는
 *    서버·검사가 각자 쓰던 그대로 남는다 (규칙 ⑤-4 ⑤ — 읽는 곳이 늘어난 것이 아니다).
 * 🔴 **끊김이 화면 꺼짐보다 위다.** 말이 없는 폰에 «화면이 꺼졌다»고 적으면 그것도 단언이다 —
 *    마지막으로 들은 말이 그랬을 뿐이다. 끊김은 폰 이름의 빨간 깜빡임이 말한다.
 * ⚠️ 화면 켜짐을 안 싣는 구앱은 `isScreenOn` 이 `undefined` 다. **모름을 «꺼짐»으로 읽지 않는다.**
 */
export function deviceScreenBadge(device: {
    status?: string | null;
    targetApp?: string | null;
    screenContext?: ScreenContextType | null;
    isScreenOn?: boolean;
    offlineReason?: DeviceOfflineReason;
}): DeviceScreenBadge | null {
    const disconnected = device.status === "OFFLINE";

    /**
     * 📵 **말이 없는 폰의 화면 이름은 그리지 않는다** (기사님 지적).
     *
     * 그 값은 폰이 마지막으로 말해 준 «아까 그것»이라, 계속 그리면 화면이
     * *"지금 이 화면이다"* 라고 **단언**한다. 대신 **왜 끊겼는지**를 적는다 —
     * 접근성을 켜야 하는 것과 폰·통신을 봐야 하는 것은 기사님이 하실 일이 다르다.
     * ⚠️ 까닭을 못 들었으면 «📵 통신 끊김» 이다 — 못 들은 것을 «⚠️ 접근성 꺼짐»으로 지어내지 않는다.
     */
    if (disconnected) {
        const why = device.offlineReason ? DEVICE_OFFLINE_LABEL[device.offlineReason] : "📵 통신 끊김";
        return { network: null, label: why, color: MUTED };
    }

    if (device.isScreenOn === false) {
        return { network: null, label: "💤 화면 꺼짐", color: SLEEP };
    }

    // Tier 2: 배차망 외부 (바탕화면 홈 런처 또는 기타 앱)
    if (device.screenContext === "LAUNCHER") {
        return { network: null, label: "📱 바탕화면 (홈)", color: GRAY };
    }
    if (device.screenContext === "OTHER_APP") {
        return { network: null, label: "📱 기타 앱 (배차망 밖)", color: AMBER };
    }

    // Tier 1: 배차망 내부
    const screen = screenLabelOf(device.targetApp, device.screenContext);
    const network = device.targetApp
        ? (TARGET_APP_LABEL[device.targetApp as TargetAppType] ?? device.targetApp)
        : null;

    if (!screen && !network) return null;
    
    // 폭을 아끼려고 화면명의 낱말 사이를 붙인다 — «인성 콜리스트» (기사님).
    // ⚠️, 📱 등 이모지나 특수 접두사가 있는 경우는 원문 유지
    const rawLabel = screen?.label ?? "";
    const cleanLabel = rawLabel.startsWith("⚠️") || rawLabel.startsWith("📱")
        ? rawLabel
        : rawLabel.replace(" ", "");

    return { network, label: cleanLabel, color: screen?.color ?? MUTED };
}
