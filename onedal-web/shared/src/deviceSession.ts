import { phoneModeOf } from './allowance';
import type { DeviceOfflineReason } from './deviceOffline';
import type { TargetAppType } from './targetApps';
import type { DeviceStatusType, DeviceModeType } from './deviceModes';
import type { ScreenContextType } from './screenKinds';

/**
 * 👁️ **앱은 켜져 있는데 화면을 못 읽는 중인가** (기사님 확정 · 크리티컬).
 *
 * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
 *
 * 텔레메트리가 온다고 ONLINE 으로만 보면, 접근성이 막혀 콜을 하나도 못 읽는 동안에도 관제웹이 파란불이다 —
 * 실운행이면 **콜을 통째로 놓치는데 기사님이 알 방법이 없다.**
 *
 * 🔴 판단은 **근거 있는 것만** 한다. `노드 0` 은 접근성 트리가 안 오는 명백한 고장이다.
 *    반면 *"노드는 있는데 콜이 0"* 은 **빈 리스트일 수도** 있어 여기서 단정하지 않는다 —
 *    가르려면 "콜이 없을 때 노드가 몇 개인가"의 실측이 필요하다 (규칙 ⑤-4 ②).
 *
 * ⏱️ **15초**를 기다린다: 화면 전환·앱 전환 중에는 순간적으로 0이 될 수 있고,
 *    텔레메트리는 5초 간격이라 세 번 연속이면 일시적인 것이 아니다.
 */
export const BLIND_GRACE_MS = 15_000;

export function isDeviceBlind(session: { blindSince?: number }, now: number = Date.now()): boolean {
    return !!session.blindSince && now - session.blindSince >= BLIND_GRACE_MS;
}

/**
 * 🚦 **작업 단계의 이름은 여기 한 곳에서 짓는다** (기사님 확정).
 *
 * 앱은 **칸과 숫자만** 보낸다. 한글을 앱에도 두면 낱말이 두 벌이 되고 한쪽만 고쳐진다.
 * ⚠️ 안 보내는 구앱은 `null` 이다 — «대기»로 지어내지 않는다 (규칙 ④).
 */
export function workStageLabel(d: {
    workStage?: string; workStageStep?: number; workStageSeconds?: number;
}): string | null {
    switch (d.workStage) {
        case "IDLE": return "대기";
        case "DETAIL": return "상세";
        case "POPUP": return d.workStageStep ? `팝업 ${d.workStageStep}/3` : "팝업";
        case "AWAITING_VERDICT": return "판결 대기";
        case "SAFE_CANCEL":
            return d.workStageSeconds != null ? `안전취소 ${d.workStageSeconds}초` : "안전취소";
        default: return null;
    }
}

/**
 * 🎛️ **모드가 아직 폰에 안 닿았나** — 저장하지 않고 **대조로 파생**시킨다 (규칙 ③).
 *
 * 🔴 버튼을 누르는 순간 바뀐 것처럼 그리지 않는다(«낙관적 업데이트») — 폰이 받았는지 모르면서 단언하는 것이다.
 * ⚠️ 대답을 안 싣는 구앱(`undefined`)은 «적용중»이라 하지 않는다 — 모름을
 *    «안 됐다»로 읽으면 영원히 안 풀리는 딤드가 된다 (규칙 ④).
 */
export function isModeApplying(d: { mode?: string; autoAllowed?: boolean; appliedMode?: string; suppliedMode?: string; sentMode?: string; supplyLinked?: boolean }): boolean {
    /* 📶 새 원달앱 — «서버가 보내는 모드가 블루투스로 아직 안 닿았나»만 본다. 일부러 내려간 알람(관제앱과 끊김 · 관제웹 없음 …)은 배지가 말한다 ·
          공급이 끊겼으면 받을 길이 없어 적용중이 아니다 · 꺼진 폰은 sentMode 가 없어 아니다 */
    if (d.suppliedMode !== undefined) return d.supplyLinked !== false && !!d.sentMode && d.sentMode !== d.suppliedMode;
    if (!d.appliedMode) return false;
    /* 📱 명령이 아니라 폰에 갈 모드와 견준다 — 자동 잡기 허락이 꺼지면 AUTO 명령도 폰은 ALARM 이라, 명령과 견주면 «적용중»이 영영 안 풀린다 */
    return phoneModeOf(d) !== d.appliedMode;
}

/**
 * 📶 **폰 칸 연결 배지 — 문제일 때만 하나** (기사님 «가» · 차례는 뿌리부터).
 * 다른 서버를 봄 · 허락 없음 · 폰 연결 풀림이면 나머지 값을 믿을 수 없으니 맨 앞 · 공급이 끊기면 옛 판은 그 결과라 끊김만.
 * 옛 원달앱(칸 없음)이면 null — 모르는 것을 문제로 그리지 않는다(규칙 ④).
 */
export interface PhoneLinkBadge { text: string; tone: 'red' | 'amber' | 'gray'; hint: string }
export function phoneLinkBadgeOf(d: Pick<DeviceSession, 'appTooOld' | 'bleSameServer' | 'nearbyPermitted' | 'bleUnlinkedWhy' | 'supplyLinked' | 'filterStale' | 'batteryExempt'>): PhoneLinkBadge | null {
    const off = ' · 관제앱은 최근 앱에서 밀어 없애도 공급을 계속합니다 — 끄려면 로그아웃';
    if (d.appTooOld) return { text: '원달앱 새로 깔기 필요', tone: 'red', hint: '블루투스 받기 전 원달앱이라 서버가 보고를 받지 않습니다 — 그동안 원달앱은 알람으로만 돕니다 · 새 원달앱을 까세요' };
    if (d.bleSameServer === false) return { text: '다른 서버를 봄', tone: 'red', hint: '이 스캔폰이 관제앱과 다른 서버를 봅니다 — 원달앱 설정에서 서버를 맞추세요' };
    if (d.nearbyPermitted === false) return { text: '블루투스 허락 없음', tone: 'red', hint: '원달앱 점검 탭 → 근처 기기 허락' };
    if (d.bleUnlinkedWhy) return { text: '폰 연결 풀림', tone: 'red', hint: `서버가 이 폰의 보고를 받지 않습니다(${d.bleUnlinkedWhy}) — 원달앱 설정에서 다시 연결` };
    if (d.supplyLinked === false) return { text: '관제앱과 끊김 · 알람만', tone: 'amber', hint: '관제앱을 열어 로그인하면 붙습니다 — 그동안 자동은 알람으로만 돕니다' + off };
    if (d.filterStale) return { text: '필터 옛 판', tone: 'amber', hint: '이 폰이 든 필터가 서버 것과 오래 다릅니다 — 관제앱과 붙었는지 보세요' + off };
    if (d.batteryExempt === false) return { text: '배터리 최적화 중', tone: 'gray', hint: '원달앱 점검 탭 → 배터리 최적화 예외 — 화면이 꺼지면 보고가 끊길 수 있습니다' };
    return null;
}

/**
 * 🎛️ **이 배차망에서 도는 모드** — 원달앱이 대답한 값, 없으면(옛 원달앱) 폰에 갈 모드(`phoneModeOf` — 허락이 꺼지면 AUTO 명령도 알람).
 * 관제웹 폰 카드와 알람 소리가 이것을 본다. «명령이 닿았나»(`isModeApplying`)는 명령끼리 대조한다.
 */
export function runningModeOf(d: { mode?: string; autoAllowed?: boolean; effectiveMode?: string }): string | undefined {
    return d.effectiveMode || phoneModeOf(d);
}

/**
 * ⏱️ **폰이 조용한가** — 직전 보고와 이번 보고 사이가 이만큼 벌어졌나.
 *
 * 🔴 값 **30초** (기사님 확정). 지어낸 값이 아니라 **생존신고 60초의 절반**이다 —
 *    앱은 일이 생기면 그때 보내고(수초) 아무 일도 없으면 60초마다 보내므로,
 *    간격이 그 중간값으로 나오는 일이 **거의 없다.** 그래서 30초가 둘을 가장 잘 가른다.
 */
export const DEVICE_QUIET_MS = 30_000;

/**
 * ⏱️ **판정은 여기 하나다** (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면 각자 다른 질문을 답한다).
 *
 * 🔴 **첫 보고(모름)를 «조용»으로 세지 않는다** (규칙 ④). 모르는 것과 조용한 것은
 *    다르다 — 방금 켠 폰에 «말이 없다»고 적으면 그것이 곧 거짓말이다.
 *
 * ⚠️ 읽는 곳은 **관제웹의 `⏱️` 배지 하나뿐**이다. 서버 판정도 앱도 안 읽는다 —
 *    «콜을 줄까»를 이걸로 정하기 시작하면 한 값이 두 사실을 답하게 된다.
 */
export function isDeviceQuiet(prevSeen: number | undefined, lastSeen: number): boolean {
    if (prevSeen === undefined) return false;   // 첫 보고 — 모른다
    return lastSeen - prevSeen > DEVICE_QUIET_MS;
}

export interface DeviceSession {
    deviceId: string;
    deviceName?: string;    // 기기 별명 (PIN 페어링 시 등록, 예: "메인폰", "서브폰")
    lastSeen: number;       // 밀리초 타임스탬프
    /**
     * 📵 **왜 오프라인인가** (기사님 지적: *"'접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 접근성을 끄면 앱은 죽기 **전에** «나 오프라인이다»를 스스로 보낸다(`onDestroy`).
     * 그때 자기 서비스가 «켜진 접근성 목록»에 없으면 그건 추측이 아니라 **사실**이다.
     * 아무 말 없이 끊긴 것(데드맨)과는 기사님이 하실 일이 다르므로 갈라 둔다.
     * ⚠️ 다시 보고가 오면 지운다 — 옛 이유가 살아 있으면 화면이 거짓말한다.
     */
    offlineReason?: DeviceOfflineReason;
    /**
     * ⏳ **«알 수 없는 화면»이 처음 온 시각** (밀리초) — 상세나 다른 화면이 오면 지운다.
     *    카드를 여는 순간 잠깐 끼는 `UNKNOWN`(0.05~0.18초)과 **앱 밖으로 나간 것**을 가른다
     *    (`UNKNOWN_LEAVE_SEC` · 미리보기 노출 판정만 읽는다).
     */
    unknownSince?: number;
    /**
     * ⏱️ **직전 보고 시각** (밀리초) — `lastSeen` 과의 간격이 «그 사이에 일이 있었나»를 답한다.
     * 지금 읽는 곳은 서버의 `🖥️ [화면 바뀜]` 로그 하나뿐이다 («직전 보고와 N초 만»).
     * 첫 보고에는 없다(«모른다»).
     */
    prevSeen?: number;
    status: DeviceStatusType;
    mode: DeviceModeType;
    /**
     * 🌐 이 폰이 지금 **어느 배차망을 보고 있나** (기사님 확정).
     * scrap 마다 갱신되는 실시간 상태다 — 저장하지 않는다(원장은 orders·intel 의
     * targetApp). 없으면(구앱) 화면은 표시를 비운다 — 기본값을 지어내지 않는다.
     */
    targetApp?: TargetAppType;
    /**
     * 🧬 **이 폰이 «들고 있는» 콜 필터의 지문** (현황판 담당 요청 ②).
     *
     * 앱은 `filterVersion` 을 **매 scrap 에 싣고** 서버는 «바뀌었나»를 대조해 본문을
     * 생략할지 정한다(`scrap.ts`). 그런데 **대조만 하고 버리고 있었다** — 그래서
     * *"메인폰은 새 필터, 서브폰은 두 판 전"* 을 아무도 볼 수 없었다.
     *
     * 🔴 **«폰이 들고 온 것»을 적는다 — 서버가 방금 내려보낸 것이 아니다.**
     *    서버가 준 것을 적으면 **언제나 최신으로 보여** 이 칸이 있으나 마나가 된다
     *    (규칙 ⑤-4 ⑤ — 읽는 곳이 답하려는 질문은 «이 폰이 뒤처졌나»다).
     * ⚠️ 구앱은 안 보낸다 — 없으면 «모른다»로 둔다. 화면은 비워야 한다 (규칙 ④).
     */
    filterVersion?: string;
    /** 그 지문을 마지막으로 확인한 시각 (밀리초) — 낡음을 재려면 «언제»가 있어야 한다 */
    filterVersionAt?: number;
    screenContext?: ScreenContextType;  // [Safety Mode V3] 현재 화면 상태 (물리적 페이지)
    /** 🧭 원달앱이 싣는 배차망 페이지 이름 · 그 위에 뜬 것(덧칸) 이름 — 배차망 정의 표의 이름 · 옛 원달앱은 안 싣는다 */
    screenPage?: string | null;
    screenOverlay?: string | null;
    isHolding?: boolean;    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    lat?: number;           // [GPS 텔레메트리] 앱폰(차량) 위도
    lng?: number;           // [GPS 텔레메트리] 앱폰(차량) 경도
    /** 📍 위치(lat/lng)가 실린 폰 보고를 받은 서버 시각(ms) — 메모리만 · 위치 없는 보고는 안 민다 · 운영센터 홈 «기사 이상»이 관제웹 GPS(lastFixAt)와 늦은 쪽을 본다 */
    lastLocationAt?: number;
    /**
     * 👁️ **마지막 리스트에서 읽은 텍스트 노드 수** (크리티컬).
     * `0` 이면 접근성 트리가 안 오는 것 — 앱은 살아 있지만 **화면을 못 읽는다.**
     */
    screenNodeCount?: number;
    /**
     * 💤 **폰 화면이 켜져 있는가** (기사님 확정).
     * 접근성 스크래핑은 화면이 켜져 있어야 돈다 — 꺼지면 앱은 살아 있어도 **콜을 못 잡는다.**
     * 앱이 **매 텔레메트리에 사실을 싣는다** (규칙 ③) — 이벤트 한 번으로 알리면 다음 하트비트가 `ONLINE` 으로 되돌려 녹색이 된다.
     */
    isScreenOn?: boolean;
    /**
     * 👁️ **화면을 못 읽기 시작한 시각** (밀리초). 노드가 0이 아니면 지워진다.
     * 관제웹이 이걸 보고 *"앱은 켜져 있는데 화면을 못 읽는 중"* 을 말한다 —
     * 기사님이 **파란불을 믿고 기다리는 일**을 막는 유일한 신호다.
     */
    blindSince?: number;
    /**
     * 👁️ **마지막 스캔의 필터 성적표** (기사님 확정).
     *
     * 기사님: *"앱에서 리스트는 돌아가고 있는데 관제웹에서는 **필터링이 잘되고 있는 건지
     * 알 수가 없어서** 답답하더라구. 실전에서는 16개가 다 들어오지 않으니까."*
     *
     * `stats.polled` 는 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 이 값이 말한다 —
     * *"도착지에서 5개"* 면 경유 반경을 넓힐 때고, *"요금에서만"* 이면 콜할인율을 만질 때다.
     *
     * ⚠️ **누적이 아니라 마지막 스캔의 스냅샷**이다. 누적은 *"어제부터 300개 떨어짐"* 이라
     *    지금 상태를 못 알려 준다. 질문은 *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 다.
     * ⚠️ **한 콜은 첫 번째로 걸린 축에만** 세어져 있다 — 그래야 합이 `seen` 과 맞고
     *    *"이 축을 풀면 몇 개가 들어오나"* 를 읽을 수 있다.
     */
    filterTally?: FilterTally;
    /**
     * 🕐 **그 성적표가 서버에 닿은 시각** (epoch ms · 기사님 지적).
     *
     * 기사님: *"`방금 1건 → 통과 0 · 차종 1` 같은 게 나오니까 **멈춰 있는 것 같아.**
     * 보내온 마지막 시간을 쓰는 것이 더 좋을 것 같다."*
     *
     * 🔴 숫자만으로는 *"지금 그런 것"* 과 *"아까 그러고 멈춘 것"* 을 구분할 수 없다.
     * 🔴 **서버 시계로 찍는다.** 앱이 보낸 시각을 쓰면 폰 시계가 틀어졌을 때 화면이
     *    미래나 과거를 말한다 — 받은 순간이 유일하게 확실한 사실이다.
     * ⚠️ `filterTally` 가 실제로 온 스캔에서만 갱신한다. 하트비트가 시각만 밀어 올리면
     *    **옛 숫자가 새것처럼** 보인다 (그게 지금 고치려는 거짓말 그 자체다).
     */
    filterTallyAt?: number;
    stats: {
        polled: number;     // 리스트 조회(콜 수집) 누적 횟수
        grabbed: number;    // 성공 횟수
        canceled: number;   // 취소 통보 횟수
    };
    version?: string;       // 앱/인성앱 버전 등 추가 정보용
    /**
     * 🚦 **지금 무슨 일을 하는 중인가** — 앱이 보낸 다섯 칸 중 하나
     * (`IDLE`·`DETAIL`·`POPUP`·`AWAITING_VERDICT`·`SAFE_CANCEL`).
     * 여태 `isHolding` 불리언 하나라 «어디서 멈췄는지»를 관제웹이 몰랐다.
     * ⚠️ 이름(한글)은 `workStageLabel` 이 짓는다 — 앱은 칸과 숫자만 보낸다.
     */
    workStage?: string;
    /** 🚦 팝업이 몇 장째인가 (`POPUP` 일 때만) */
    workStageStep?: number;
    /** 🚦 안전취소가 몇 초 남았나 (`SAFE_CANCEL` 일 때만) */
    workStageSeconds?: number;
    /**
     * 🎛️ **폰이 «나 지금 이 모드다»라고 대답한 값** (기사님 확정).
     * `mode`(관제가 정한 목표)와 **대조**하면 「적용중」이 파생된다 (규칙 ③).
     * ⚠️ 안 싣는 구앱은 `undefined` — 그걸 «적용 안 됨»으로 읽지 않는다 (규칙 ④).
     */
    appliedMode?: string;
    /**
     * 🎛️ **이 배차망에서 실제로 도는 모드** — 원달앱이 플러그인 `availableModes` 로 계산해 대답한다.
     * 픽커는 자동이 없어 자동 명령이 알람으로 돈다. 읽을 때는 `runningModeOf` 를 거친다(옛 원달앱은 안 싣는다).
     */
    effectiveMode?: string;
    /**
     * 📶 **원달앱 보고가 싣는 블루투스 · 폰 사실 넷** (원달앱이 원천 · 보고 한 길 · 옛 원달앱은 `undefined` → 안 그림).
     * `suppliedMode` 관제앱이 블루투스로 준 마지막 모드(저장 값) — «적용중»은 이것과 서버가 보내는 모드(`sentMode`)를 견준다(`isModeApplying`).
     */
    suppliedMode?: string;
    supplyLinked?: boolean;
    nearbyPermitted?: boolean;
    batteryExempt?: boolean;
    /** 🎛️ 서버가 이 폰에 보내는 모드(`modeSentToPhone`) — 기기 목록에만 · 살아 있는 폰만(꺼진 폰은 없음) */
    sentMode?: string;
    /** 🧬 폰이 든 필터 판이 서버가 보낸 판과 오래 다르다(`phoneCheck` stale) — 기기 목록에만 */
    filterStale?: boolean;
    /** 📶 블루투스로만 아는 셋(관제앱이 `phone-status` 로 · 원달앱 STATUS) — 같은 서버를 보나(서버 표지) · 폰 연결 풀린 까닭 · 관제앱이 들은 마지막 숨(ms) */
    bleSameServer?: boolean;
    bleUnlinkedWhy?: string | null;
    bleHeardAt?: number;
    /** 🚫 블루투스 받기 전 원달앱 — 서버가 보고를 거절한다 · 기기 목록에만 */
    appTooOld?: boolean;
    /**
     * 🎛️ **이 회원의 자동 잡기 허락이 지금 살아 있나** — 서버가 폰 보고마다 적는다(메모리 · 저장 칸 아님).
     * 꺼지면 AUTO 명령도 폰은 ALARM — 읽을 때는 `phoneModeOf` 를 거친다 · 관제웹 모드 목록은 `modeChoicesOf`.
     */
    autoAllowed?: boolean;
}

/**
 * 👁️ **필터 성적표 — 마지막 스캔 한 판** (기사님 확정).
 * 앱의 `FilterTally` 와 **같은 모양**이다. 축 이름이 갈라지면 화면이 엉뚱한 축을 가리킨다.
 */
export interface FilterTally {
    /** 이번 스캔에서 판정한 콜 수 (요금을 못 읽어 버려진 카드는 여기 안 든다) */
    seen: number;
    /** 전부 통과한 콜 수 */
    passed: number;
    vehicle: number;
    region: number;
    fare: number;
    pickup: number;
    blacklist: number;
    routeOrder: number;
    /** 📋 상차 목록에 안 걸린 콜 — 원달앱 2.9.7 부터 (옛 앱은 안 보낸다 · 하차 목록») */
    pickupList?: number;
    /** 📅 예약콜 축에 막힌 콜 — 원달앱 예약 필터부터 (옛 앱은 안 보낸다) */
    reservation?: number;
}
