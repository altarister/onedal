import type { ScreenContextType, TargetAppType } from './index';

/**
 * 🏷️ **화면 이름표 — 배차망마다 따로 둔다** (기사님 설계 2026-09-02).
 *
 * 기사님: *"`SCREEN_LABELS` 가 인성·픽커·화물24 이렇게 따로따로 있어야 할 것 같아.
 * 이 파일에 있으면 안 되고, 각 라벨들을 import 해 와서 가지고 있다가
 * **망에 따라 바꿔서 보일 수 있도록** 해야 할 것 같은데."*
 *
 * ── 왜 갈랐나 ──
 * 예전에는 `DeviceControlPanel.tsx` 안에 `SCREEN_LABELS` 한 벌이 있었고, 그 아홉 개가
 * **전부 인성 화면**이었다(콜 리스트·상세페이지·확정페이지·팝업 3종…). 픽커를 돌리면
 * 운행 중 다섯 화면이 갈 자리가 없어 **«알 수 없는 화면»(빨간 깜빡임)** 으로 떴다.
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
    // 예전에는 이 값이 shared 타입에 없어서, 앱만 보내고 아무도 못 읽었다 (유령 카드 사고)
    LIST_COMPLETED: { label: "완료 리스트", color: GREEN },
    UNKNOWN: { label: "알 수 없는 화면", color: RED_BLINK },
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
 * 🔴 **낱말은 픽커 화면 그대로 쓴다** (기사님 확정 2026-09-02 · «픽커 말 그대로»).
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
     * 🏠 「시작하기」 버튼이 있는 화면 (기사님 확정 2026-09-02 · *"'시작하기' 이 버튼이
     * 있어야 홈 화면이야"*). 인성에는 이 층이 없어서 여기에만 적는다.
     */
    HOME: { label: "홈", color: GRAY },
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
 * 🏷️ 이 배차망의 이 화면을 뭐라 부르나 — 목록에 없으면 «알 수 없는 화면».
 *
 * 🔴 **빠진 화면을 조용히 비우지 않는다.** 비우면 «못 읽는 중»과 «그런 화면이 없음»이
 *    같아 보인다 — 이 레포가 «연결됐다»와 «읽고 있다»를 섞어 당한 것과 같은 모양이다.
 */
export function screenLabelOf(targetApp: string | null | undefined, screen?: ScreenContextType | null): ScreenLabel | null {
    if (!screen) return null;
    return screenLabelsOf(targetApp)[screen] ?? { label: "알 수 없는 화면", color: RED_BLINK };
}
