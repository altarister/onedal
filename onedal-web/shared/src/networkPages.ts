import type { TargetAppType } from './index';
import type { PageField, ScreenPage, BasePage } from './pageFields';
import type { VehicleType } from './vehicles';
import { INSUNG_PAGES } from './networkPages.insung';
import { HWAMUL24_PAGES } from './networkPages.hwamul24';
import { KAKAO_PICKER_PAGES } from './networkPages.kakaopicker';

/**
 * 📄 **배차망 화면 정의 — 한 곳** (기사님 «플러그인스에 있는 값을 서버가 같이 써야»).
 * 배차망(인성 · 화물24시 · 카카오 픽커)마다 «어느 화면 · 어느 칸이 · 어디에 · 어떤 글자로 오고 · 읽나 안 읽나 · 어떻게 읽나»를 여기 한 장에만 적는다.
 * 🔴 **원천이다 — 여기를 고친다.** 원달앱 `plugins/…/…Pages.kt` 셋은 `cd onedal-web && pnpm gen:pages` 가 이 표에서 뽑은 생성 파일이고,
 *    원달앱 `NetworkPagesPairTest` 가 둘이 같은지 문다. 서버는 이 상수를 바로 읽는다.
 * 칸 이름은 `pageFields` 의 낱말(SCREEN_PAGES · PAGE_FIELDS)이다. `read` 는 정규식 원문 글자 — JS 와 코틀린이 같은 뜻으로 읽는 문법만 쓴다(1번 묶음이 값 · 노드 글을 한 칸 띄어 이은 줄에 댄다).
 * 🧾 **늘 있음 / 있다 없다 — 분류 규칙(세 배차망 같음 · 칸의 `presence` · `presenceEvidence`)**
 *    · 그 칸 자리가 보인 **실물** 콜(서로 다른 콜 — 같은 콜을 여러 장 찍었으면 한 건)을 센다 · 잘리거나 가려져 그 자리가 안 보인 캡처는 세지 않는다
 *    · 보인 콜 전부에 있음 = 늘 있음(ALWAYS) · 일부에 있음 = 있다 없다(SOMETIMES) · 한 건에만 = 한 번만(ONCE)
 *    · 실물 캡처가 없거나 `seen` 이 REAL 이 아니면 = 모름(UNKNOWN) — 시뮬레이터 화면으로 늘 있음을 매기지 않는다
 *    · 늘 있음 칸이 안 보이면 리뉴얼을 의심한다(58) · 있다 없다 칸은 여러 건 잇달아 안 보일 때만
 * 🗂️ **공통은 여기, 배차망 몫은 배차망마다 한 파일** — `networkPages.insung.ts` · `networkPages.hwamul24.ts` · `networkPages.kakaopicker.ts`(배차망이 늘면 파일 하나와 아래 `NETWORK_PAGES` 한 줄을 더한다).
 *    배차망 파일의 몸통은 JSON 표시 주석 둘(별표 주석 «JSON») 사이의 엄격한 JSON 이다 — 뽑는 스크립트(mjs)와 원달앱 검사가 그 사이를 그대로 읽는다. 표시를 지우지 않는다.
 */
export interface NetworkFieldSpec {
    field: PageField;
    /** 화면 어디 */
    where: string;
    /** 실제로 본 글자 견본 */
    sample: string;
    /** 본 곳 — 실물 · 시뮬레이터 · 모름 */
    seen: 'REAL' | 'SIM' | 'UNKNOWN';
    /** 읽나 — 읽음 · 읽고 버림 · 안 읽음 */
    handling: 'READ' | 'DROPPED' | 'UNUSED';
    /** 읽는 곳(코드 자리) */
    usedAt?: string;
    /** 읽는 법 — 정규식 원문(1번 묶음이 값) · 없으면 공통 길이 이 칸을 읽지 않는다 */
    read?: string;
    /** 🧩 그 칸의 어느 조각 — 한 화면에 같은 칸이 여럿일 때(인성 상세 연락처: 'dispatcher' · 'pickup.customer' …). 없으면 그 칸 자체 · 중복 검사는 (칸, 조각) */
    part?: string;
    /** 한 줄 덧말(생성 파일에 주석으로 실린다) */
    note?: string;
    /**
     * 🧾 **이 칸이 화면에 늘 있나** — 실물 캡처를 세어 정한다(분류 규칙은 파일 머리 «늘 있음 / 있다 없다»).
     * 없으면 «모름»(UNKNOWN)이다. 서버 · shared 만 읽는다 — 원달앱 생성 파일에는 싣지 않는다(원달앱 런타임이 안 쓴다).
     */
    presence?: Presence;
    /** 그렇게 정한 근거 — 그 칸 자리가 보인 실물 콜 수(of) 가운데 있던 수(seen) · 어느 캡처들인가(from) */
    presenceEvidence?: { seen: number; of: number; from: string };
}
/** 🧾 늘 있음 · 있다 없다 · 한 번만 · 모름 */
export type Presence = 'ALWAYS' | 'SOMETIMES' | 'ONCE' | 'UNKNOWN';
export interface NetworkPageSpec {
    /** 그 배차망 정의의 머리 글(생성 파일 머리에 실린다) */
    about: string[];
    pages: Record<ScreenPage, NetworkFieldSpec[]>;
    /**
     * 🚫 **그 배차망에 없는 페이지** — 실물로 없다고 확인한 것만(까닭 · 근거 캡처). 칸은 비운다.
     * 모르는 페이지는 비우지 않고 `seen: UNKNOWN` 줄로 둔다 — «비어 있음 = 없다고 확인함»만 참이 되게.
     */
    absentPages?: Partial<Record<ScreenPage, { why: string; evidence: string }>>;
    /**
     * 🪞 **같은 화면이라 칸이 같은 페이지** — 이 페이지 칸은 비우고 `as` 페이지 칸을 쓴다(`fieldsOf` · 원달앱은 뽑을 때 복사).
     * `seen` 은 «이 페이지가 그 모양이다»를 본 정도 — 복사한 칸은 원래 칸과 이것 중 약한 쪽이 된다.
     */
    sameFieldsAs?: Partial<Record<ScreenPage, { as: ScreenPage; seen: 'REAL' | 'SIM' | 'UNKNOWN'; why: string }>>;
    /**
     * 🚫 **제외어를 찾는 칸** — 상세 화면(detail)의 이 칸들 값에서만 기사님 제외어를 찾는다(기사님 «배차망별 칸에서만»).
     * 칸마다 그 화면 정의 줄의 읽는 법(read)으로 읽는다 — 주소 · 화주 이름 · 화면 머리 · 버튼 · 목록 잔상은 빠진다. 서버가 읽는다 · 원달앱 제외어는 목록 카드 글에서만(무변화) · gen:pages 는 이 칸을 뽑지 않는다.
     */
    excludeScan: PageField[];
    /** 그 칸들로 정한 까닭 한 줄(기사님 말) */
    excludeScanWhy: string;
    /**
     * ⚙️ **배차망 규칙 넷** — 원달앱 플러그인 · 서버가 이 표 값을 읽는다(손으로 따로 적지 않는다 · 배차망_모드표.md 의 «모드» · «시간» 장이 이것을 가리킨다).
     * `modes` 그 배차망에서 되는 모드(관제웹이 보내는 이름) · `packageKeywords` 배차망 앱을 알아보는 패키지 글자 ·
     * `safeCancelSec` · `detailBackSec` 는 **시간 값이 아니라 «어느 설정 칸을 쓰나»**(user_settings · WaitTimes 칸 이름 — 값은 설정이 낸다 · 없으면 null).
     */
    modes: Array<'AUTO' | 'MANUAL' | 'SIMULATION' | 'ALARM'>;
    packageKeywords: string[];
    safeCancelSec: 'safeCancelSecInsung' | 'safeCancelSecHwamul24' | null;
    detailBackSec: 'pickerAlarmDetailSec' | null;
    /** 그 규칙의 까닭 한 줄 */
    rulesWhy: string;
    /**
     * 🏠 **주소 다듬기** — 서버가 카카오 주소 찾기 전에 콜 주소에서 이 정규식에 맞는 부분을 지우고 앞뒤 공백을 자른다.
     * null 이면 앞뒤 공백만. 원달앱은 읽지 않는다 · gen:pages 는 이 칸을 뽑지 않는다.
     */
    addressCut: string | null;
    /** 그렇게 다듬는 까닭 한 줄 */
    addressCutWhy: string;
    /**
     * 🚚 **차종 낱말 → 우리 차종** — 배차망이 정의한 차종 글자를 우리 차종(VEHICLE_OPTIONS)에 맞춘다(기사님 «기준은 배차망 · 플러그인으로 맞춘다»).
     * 원달앱은 gen:pages 로 받는다(…Pages.vehicleWords). 표에 없는 낱말은 원달앱이 이상 기록 «VEHICLE_UNKNOWN: 낱말»로 올린다.
     */
    vehicleWords?: NetworkVehicleWord[];
    /** 차종 낱말을 화면 어디서 읽나 한 줄 */
    vehicleWordsWhy?: string;
    /** 🖥️ 이 배차망의 페이지 전부 — 차례가 판별 차례 · 표에 없는 화면은 리뉴얼이거나 못 모은 화면이다 */
    screens: NetworkScreenSpec[];
    /**
     * 🧭 **배차망을 가르는 글자 묶음** — 묶음 안 글자가 전부 보이면 이 배차망 화면이다(원달앱 `TargetApp.networksOnScreen` · 시뮬레이터는 세 배차망을 한 앱으로 띄운다).
     * 페이지 글자와 따로 둔다 — 다른 배차망 화면에 없는 글자만 고른다(원달앱 `NetworkByScreenTest`). 원달앱은 gen:pages 로 받는다(…Pages.networkMarkers).
     */
    networkMarkers: string[][];
    /** 그 묶음으로 정한 까닭 한 줄 */
    networkMarkersWhy: string;
}
export interface NetworkVehicleWord {
    /** 배차망 화면의 차종 낱말 그대로 */
    word: string;
    /** 우리 차종 — null 은 배차망 낱말은 알지만 우리 차종이 없다(인성 14t · 18t → 지금처럼 거른다 · 가까운 차종으로 때우지 않는다 · 이상 기록 안 올림) */
    vehicle: VehicleType | null;
    /** 본 곳 — 실물 · 시뮬레이터 */
    seen: 'REAL' | 'SIM';
}

/**
 * 🧭 **우리 기준 페이지** — 배차망 페이지를 우리 시스템의 어느 자리로 맞추나.
 * 원달앱 `core/PageSpec.kt` 의 `StandardScreen` 과 이름 · 차례가 같다(원달앱 `NetworkPagesPairTest`).
 * TRANSITION = 콜을 누른 직후 넘어가는 틀 · NETWORK_MENU = 배차망 안의 일이 아닌 화면(목록 복귀 아님).
 */
export const STANDARD_SCREENS = [
    'HOME', 'LIST', 'DETAIL_PRE_CONFIRM', 'DETAIL_CONFIRMED', 'MY_ORDERS',
    'RUN_TO_PICKUP', 'RUN_AT_PICKUP', 'RUN_TO_DROPOFF', 'RUN_AT_DROPOFF', 'RUN_DONE',
    'TRANSITION', 'NETWORK_MENU', 'OTHER_APP',
] as const;
type StandardScreen = typeof STANDARD_SCREENS[number];

/**
 * 🔎 **알아보는 글자 한 벌** — all 은 모두 있어야 · any 는 하나라도(비면 안 봄) · none 은 하나도 없어야.
 * shape 는 정규식 원문이 화면 글에서 몇 번 맞나(min 이상 · max 이하) — 픽커 목록 줄 모양(거리 … 요금).
 */
interface ScreenMatch {
    all?: string[];
    any?: string[];
    none?: string[];
    shape?: { read: string; min?: number; max?: number };
}

/** 🪟 페이지 위에 뜨는 것 — 팝업(POPUP · 시트 · 드롭다운 포함) · 알림(NOTICE — 화면 글이 아니라 알림 사건으로 옴) · 토스트(TOAST) · 띠(BANNER) */
interface ScreenOverlay {
    name: string;
    kind: 'POPUP' | 'NOTICE' | 'TOAST' | 'BANNER';
    /** 알아보는 글자 — 갈래 중 하나만 맞아도 · 빈 배열은 아직 모름(toCollect 가 있어야 한다) */
    match: ScreenMatch[];
    /** 뜻 — 이것이 뜨면 무슨 일인가 */
    meaning: string;
    seen: 'REAL' | 'SIM' | 'UNKNOWN';
    /** 근거 — 캡처 경로(이름과 내용이 다르면 괄호에 내용) 또는 로그 «폰 파일 시각» · 비면 «모을 것» */
    evidence: string[];
    /** 아직 모을 것 — 캡처 · 알아보는 글자 · 패키지 이름 */
    toCollect?: string;
    /** 글자의 원천이 서버 낱말 사전이면 그 자리(파일 · 키) — 글자는 표에 옮기지 않는다 */
    wordsFrom?: string;
    /**
     * 🛠️ **이 덧칸이 보이면 원달앱이 할 일** — SKIP 건너뛰기(로딩) · FILL_PICKUP · FILL_DROPOFF · FILL_MEMO 팝업으로 상세 채우기(인성) · ERROR 오류(아무것도 안 누름).
     * 서버로 보내는 화면 값은 페이지 값 그대로이고 덧칸 이름이 따로 간다.
     */
    action?: 'SKIP' | 'FILL_PICKUP' | 'FILL_DROPOFF' | 'FILL_MEMO' | 'ERROR';
}

/**
 * 🖥️ **배차망 페이지 한 줄** (기사님 «모든 페이지 모든 팝업을 인지»).
 * 배열 차례가 판별 차례다 — 위에서부터 처음 맞는 페이지. 배차망 페이지는 묶지 않는다(우리 기준 값은 묶어도 된다).
 * 원달앱 판별은 아직 이 줄을 읽지 않는다.
 */
interface NetworkScreenSpec {
    /** 배차망이 부르는 페이지 이름 */
    name: string;
    /** 우리 기준 페이지 — null 은 화면을 아직 못 봐 못 정함(toCollect 가 있어야 한다) */
    standard: StandardScreen | null;
    /**
     * 이 화면이 속한 기준 페이지(`BASE_PAGES`) — 같은 모양이면 둘이다(첫 칸은 화면만 보고 정하는 뜻 — 화면 낱말이 쓴다 · 둘째부터는 들어온 길로만 가를 수 있는 뜻).
     * 비면 기준 밖(넘어가는 틀 · 배차망 메뉴 · 다른 앱). 서버로 보내는 화면 값은 `standard` 그대로다.
     */
    bases: BasePage[];
    /**
     * 🔘 배차망 화면의 단추 글자 — accept 수락 · filterOut 잡기 전 물러남 · keep 잡은 뒤 결재 KEEP · cancel 잡은 뒤 결재 취소.
     * 원달앱이 누를지는 플러그인이 정한다(픽커는 «수락하기»를 안 누른다). 결재 글자는 그 배차망 확정 기준 페이지 줄 하나에서만 읽는다.
     */
    buttons?: { accept?: string; filterOut?: string; keep?: string; cancel?: string };
    /** 알아보는 글자 — 갈래 중 하나만 맞아도 이 페이지 · 빈 배열은 아직 모름(toCollect 가 있어야 한다) */
    match: ScreenMatch[];
    /** 목록 복귀로 치나 — LIST 가 아닌 페이지에서 참이면 서버가 심사 중 콜을 치우고 원달앱이 진행을 처음부터 한다 */
    listReturn: boolean;
    /**
     * 🖐️ 수락(신청)하면 배차망이 스스로 이 페이지로 보내나 — 참이면 목록 복귀여도 «잡은 콜을 놓음»이 아니다(서버 목록 이탈 · 원달앱 목록 복귀 리셋 · 38 F42).
     * 화물24시가 그렇다 — 배차신청하면 «배차신청 뒤 화물상세정보»에 머물고(실물 54), 거기서 «배차내역»을 누르면 «배차내역 목록»으로 간다. 없으면 거짓.
     * 확정 전 상세에서 이 페이지로 넘어가면 원달앱은 기사님 손 수락으로 본다(`HandAccept`).
     */
    landsAfterAccept?: boolean;
    overlays: ScreenOverlay[];
    seen: 'REAL' | 'SIM' | 'UNKNOWN';
    /** 근거 — 캡처 경로(이름과 내용이 다르면 괄호에 내용) 또는 로그 «폰 파일 시각» · 비면 «모을 것» */
    evidence: string[];
    /** 아직 모을 것 — 캡처 · 알아보는 글자 · 패키지 이름 */
    toCollect?: string;
    /** 글자의 원천이 서버 낱말 사전이면 그 자리(파일 · 키) — 글자는 표에 옮기지 않는다 */
    wordsFrom?: string;
}

export const NETWORK_PAGES: Record<TargetAppType, NetworkPageSpec> = {
    insung: INSUNG_PAGES,
    hwamul24: HWAMUL24_PAGES,
    kakaopicker: KAKAO_PICKER_PAGES,
};

const SEEN_RANK = { UNKNOWN: 0, SIM: 1, REAL: 2 } as const;
/** 📄 그 배차망 · 그 페이지의 칸 — 같은 칸 페이지(`sameFieldsAs`)면 가리키는 페이지 칸을 seen 약한 쪽으로(원달앱 생성 파일과 같은 답) */
export function fieldsOf(app: TargetAppType, page: ScreenPage): NetworkFieldSpec[] {
    const spec = NETWORK_PAGES[app];
    const same = spec?.sameFieldsAs?.[page];
    if (!same) return spec?.pages[page] ?? [];
    return (spec.pages[same.as] ?? []).map((r) => (SEEN_RANK[r.seen] <= SEEN_RANK[same.seen] ? r : { ...r, seen: same.seen }));
}

/**
 * 📋 **이 배차망 페이지는 목록 복귀로 치나** — 표의 `listReturn`(인성 완료 탭 · 화물24시 배차내역 목록).
 * 원달앱이 «내 오더»(MY_ORDERS) 화면 값과 함께 싣는 페이지 이름(`screenPage`)으로 찾는다 · 모르면 false.
 */
export function listReturnOf(targetApp: string | null | undefined, page: string | null | undefined): boolean {
    if (!targetApp || !page) return false;
    return NETWORK_PAGES[targetApp as TargetAppType]?.screens.some(s => s.name === page && s.listReturn) ?? false;
}

/** 🖐️ **이 배차망 페이지는 수락 뒤 배차망이 스스로 보내는 곳인가** — 표의 `landsAfterAccept`(화물24시 배차신청 뒤 화물상세정보 · 배차내역 목록) · 모르면 거짓 */
export function landsAfterAcceptOf(targetApp: string | null | undefined, page: string | null | undefined): boolean {
    if (!targetApp || !page) return false;
    return NETWORK_PAGES[targetApp as TargetAppType]?.screens.some(s => s.name === page && s.landsAfterAccept) ?? false;
}

