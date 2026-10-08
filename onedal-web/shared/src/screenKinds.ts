import { listReturnOf } from './networkPages';

/**
 * 🛡️ Safety Mode V3: 앱폰 화면 상태 타입
 * 앱폰이 현재 보고 있는 화면을 서버에 실시간 보고합니다.
 * 판별 기준 키워드는 서버의 config/inseong.json에서 관리됩니다.
 */
export type ScreenContextType =
    | 'LIST'                  // 콜 잡기 리스트 화면
    | 'LIST_COMPLETED'        // 완료 리스트 화면 — 여기서도 "리스트로 돌아온 것"이다
    | 'DETAIL_PRE_CONFIRM'    // 선점 직전 상세 (확정 버튼 보임)
    | 'DETAIL_CONFIRMED'      // 확정 후 상세 화면 (닫기/취소 버튼)
    | 'POPUP_PICKUP'          // 출발지 상세 팝업
    | 'POPUP_DROPOFF'         // 도착지 상세 팝업
    | 'POPUP_MEMO'            // 적요 상세 팝업
    | 'POPUP_ERROR'           // 에러/실패 팝업 (확정실패, 취소불가 등)
    /**
     * 🚚 **수락한 뒤의 운행 화면 — 픽커에만 있다** (기사님 지시).
     *
     * 기사님: *"내가 관제앱에서 현 페이지를 확인할 수 있어야 해.. 그래야 일을 시작할 수 있지.
     * 관제에서는 폰의 상황을 잘 알아야 해. 그래서 가장 위에 있는 거야."*
     *
     * 인성은 확정하면 리스트로 돌아가고 **진행은 GPS가 답한다.** 픽커는 반대로
     * **화면이 진행을 말해 준다** — 이 값이 없으면 운행 중 화면이 전부 `UNKNOWN`(«알 수 없는 화면»)으로 떠,
     * 기사님이 가장 알고 싶은 순간에 관제가 가장 모르게 된다.
     *
     * 🔴 **마일스톤과는 다른 것이다.** 이건 «지금 무슨 화면인가»이고, 마일스톤은
     * «이 콜이 어디까지 왔나»다. 마일스톤은 넷 그대로 안 늘어난다
     * ([기획/배차망_통합.md] §1 — 기사님: *"모든 페이지를 마일스톤에 넣으면
     * 앱이 추가될 때마다 마일스톤이 생겨날 것 같아"*).
     *
     * ⚠️ 배차망이 늘어도 여기가 계속 부풀면 안 된다. 화면 «이름표»는 배차망별로
     * 갈라 두었으므로(`screenLabelsOf`), 다음 배차망은 **자기 이름표만** 더한다.
     */
    | 'RUN_TO_PICKUP'         // 🚚 픽커 — 픽업지로 이동 중
    | 'RUN_AT_PICKUP'         // 🚚 픽커 — 픽업지 도착, 픽업 완료 대기
    | 'RUN_TO_DROPOFF'        // 🚚 픽커 — 배송지로 이동 중
    | 'RUN_AT_DROPOFF'        // 🚚 픽커 — 배송지 도착, 배송 완료 대기
    | 'RUN_DONE'              // 🚚 픽커 — 배송 완료
    /**
     * 📋 **픽커 «내 오더» 탭 — 잡은 콜 목록** (기사님 지시 · 라이브에서 «알 수 없는 화면»으로 떴다).
     * 🔴 `LIST_SCREENS` 에 넣지 않는다 — 수락하면 곧바로 여기로 오는데, 리스트 복귀로 읽으면 서버가 미리보기 콜을 치워 승격이 빈 자리에 들어간다
     */
    | 'TRANSITION'            // 🔀 콜을 누른 직후 넘어가는 틀 — 스치는 화면(BLIP_SCREENS)
    | 'NETWORK_MENU'          // 🧭 배차망 안의 일이 아닌 화면(메뉴 · 마이페이지 …) — 목록 복귀가 아니다
    | 'MY_ORDERS'             // 📋 픽커 — 내 오더 탭
    /**
     * 🏠 **일을 안 잡고 있는 화면** (기사님 실측 제보로 신설).
     *
     * 기사님: *"픽커는 지금 홈에 있는데 콜 리스트로 나오고 있어."*
     *
     * 배차망 앱을 켜면 홈에 있고, 거기서 리스트로 들어간다 — 픽커 「시작하기」 · 인성 «인성퀵화면분할» · 화물24시 «전국24시콜화물».
     * 목록에 자리가 없으면 **홈이 «알 수 없는 화면»(빨간 깜빡임)** 으로 떨어진다.
     *
     * 🔴 **«모름»과 «홈»은 다른 답이다.** 앞은 *"못 읽고 있다"*, 뒤는 *"읽었고, 대기 중이다"* —
     * 관제웹에서 이 둘이 같아 보이면 기사님이 폰이 죽은 줄 안다.
     * (규칙 ⑤-4 ⑤ — 한 값이 두 사실을 답하게 두지 않는다)
     */
    | 'HOME'                  // 🏠 배차망 홈 — 리스트에 들어가기 전
    | 'LAUNCHER'              // 📱 안드로이드 바탕화면 (홈 런처)
    | 'OTHER_APP'             // 📱 기타 앱 (배차망 밖)
    | 'UNKNOWN';              // 알 수 없는 화면 / 미등록 팝업

/**
 * 🔴 **"콜에서 손을 뗀 화면"의 정의 — 여기 하나뿐이다.**
 *
 * 앱은 `LIST` 와 `LIST_COMPLETED` **둘 다** 리스트 복귀로 보고 세션을 리셋한다(`HijackService`).
 * 서버가 하나만 인정하면 **앱은 다음 콜을 찾는데 서버는 그 콜을 계속 쥐어**, 결재 카드가 영원히 남고
 * 콜 잡기가 멈춘다. 같은 판단을 두 곳에서 따로 정의하면 갈라진다 — 화면이 늘어나면 **이 배열에만** 넣는다.
 */
export const LIST_SCREENS: ScreenContextType[] = ['LIST', 'LIST_COMPLETED'];

/** 지금 화면이 "콜에서 손을 뗀" 상태인가 (= 서버가 쥐고 있던 콜을 놓아도 되는가) */
export function isListScreen(screenContext?: string | null, targetApp?: string | null, screenPage?: string | null): boolean {
    if (!screenContext) return false;
    if ((LIST_SCREENS as string[]).includes(screenContext)) return true;
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
 *    (`DetailCollectMachine`). 팝업을 이탈로 읽으면 정보를 모으는 동안 카드가 사라진다.
 */
export const DETAIL_SCREENS: ScreenContextType[] = [
    'DETAIL_PRE_CONFIRM', 'DETAIL_CONFIRMED',
    'POPUP_PICKUP', 'POPUP_DROPOFF', 'POPUP_MEMO', 'POPUP_ERROR',
];

/**
 * ⏳ **스치는 화면** — 상세도 이탈도 아직 아니다. 이어진 시간이 `UNKNOWN_LEAVE_SEC` 를 넘어야 이탈로 본다(서버 `devices.leftDetail`).
 * 알 수 없는 화면은 카드를 여는 순간 잠깐 끼고, 넘어가는 중은 콜을 누른 직후 0.3~0.7초 보인다.
 */
export const BLIP_SCREENS: ScreenContextType[] = ['UNKNOWN', 'TRANSITION'];

/** 지금 화면이 스치는 화면인가 (`BLIP_SCREENS`) */
export function isBlipScreen(screenContext?: string | null): boolean {
    return !!screenContext && (BLIP_SCREENS as string[]).includes(screenContext);
}

/** 지금 화면이 상세 계열인가 (`DETAIL_SCREENS`) — `UNKNOWN` 은 «모름»이라 여기서 거짓이다 */
export function isDetailScreen(screenContext?: string | null): boolean {
    return !!screenContext && (DETAIL_SCREENS as string[]).includes(screenContext);
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
