import type { TargetAppType } from './index';
import type { PageField, ScreenPage } from './pageFields';
import type { VehicleType } from './vehicles';

/**
 * 📄 **배차망 화면 정의 — 한 곳** (reviews/34 · 기사님 «플러그인스에 있는 값을 서버가 같이 써야»).
 * 배차망(인성 · 화물24시 · 카카오 픽커)마다 «어느 화면 · 어느 칸이 · 어디에 · 어떤 글자로 오고 · 읽나 안 읽나 · 어떻게 읽나»를 여기 한 장에만 적는다.
 * 🔴 **원천이다 — 여기를 고친다.** 원달앱 `plugins/…/…Pages.kt` 셋은 `cd onedal-web && pnpm gen:pages` 가 이 표에서 뽑은 생성 파일이고,
 *    원달앱 `NetworkPagesPairTest` 가 둘이 같은지 문다. 서버는 이 상수를 바로 읽는다(reviews/34 3단계).
 * 칸 이름은 `pageFields` 의 낱말(SCREEN_PAGES · PAGE_FIELDS)이다. `read` 는 정규식 원문 글자 — JS 와 코틀린이 같은 뜻으로 읽는 문법만 쓴다(1번 묶음이 값 · 노드 글을 한 칸 띄어 이은 줄에 댄다).
 * 몸통은 JSON 표시 주석 둘(별표 주석 «JSON») 사이의 엄격한 JSON 이다 — 뽑는 스크립트(mjs)와 원달앱 검사가 그 사이를 그대로 읽는다. 표시를 지우지 않는다.
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
}
export interface NetworkPageSpec {
    /** 그 배차망 정의의 머리 글(생성 파일 머리에 실린다) */
    about: string[];
    pages: Record<ScreenPage, NetworkFieldSpec[]>;
    /**
     * 🚫 **제외어를 찾는 칸** — 상세 화면(detail)의 이 칸들 값에서만 기사님 제외어를 찾는다(기사님 «배차망별 칸에서만» · reviews/34 3단계 5③).
     * 칸마다 그 화면 정의 줄의 읽는 법(read)으로 읽는다 — 주소 · 화주 이름 · 화면 머리 · 버튼 · 목록 잔상은 빠진다. 서버가 읽는다 · 원달앱 제외어는 목록 카드 글에서만(무변화) · gen:pages 는 이 칸을 뽑지 않는다.
     */
    excludeScan: PageField[];
    /** 그 칸들로 정한 까닭 한 줄(기사님 말) */
    excludeScanWhy: string;
    /**
     * 🏠 **주소 다듬기** — 서버가 카카오 주소 찾기 전에 콜 주소에서 이 정규식에 맞는 부분을 지우고 앞뒤 공백을 자른다(reviews/34 3단계 5②).
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
 * 🧭 **우리 기준 페이지** — 배차망 페이지를 우리 시스템의 어느 자리로 맞추나(reviews/35).
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
}

/**
 * 🖥️ **배차망 페이지 한 줄** (reviews/35 · 기사님 «모든 페이지 모든 팝업을 인지»).
 * 배열 차례가 판별 차례다 — 위에서부터 처음 맞는 페이지. 배차망 페이지는 묶지 않는다(우리 기준 값은 묶어도 된다).
 * 원달앱 판별은 아직 이 줄을 읽지 않는다(reviews/35 2단계에서 읽는다).
 */
interface NetworkScreenSpec {
    /** 배차망이 부르는 페이지 이름 */
    name: string;
    /** 우리 기준 페이지 — null 은 화면을 아직 못 봐 못 정함(toCollect 가 있어야 한다) */
    standard: StandardScreen | null;
    /** 알아보는 글자 — 갈래 중 하나만 맞아도 이 페이지 · 빈 배열은 아직 모름(toCollect 가 있어야 한다) */
    match: ScreenMatch[];
    /** 목록 복귀로 치나 — LIST 가 아닌 페이지에서 참이면 서버가 심사 중 콜을 치우고 원달앱이 진행을 처음부터 한다 */
    listReturn: boolean;
    overlays: ScreenOverlay[];
    seen: 'REAL' | 'SIM' | 'UNKNOWN';
    /** 근거 — 캡처 경로(이름과 내용이 다르면 괄호에 내용) 또는 로그 «폰 파일 시각» · 비면 «모을 것» */
    evidence: string[];
    /** 아직 모을 것 — 캡처 · 알아보는 글자 · 패키지 이름 */
    toCollect?: string;
    /** 글자의 원천이 서버 낱말 사전이면 그 자리(파일 · 키) — 글자는 표에 옮기지 않는다 */
    wordsFrom?: string;
}

export const NETWORK_PAGES: Record<TargetAppType, NetworkPageSpec> = /*JSON*/{
  "insung": {
    "about": ["📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/인성 · 시뮬 onedal-sim).", "⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다."],
    "excludeScan": ["memo", "payment", "tags"],
    "excludeScanWhy": "기사님 «인성은 적요»(+ 결제 괄호 «(착불)» · 구분 «왕복») — 주소 · 화주 이름 · 화면 머리 · 버튼은 안 본다",
    "addressCut": "\\(.*?\\)$",
    "addressCutWhy": "끝에 붙는 «(건물명)»을 지운다 — 첫 «(»부터 끝까지",
    "vehicleWords": [
      {"word": "오", "vehicle": "오토바이", "seen": "SIM"},
      {"word": "다", "vehicle": "다마스", "seen": "REAL"},
      {"word": "라", "vehicle": "라보", "seen": "REAL"},
      {"word": "승", "vehicle": "승용차", "seen": "SIM"},
      {"word": "1t", "vehicle": "1t", "seen": "REAL"},
      {"word": "1.4", "vehicle": "1.4t", "seen": "SIM"},
      {"word": "2.5t", "vehicle": "2.5t", "seen": "SIM"},
      {"word": "2.5", "vehicle": "2.5t", "seen": "SIM"},
      {"word": "3.5t", "vehicle": "3.5t", "seen": "SIM"},
      {"word": "3.5", "vehicle": "3.5t", "seen": "SIM"},
      {"word": "5t", "vehicle": "5t", "seen": "SIM"},
      {"word": "11t", "vehicle": "11t", "seen": "SIM"},
      {"word": "14t", "vehicle": null, "seen": "SIM"},
      {"word": "18t", "vehicle": null, "seen": "SIM"},
      {"word": "25t", "vehicle": "25t", "seen": "SIM"}
    ],
    "vehicleWordsWhy": "목록 차종 칸 한 노드(«다» · «1t») 또는 요금과 뭉친 노드(«라2.2»)의 앞 낱말 — 카드 묶기 닻도 이 낱말들이다 · REAL 은 표 견본 «1t · 다 · 라», 나머지는 시뮬레이터 목록",
    "screens": [
      {"name": "확정 뒤 상세", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["적요상세"], "any": ["인수증 전송", "카드 승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/상세-확정(다른사람 못잡음, 취소+1).png", "ex_images/인성/상세-미확정1.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정2.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정5.png (내용은 확정 뒤 상세)", "ex_images/인성/상세와확정.png (가운데 폰 — 금액 줄 «실운임 :»)"], "overlays": [
        {"name": "출발지 상세 팝업", "kind": "POPUP", "match": [{"any": ["출발지 상세", "상차지 상세"]}], "meaning": "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "seen": "REAL", "evidence": ["ex_images/인성/출발지상세.png"]},
        {"name": "도착지 상세 팝업", "kind": "POPUP", "match": [{"any": ["도착지 상세", "하차지 상세"]}], "meaning": "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "seen": "REAL", "evidence": ["ex_images/인성/도착지상세.png"]},
        {"name": "적요 상세 팝업", "kind": "POPUP", "match": [{"all": ["적요 상세", "적요 내용"]}], "meaning": "적요 전문을 보여 준다", "seen": "SIM", "evidence": ["ex_images/인성/적요상세.png (시뮬레이터 화면)"], "toCollect": "실물 캡처"},
        {"name": "취소 확인 팝업", "kind": "POPUP", "match": [], "meaning": "확정 뒤 취소를 누르면 한 번 더 묻는다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
        {"name": "취소 불가 팝업", "kind": "POPUP", "match": [{"any": ["취소할 수 없"]}], "meaning": "안전취소 시간이 지나 취소할 수 없다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
      ]},
      {"name": "확정 전 상세", "standard": "DETAIL_PRE_CONFIRM", "match": [{"all": ["적요상세", "확정"], "any": ["요금", "실운임"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/상세-미확정(다른사람 잡을수 있음).png", "ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png"], "overlays": [
        {"name": "출발지 상세 팝업", "kind": "POPUP", "match": [{"any": ["출발지 상세", "상차지 상세"]}], "meaning": "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "seen": "REAL", "evidence": ["ex_images/인성/출발지상세.png"]},
        {"name": "도착지 상세 팝업", "kind": "POPUP", "match": [{"any": ["도착지 상세", "하차지 상세"]}], "meaning": "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "seen": "REAL", "evidence": ["ex_images/인성/도착지상세.png"]},
        {"name": "적요 상세 팝업", "kind": "POPUP", "match": [{"all": ["적요 상세", "적요 내용"]}], "meaning": "적요 전문을 보여 준다", "seen": "SIM", "evidence": ["ex_images/인성/적요상세.png (시뮬레이터 화면)"], "toCollect": "실물 캡처"},
        {"name": "계산서 오더 안내 띠", "kind": "BANNER", "match": [{"any": ["계산서 발급오더의 경우"]}], "meaning": "계산서 오더 — 위수탁세금계산서 발행에 동의한 기사만 처리 · 부가세 포함 입금", "seen": "REAL", "evidence": ["ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png"]},
        {"name": "확정 확인 팝업", "kind": "POPUP", "match": [], "meaning": "확정을 누르면 한 번 더 묻는다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
        {"name": "이미 배차됨 팝업", "kind": "POPUP", "match": [], "meaning": "남이 먼저 잡았다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
        {"name": "확정 실패 팝업", "kind": "POPUP", "match": [{"any": ["시간이 지나", "실패"]}], "meaning": "확정이 안 됐다 — 적요 글의 «실패» · «시간이 지나»와 가를 머리 글자가 필요하다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 팝업 머리 글자"}
      ]},
      {"name": "신규 콜 목록", "standard": "LIST", "match": [{"all": ["신규", "빠른설정"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/위아래나뉜인성콜리스트.png", "ex_images/인성/인성콜_스플릿오더화면.png"], "overlays": [
        {"name": "로딩 토스트", "kind": "TOAST", "match": [{"any": ["오더 조회", "기다려 주십"]}], "meaning": "목록을 다시 불러오는 중 — 이 화면은 건너뛴다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"},
        {"name": "메뉴 드롭다운", "kind": "POPUP", "match": [], "meaning": "목록 머리 «메뉴»를 누르면 펼쳐진다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
        {"name": "빈 목록 안내", "kind": "BANNER", "match": [{"any": ["대기 중인 오더가 없"]}], "meaning": "지금 신규 콜이 없다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
      ]},
      {"name": "완료 탭", "standard": "MY_ORDERS", "match": [{"all": ["완료", "신규"], "none": ["빠른설정"]}], "listReturn": true, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 메시지함 · GPS 탭과 가를 글자(지금 글자는 그 탭에도 맞는다)", "overlays": []},
      {"name": "메시지함 탭", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "GPS 탭", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "게시판", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "환경설정", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "당일정산", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "전표", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "탁송", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (상세 바닥 «탁송» 버튼 뒤)", "overlays": []},
      {"name": "카드 승인", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (확정 뒤 상세 «카드 승인» 버튼 뒤)", "overlays": []},
      {"name": "인수증 전송", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (확정 뒤 상세 «인수증 전송» 버튼 뒤)", "overlays": []},
      {"name": "로그인", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []}
    ],
    "pages": {
      "list": [
        {"field": "pickup", "where": "출발지 칸", "sample": "@초이동 · @남양주(오남", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "dropoff", "where": "도착지 칸", "sample": "이태원동 · 김포(대곶면", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "reservation", "where": "출발지 칸 앞글자", "sample": "낼7시/ · 낼6시30/ · 21시/ · 오후7시30/ · 10일/", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.reservationOf"},
        {"field": "clock", "where": "도착지 칸 앞글자 (도착 약속)", "sample": "낼8/ · 8시/ · 낼10시/", "seen": "REAL", "handling": "DROPPED", "usedAt": "InsungParser.parse — 출발지 쪽이 있으면 버림"},
        {"field": "vehicleType", "where": "차종 칸", "sample": "1t · 다 · 라 · 1t화물", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
        {"field": "fare", "where": "요금 칸 (만 원)", "sample": "40.0 · 270.0", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
        {"field": "pickupDistance", "where": "거리 칸 윗줄", "sample": "17.8", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
        {"field": "deliveryDistance", "where": "거리 칸 아랫줄", "sample": "0.0 · 341.3", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"}
      ],
      "detail": [
        {"field": "stage", "where": "상태 줄", "sample": "상태 : 배송", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "상태\\s*:\\s*(?!\\S*\\s*:)(\\S+)"},
        {"field": "itemSize", "where": "물품 줄", "sample": "물품 :", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "물품[ \\t]*:[ \\t]*([^\\n]+)"},
        {"field": "vehicleType", "where": "차량 줄", "sample": "차량 : 트럭-1t · 다마스", "seen": "REAL", "handling": "READ", "usedAt": "서버 detail.ts pageFieldOf — 원달앱 값 · 목록 차종이 없을 때만(원달앱은 아직 이 칸을 안 읽는다)", "read": "차량\\s*:\\s*(?!\\S*\\s*:)([^\\s(]+)", "note": "🚚 빈 «차량 :» 뒤의 다음 이름표(«탁송료 :»)를 차종으로 잡지 않는다 — 값 토막 뒤가 바로 «:» 이면 이름표다"},
        {"field": "fare", "where": "요금 줄", "sample": "요금 : 85,000(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "목록 값 · 목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])"},
        {"field": "payment", "where": "요금 줄 괄호", "sample": "(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) · 서버 결제 칸(«착불» 정산) — 첫 괄호 «(카드)» · «(착불)» · 원달앱은 이 칸을 안 읽는다", "read": "요금\\s*:\\s*[\\d,]+\\(([^)]*)\\)"},
        {"field": "billing", "where": "요금 줄 둘째 괄호", "sample": "요금 : 85,000(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "요금\\s*:\\s*[\\d,]+\\([^)]*\\)\\(([^)]*)\\)"},
        {"field": "commission", "where": "수수료 줄", "sample": "수수료 : 23%", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "수수료\\s*:\\s*(\\d+(?:\\.\\d+)?%)"},
        {"field": "toll", "where": "탁송료 줄", "sample": "탁송료 : 3,000 · 탁송료 :(빈 칸)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다 · 빈 칸이면 다음 줄을 줍지 않는다", "read": "탁송료[ \\t]*:[ \\t]*([\\d,]+)"},
        {"field": "tags", "where": "구분 줄", "sample": "구분 : 편도", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «편도» · «왕복» · 원달앱은 이 칸을 안 읽는다", "read": "구분\\s*:\\s*(?!\\S*\\s*:)(\\S+)"},
        {"field": "reservation", "where": "형태 줄", "sample": "형태 : 보통 (실물에서 «예약»은 못 봄)", "seen": "UNKNOWN", "handling": "READ", "usedAt": "서버 원문 칸 읽기 — «보통» · «급송»(급송 isExpress 를 켜는지는 69 결정 · 서버가 켤 때까지 안 읽음) · 원달앱은 이 칸을 안 읽는다", "read": "형태\\s*:\\s*(?!\\S*\\s*:)(\\S+)"},
        {"field": "memo", "where": "적요 칸 · 적요 상세 팝업", "sample": "1시상차 6박스 카트가지고 고객님앞 갖다주세요", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — 본문 «적요상세» 줄(없으면 팝업 «적요 내용»)부터 출발지 · 도착지 팝업 머리 앞까지(적요 팝업을 못 연 상세도 본문 적요를 본다 · «[적요상세/정보]» 머리표는 시작으로 안 친다 · 사이의 버튼 글 «출발지 · 도착지 · 확정 · 취소 · 닫기»도 든다) · 원달앱은 이 칸을 안 읽는다", "read": "(?:적요상세(?!/)|적요 내용)\\s+([\\s\\S]*?)(?=\\s*(?:\\[출발지상세\\]|\\[도착지상세\\])|$)"},
        {"field": "memo", "where": "적요 상세 팝업 «적요 내용» ~ «닫기»", "sample": "까대기 있음 직접운반 / 대기 30분", "seen": "SIM", "handling": "READ", "usedAt": "서버 적요(detailMemo) — 줄바꿈을 공백으로 접는 것은 서버 · 원달앱은 이 칸을 안 읽는다", "read": "적요 내용\\s+([\\s\\S]*?)\\s*닫기", "part": "popup"},
        {"field": "memo", "where": "본문 «적요상세» 줄", "sample": "적요상세 10시전하차 착불", "seen": "SIM", "handling": "READ", "usedAt": "서버 적요(detailMemo) — 팝업이 없을 때 · 원달앱은 이 칸을 안 읽는다", "read": "적요상세(?!/)[ \\t]+([^\\n]+)", "part": "body"},
        {"field": "pickupDistance", "where": "적요 칸 둘째 줄", "sample": "현위치 → 상차지(직선)23.5KM", "seen": "REAL", "handling": "UNUSED"},
        {"field": "deliveryDistance", "where": "적요 칸 셋째 줄", "sample": "상차지 → 하차지(직선)35.9KM", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "출발지 상세 팝업 «위치»", "sample": "경기 용인시 처인구 양지면 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n위치[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)"},
        {"field": "dropoff", "where": "도착지 상세 팝업 «위치»", "sample": "서울 강남구 역삼동 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n위치[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)"},
        {"field": "clock", "where": "출발지 줄 가운데", "sample": "김유정 / 20시/양지면(용인", "seen": "REAL", "handling": "UNUSED"},
        {"field": "contact", "where": "위치 팝업", "sample": "고객 · 부서 · 담당 · 전화1 · 전화2", "seen": "SIM", "handling": "UNUSED", "usedAt": "서버가 원문으로 받는다"},
        {"field": "contact", "where": "상세 머리 줄 «배차사-전화» 앞", "sample": "고양퀵서비스-031-932-7722", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "^\\s*([^\\n]+?)-(?=\\d)", "part": "dispatcher"},
        {"field": "contact", "where": "상세 머리 줄 «배차사-전화» 뒤", "sample": "031-932-7722", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "^\\s*[^\\n]+?-(\\d[\\d-]*\\d)(?=\\s|$)", "part": "dispatcherPhone"},
        {"field": "contact", "where": "출발지 상세 팝업 «고객»", "sample": "고객 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n고객[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.customer"},
        {"field": "contact", "where": "출발지 상세 팝업 «부서»", "sample": "부서 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n부서[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.department"},
        {"field": "contact", "where": "출발지 상세 팝업 «담당»", "sample": "담당 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n담당[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.contactName"},
        {"field": "contact", "where": "출발지 상세 팝업 «전화1»", "sample": "전화1 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n전화1[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.phone1"},
        {"field": "contact", "where": "출발지 상세 팝업 «전화2»", "sample": "전화2 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n전화2[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.phone2"},
        {"field": "contact", "where": "도착지 상세 팝업 «고객»", "sample": "고객 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n고객[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.customer"},
        {"field": "contact", "where": "도착지 상세 팝업 «부서»", "sample": "부서 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n부서[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.department"},
        {"field": "contact", "where": "도착지 상세 팝업 «담당»", "sample": "담당 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n담당[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.contactName"},
        {"field": "contact", "where": "도착지 상세 팝업 «전화1»", "sample": "전화1 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n전화1[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.phone1"},
        {"field": "contact", "where": "도착지 상세 팝업 «전화2»", "sample": "전화2 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n전화2[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.phone2"}
      ],
      "confirm": [
        {"field": "pickup", "where": "출발지 줄", "sample": "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
        {"field": "dropoff", "where": "도착지 줄", "sample": "서울강남구 / 역삼동 / 이희억", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
        {"field": "fare", "where": "요금 줄", "sample": "요금 : 40,000(신용)", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen — PageFieldRead", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])"},
        {"field": "contact", "where": "머리 줄", "sample": "(주)신한로직스-1588-5480", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "적요 칸", "sample": "1시상차 6박스 …", "seen": "REAL", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "stage", "where": "완료 탭 줄 배지", "sample": "완료", "seen": "SIM", "handling": "UNUSED"},
        {"field": "contact", "where": "완료 탭 줄", "sample": "회사 이름", "seen": "SIM", "handling": "UNUSED"},
        {"field": "clock", "where": "완료 탭 줄", "sample": "상차 시각 · 하차 시각", "seen": "SIM", "handling": "UNUSED"}
      ]
    }
  },
  "hwamul24": {
    "about": ["📄 **화물24시 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/화물24시).", "⚠️ 실물 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처가 근거다. 시뮬 상세 화면은 실물과 모양이 달라(머리 «배차내역») 상세까지 못 간다."],
    "excludeScan": ["memo", "payment"],
    "excludeScanWhy": "기사님 «화물24시는 화물정보»(+ 결제방법 «착불») — 화주 이름 줄(«화물과퀵») · «60분 안보기» · 버튼 · 주소는 안 본다",
    "addressCut": ",[\\s\\S]*$",
    "addressCutWhy": "첫 쉼표부터 끝(뒤 상세 주소)을 지운다",
    "vehicleWords": [
      {"word": "1톤", "vehicle": "1t", "seen": "REAL"},
      {"word": "1.4톤", "vehicle": "1.4t", "seen": "SIM"},
      {"word": "2.5톤", "vehicle": "2.5t", "seen": "REAL"},
      {"word": "3.5톤", "vehicle": "3.5t", "seen": "REAL"},
      {"word": "5톤", "vehicle": "5t", "seen": "SIM"},
      {"word": "11톤", "vehicle": "11t", "seen": "SIM"},
      {"word": "25톤", "vehicle": "25t", "seen": "SIM"},
      {"word": "다마스", "vehicle": "다마스", "seen": "SIM"},
      {"word": "라보", "vehicle": "라보", "seen": "SIM"},
      {"word": "오토바이", "vehicle": "오토바이", "seen": "SIM"},
      {"word": "승용", "vehicle": "승용차", "seen": "SIM"}
    ],
    "vehicleWordsWhy": "목록 셋째 줄 «낱말/…»(«1톤/전체» · «2.5톤/윙» · «다마스/전체»)의 첫 «/» 앞 낱말 — REAL 은 실물 캡처 17 · 실물 목록, SIM 은 시뮬레이터 목록에서만 봤다",
    "screens": [
      {"name": "화물상세정보", "standard": "DETAIL_PRE_CONFIRM", "match": [{"all": ["화물상세정보", "배차신청"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/18_화물상세정보_배차신청.png", "ex_images/화물24시/51_회원가입_약관.png (내용은 화물상세정보)"], "overlays": [
        {"name": "배차 실패 오류", "kind": "POPUP", "match": [{"any": ["이미 배차", "배차할 수 없"]}], "meaning": "배차신청이 안 됐다 — 남이 먼저 잡았거나 조건 미달", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
      ]},
      {"name": "배차내역 상세 · 화주정보 탭", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["배차내역", "02 화주정보", "사업장주소"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/21_화물상세_화주정보_전화번호.png"], "overlays": []},
      {"name": "배차내역 상세 · 결제정보 탭", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["배차내역", "03 결제정보", "수금상태"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/22_화물상세_결제정보.png"], "overlays": []},
      {"name": "배차내역 상세 · 화물정보 탭", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["배차내역", "02 화주정보", "배차시간"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/04_배차상세_화물정보_상단.png", "ex_images/화물24시/05_배차상세_화물정보_하단.png", "ex_images/화물24시/06_배차상세_계산서발행.png", "ex_images/화물24시/10_배차상세_인수증.png", "ex_images/화물24시/13_배차상세_예약건.png", "ex_images/화물24시/24_세금계산서발행_계좌입력.png (내용은 화물정보 탭 위 «인수증 전송» 팝업)", "ex_images/화물24시/52_앱접근성_권한.png (내용은 화물정보 탭)"], "overlays": [
        {"name": "인수증 전송 확인", "kind": "POPUP", "match": [{"all": ["인수증을 전송하시겠습니까"]}], "meaning": "인수증 사진을 화주에게 보낼지 묻는다", "seen": "REAL", "evidence": ["ex_images/화물24시/24_세금계산서발행_계좌입력.png (내용은 «인수증 전송» 팝업)"]},
        {"name": "세금계산서 수정발행 창", "kind": "POPUP", "match": [{"all": ["계산서발행"], "any": ["수정사유", "공급가액변동"]}], "meaning": "발행한 세금계산서를 고쳐 다시 발행한다", "seen": "REAL", "evidence": ["ex_images/화물24시/08_세금계산서_수정발행_팝업.png", "ex_images/화물24시/09_세금계산서_수정발행_입력.png"]},
        {"name": "계좌입력 확인", "kind": "POPUP", "match": [{"all": ["입금계좌에 계좌정보를 입력하시겠습니까"]}], "meaning": "세금계산서 창에서 입금계좌를 넣을지 묻는다", "seen": "REAL", "evidence": ["ex_images/화물24시/08_세금계산서_수정발행_팝업.png"]},
        {"name": "세금계산서 발행 창", "kind": "POPUP", "match": [{"all": ["계산서발행", "작성일자"], "none": ["수정사유", "공급가액변동"]}], "meaning": "세금계산서를 처음 발행한다(공급자 · 공급받는자 입력)", "seen": "REAL", "evidence": ["ex_images/화물24시/12_세금계산서_발행폼.png", "ex_images/화물24시/23_세금계산서발행_입력창.png"]}
      ]},
      {"name": "화물배차정보요약", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["화물배차정보요약"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/14_화물배차정보요약.png", "ex_images/화물24시/15_화물배차정보요약_메뉴.png (녹화 앱 메뉴가 겹침)"], "overlays": []},
      {"name": "배차내역 목록", "standard": "MY_ORDERS", "match": [{"all": ["배차내역", "자세히 보기"], "none": ["02 화주정보"]}], "listReturn": true, "seen": "REAL", "evidence": ["ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/11_배차내역_수금목록.png", "ex_images/화물24시/20_배차내역_목록.png"], "overlays": [
        {"name": "안내 띠", "kind": "BANNER", "match": [], "meaning": "전자세금계산서 · 수금 안내 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/20_배차내역_목록.png"], "toCollect": "바뀌지 않는 알아볼 글자"}
      ]},
      {"name": "화물정보 검색조건", "standard": "NETWORK_MENU", "match": [{"all": ["화물정보", "검색조건", "저장 후 검색"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/38_세금계산서_목록.png (내용은 검색조건)", "ex_images/화물24시/39_계산서_발행폼.png (내용은 검색조건)", "ex_images/화물24시/41_마이페이지_메인.png (내용은 검색조건 + 하차일 선택)", "ex_images/화물24시/42_설정_알림.png (내용은 검색조건 + 내위치 반경 선택)"], "overlays": [
        {"name": "하차일 선택 시트", "kind": "POPUP", "match": [{"all": ["하차일 선택"]}], "meaning": "검색조건의 하차일(전체 · 당착 · 내착 · 월착)을 고른다", "seen": "REAL", "evidence": ["ex_images/화물24시/41_마이페이지_메인.png (내용은 검색조건 + 하차일 선택)"]},
        {"name": "내위치 반경 선택 시트", "kind": "POPUP", "match": [{"all": ["내위치 반경 선택"]}], "meaning": "검색조건의 내 위치 반경(5 ~ 30Km)을 고른다", "seen": "REAL", "evidence": ["ex_images/화물24시/42_설정_알림.png (내용은 검색조건 + 내위치 반경 선택)"]}
      ]},
      {"name": "화물정보(실시간 목록)", "standard": "LIST", "match": [{"all": ["화물정보", "자동새로고침", "자동터치"], "none": ["저장 후 검색"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/17_화물정보_리스트.png", "ex_images/화물24시/32_오더목록_기본.png", "ex_images/화물24시/35_배차완료_내역.png (내용은 실시간 목록)", "ex_images/화물24시/36_화물정보_전체.png", "ex_images/화물24시/37_화물상세_요약.png (내용은 실시간 목록)", "ex_images/화물24시/40_인수증_전송화면.png (내용은 실시간 목록)", "ex_images/화물24시/43_공지사항_리스트.png (내용은 실시간 목록)", "ex_images/화물24시/44_공지_상세내용.png (내용은 실시간 목록)", "ex_images/화물24시/45_고객센터_메뉴.png (내용은 실시간 목록 · 자동새로고침 OFF)", "ex_images/화물24시/46_자주묻는질문.png (내용은 실시간 목록)", "ex_images/화물24시/47_이벤트_안내.png (내용은 실시간 목록)", "ex_images/화물24시/48_이벤트_상세정보.png (내용은 실시간 목록)", "ex_images/화물24시/49_로그아웃_팝업.png (내용은 실시간 목록)", "ex_images/화물24시/50_로그인_입력.png (내용은 실시간 목록)"], "overlays": [
        {"name": "자동터치 동의", "kind": "POPUP", "match": [{"any": ["자동터치 사용시", "동의하십니까"]}], "meaning": "자동터치를 켤 때 책임 동의를 묻는다", "seen": "REAL", "evidence": ["ex_images/화물24시/47_이벤트_안내.png (내용은 실시간 목록 위 «알림» 팝업)"]},
        {"name": "저장완료 토스트", "kind": "TOAST", "match": [{"all": ["저장완료"]}], "meaning": "검색조건을 저장했다", "seen": "REAL", "evidence": ["ex_images/화물24시/43_공지사항_리스트.png (내용은 실시간 목록 위 토스트)"]},
        {"name": "자동터치 시작 토스트", "kind": "TOAST", "match": [{"all": ["자동터치 시작"]}], "meaning": "배차망 자체 자동터치를 켰다", "seen": "REAL", "evidence": ["ex_images/화물24시/48_이벤트_상세정보.png (내용은 실시간 목록 위 토스트)"]}
      ]},
      {"name": "홈 «전국24시콜화물»", "standard": "HOME", "match": [{"all": ["전국24시콜화물"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/01_메인_홈화면.png", "ex_images/화물24시/28_인수증_업로드.png (내용은 홈)", "ex_images/화물24시/33_오더상세_지도.png (내용은 홈)"], "overlays": []},
      {"name": "가상계좌 정보", "standard": "NETWORK_MENU", "match": [{"all": ["가상계좌 정보", "출금가능금액"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/34_배차신청_확인.png (내용은 가상계좌 정보)"], "overlays": []},
      {"name": "인수증 보관", "standard": "NETWORK_MENU", "match": [{"all": ["인수증 보관기간"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/07_인수증_목록.png", "ex_images/화물24시/25_배차내역_목록2.png (내용은 인수증 보관)", "ex_images/화물24시/27_인수증_보관함.png"], "overlays": [
        {"name": "인수증 전송 창", "kind": "POPUP", "match": [{"all": ["인수증 등록방법 선택"]}], "meaning": "인수증 사진을 카메라 · 갤러리에서 올린다", "seen": "REAL", "evidence": ["ex_images/화물24시/26_인수증전송_팝업.png"]}
      ]},
      {"name": "세금계산서 발행내역 상세", "standard": "NETWORK_MENU", "match": [{"all": ["전자세금계산서 정보", "국세청승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/30_세금계산서_미발행목록.png (내용은 발행내역 상세)"], "overlays": []},
      {"name": "세금계산서 발행내역 목록", "standard": "NETWORK_MENU", "match": [{"all": ["세금계산서 발행내역", "승인번호"], "none": ["국세청승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/29_세금계산서_수신내역.png (내용은 발행내역 목록)", "ex_images/화물24시/31_세금계산서_발행완료목록.png (내용은 발행내역 목록)"], "overlays": []},
      {"name": "마이페이지", "standard": "NETWORK_MENU", "match": [{"all": ["마이페이지", "가상계좌 정보", "적재물보험 정보"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/02_마이페이지.png", "ex_images/화물24시/19_마이페이지_메뉴.png"], "overlays": []},
      {"name": "배차신청 누른 뒤", "standard": null, "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 · 우리 기준 페이지", "overlays": []},
      {"name": "환경설정", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (아래 탭 «환경설정» 뒤)", "overlays": []},
      {"name": "로그인", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
      {"name": "화물등록", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «화물등록» 칸 뒤)", "overlays": []},
      {"name": "음성등록", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «음성등록» 칸 뒤)", "overlays": []},
      {"name": "스마트배차", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «스마트배차» 칸 뒤)", "overlays": []},
      {"name": "협력업체", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «협력업체» 칸 뒤)", "overlays": []},
      {"name": "고객센터", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «고객센터» 칸 뒤)", "overlays": []},
      {"name": "공지사항", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «공지사항» 칸 뒤)", "overlays": []},
      {"name": "사진전송", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «사진전송» 칸 뒤)", "overlays": []},
      {"name": "정보이용료 세금계산서 신청", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «정보이용료 세금계산서 신청» 뒤)", "overlays": []},
      {"name": "스티커 사진전송", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «스티커 사진전송» 뒤)", "overlays": []},
      {"name": "전자세금계산서 수신내역", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «전자세금계산서 수신내역» 뒤)", "overlays": []},
      {"name": "카드결제지원 서비스", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «카드결제지원 서비스» 뒤)", "overlays": []},
      {"name": "적재물보험 정보", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «적재물보험 정보» 뒤)", "overlays": []},
      {"name": "매출내역 신청", "standard": "NETWORK_MENU", "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «매출내역 신청» 뒤)", "overlays": []}
    ],
    "pages": {
      "list": [
        {"field": "pickup", "where": "왼쪽 윗줄", "sample": "경기 시흥 정왕동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "dropoff", "where": "오른쪽 윗줄", "sample": "경기 안산 상록구 장상동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "fare", "where": "오른쪽 아랫줄", "sample": "50,000원", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.fareOf"},
        {"field": "vehicleType", "where": "셋째 줄 앞", "sample": "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
        {"field": "pickupDistance", "where": "상차 배지 옆", "sample": "15Km", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.pickupDistanceOf"},
        {"field": "reservation", "where": "상차 배지", "sample": "당상 · 내상(실물 캡처에는 없음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.reservationOf"},
        {"field": "tags", "where": "하차 배지 · 꼬리표", "sample": "당착 · 내착 (읽음) · 수 · 지 · 독차 · 인수증 (잡음으로 뺌)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.badgesOf"},
        {"field": "memo", "where": "셋째 줄 화물 글", "sample": "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24MemoTimes.split — 상차 쪽만 예약으로"},
        {"field": "clock", "where": "하차 배지 앞 시각", "sample": "06:32 (등록 시각인지 모름)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse — postTime"}
      ],
      "detail": [
        {"field": "orderNo", "where": "머리", "sample": "화물번호:3-9483-2159", "seen": "REAL", "handling": "UNUSED"},
        {"field": "clock", "where": "머리", "sample": "등록시간:05:18분", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "상차지 칸", "sample": "경기 군포 부곡동 [당상][수] 5Km", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
        {"field": "dropoff", "where": "하차지 칸", "sample": "서울 중구 을지로6가 [당착][수]", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
        {"field": "deliveryDistance", "where": "하차지 칸 오른쪽", "sample": "36Km", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "화물정보 칸", "sample": "지금상 당착 59박스 수/수-A [독차]", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «화물정보» 다음 «톤수» 앞(배지 «독차» 포함) · 원달앱은 이 칸을 안 읽는다", "read": "화물정보\\s+(?!톤수)([\\s\\S]*?)(?=\\s+톤수|$)"},
        {"field": "vehicleType", "where": "톤수 · 차종 · 적재중량", "sample": "1톤 · 전체 · 1톤", "seen": "REAL", "handling": "UNUSED"},
        {"field": "tags", "where": "운행방법", "sample": "편도", "seen": "REAL", "handling": "UNUSED"},
        {"field": "fare", "where": "운송료 · 부가세 · 수납금액", "sample": "60,000 · 6,000 · 65,144", "seen": "REAL", "handling": "READ", "usedAt": "목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "운송료\\s*:?\\s*([\\d,]+)", "note": "💰 목록 요금과 같은 «운송료»만 — 실물은 «운송료» · «60,000» 이 다른 노드, 시뮬은 «60,000원» (부가세 · 수납금액은 안 읽음)"},
        {"field": "payment", "where": "결제방법", "sample": "카드", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) · 관제웹 결제 칸(서버 pageFieldOf) — «카드» · «착불» · 원달앱은 이 칸을 안 읽는다", "read": "결제방법\\s+(?!\\S*\\s*:)(\\S+)"},
        {"field": "commission", "where": "수수료 줄", "sample": "수수료 = (운송료+부가세) x1.298%", "seen": "REAL", "handling": "UNUSED"}
      ],
      "confirm": [
        {"field": "stage", "where": "배차신청 뒤 화면", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "dropoff", "where": "배차내역 상세 하차지", "sample": "서울 강서 외발산동 [당착] 92Km", "seen": "REAL", "handling": "UNUSED"},
        {"field": "memo", "where": "배차내역 상세 화물정보", "sample": "예약 당일오후1시상 당착 다발무상.하차해줌", "seen": "REAL", "handling": "UNUSED"},
        {"field": "reservation", "where": "배차내역 상세 배지", "sample": "[예약]", "seen": "REAL", "handling": "UNUSED"},
        {"field": "clock", "where": "하차시간", "sample": "2025-11-23 20:43분", "seen": "REAL", "handling": "UNUSED"}
      ]
    }
  },
  "kakaopicker": {
    "about": ["📄 **카카오 픽커 페이지 정의 — 화면 어디에 어떤 글자로 오나** (reviews/24 · 실물 캡처 ex_images/카카오픽커/실물_2026 · 실물 로그).", "칸 이름은 세 배차망 공통(`PageField`) — 여기에는 «어디서 · 어떤 글자로»만 적는다.", "안 읽는·버리는 칸(UNUSED·DROPPED)이 다음에 읽을 재료다."],
    "excludeScan": ["itemSize", "memo"],
    "excludeScanWhy": "기사님 «카카오픽커는 물품정보»+«가» 유의사항 — 둘 다 «최종 수익» · 버튼 앞에서 끝난다 · 픽업지 주소 · 목록 잔상은 안 본다",
    "addressCut": null,
    "addressCutWhy": "지우지 않는다 — 원달앱이 이미 «구 동»으로 정리해 보낸다(앞뒤 공백만)",
    "screens": [
      {"name": "홈(출근 전)", "standard": "HOME", "match": [{"all": ["시작하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"], "overlays": [
        {"name": "관심 일거리 상자", "kind": "POPUP", "match": [], "meaning": "관심 일거리를 고르라는 광고 상자", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"], "wordsFrom": "server/config/keywords_picker.json adStartWords"},
        {"name": "일거리 광고 줄", "kind": "BANNER", "match": [], "meaning": "«이런 일거리 어떤가요?» 광고", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png"], "wordsFrom": "server/config/keywords_picker.json adStartWords"},
        {"name": "프로모션 띠", "kind": "BANNER", "match": [], "meaning": "프로모션 안내 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png"], "toCollect": "바뀌지 않는 알아볼 글자"}
      ]},
      {"name": "배송 완료", "standard": "RUN_DONE", "match": [{"all": ["물품이 안전하게 전달"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg", "ex_images/카카오픽커/실물_2026/32_배송완료_2387P_같은장면.jpeg"], "overlays": [
        {"name": "광고 띠", "kind": "BANNER", "match": [], "meaning": "제휴 배송 광고 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg"], "toCollect": "바뀌지 않는 알아볼 글자"}
      ]},
      {"name": "퀵 배송 완료하기", "standard": "RUN_AT_DROPOFF", "match": [{"all": ["배송 완료하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22-1_퀵_배송_완료하기.png"], "overlays": []},
      {"name": "퀵 배송 출발하기", "standard": "RUN_TO_DROPOFF", "match": [{"all": ["배송 출발하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22-1_퀵_배송_출발하기.png"], "overlays": []},
      {"name": "퀵 픽업 완료하기", "standard": "RUN_AT_PICKUP", "match": [{"all": ["픽업 완료하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"], "overlays": [
        {"name": "픽업 지연 제목", "kind": "BANNER", "match": [{"any": ["픽업이 지연되고 있어요"]}], "meaning": "픽업이 늦었다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"], "toCollect": "원달앱이 읽는 글자인지(퀵 머리 글자는 로그에 안 나온다)"}
      ]},
      {"name": "퀵 픽업 출발하기", "standard": "RUN_TO_PICKUP", "match": [{"all": ["픽업 출발하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg", "ex_images/카카오픽커/실물_20260913_내가찍음/37_기사님캡처_1158_요기요2883.jpg", "A24 폰 로그 09-13 11:55:15 · 11:56:32"], "overlays": [
        {"name": "출발 독촉 제목", "kind": "BANNER", "match": [{"any": ["지금 바로 출발해 주세요"]}], "meaning": "픽업이 늦었다 — 바로 출발하라", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg"], "toCollect": "원달앱이 읽는 글자인지(A24 로그 11:55~11:56 에 안 나옴)"}
      ]},
      {"name": "도보 픽업지 도착", "standard": "RUN_AT_PICKUP", "match": [{"all": ["밀어서 픽업 완료"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17_픽업시트_밀어서픽업완료.jpeg"], "overlays": []},
      {"name": "도보 배송지 도착", "standard": "RUN_AT_DROPOFF", "match": [{"all": ["밀어서 사진 촬영"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22_배송시트_밀어서사진촬영.jpeg"], "overlays": []},
      {"name": "인증사진 촬영", "standard": "RUN_AT_DROPOFF", "match": [{"all": ["인증사진 촬영"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/25_인증사진촬영_카메라.jpeg"], "toCollect": "원달앱이 읽는 글자(로그) — 픽커 안 카메라 화면이다", "overlays": []},
      {"name": "촬영 확인", "standard": "RUN_AT_DROPOFF", "match": [{"all": ["촬영 확인", "문자 전송"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/26_촬영확인_문자전송.jpeg"], "overlays": []},
      {"name": "문자 전송", "standard": "RUN_AT_DROPOFF", "match": [{"all": ["문자 재전송"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/30_문자전송후_배송완료버튼.jpeg"], "overlays": []},
      {"name": "도보 배송 중", "standard": "RUN_TO_DROPOFF", "match": [{"any": ["배송 시간", "물품 파손"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/21_배송중_배송시간15분남음.jpeg"], "overlays": [
        {"name": "배송 완료 확인", "kind": "POPUP", "match": [{"all": ["배송을 완료하셨나요"]}], "meaning": "배송 목표 시간이 다가온다 — 완료했는지 묻는다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/24_배송완료확인_팝업.jpeg"]}
      ]},
      {"name": "도보 픽업 이동", "standard": "RUN_TO_PICKUP", "match": [{"any": ["픽업 준비", "픽업지 근처에"], "none": ["수락하기", "목록 지도"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/16_픽업이동_준비13분_배송33분.jpeg", "ex_images/카카오픽커/실물_2026/18_픽업이동_준비완료_배송25분.jpeg"], "overlays": [
        {"name": "배정 취소 불가", "kind": "POPUP", "match": [{"all": ["배정 취소 불가"]}], "meaning": "취소 가능 시간이 지나 배정을 취소할 수 없다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/19_배정취소불가_팝업.jpeg"]}
      ]},
      {"name": "수락 후 오더 전체", "standard": "DETAIL_CONFIRMED", "match": [{"all": ["오더 정보", "최종 수익"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/23_수락후_오더전체_최종수익2387.jpeg"], "toCollect": "원달앱이 읽는 글자(로그)", "overlays": []},
      {"name": "도움말", "standard": "NETWORK_MENU", "match": [{"all": ["자주 묻는 질문", "고객센터 연결"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/20_도움말_픽업FAQ_오더번호.jpeg"], "overlays": []},
      {"name": "상세(수락 전 시트)", "standard": "DETAIL_PRE_CONFIRM", "match": [{"all": ["넘기기", "수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/05_상세_지도_수락하기.png", "ex_images/카카오픽커/실물_2026/06_상세_마감시각_준비시간.jpeg", "ex_images/카카오픽커/실물_2026/07_상세_최종수익분해.jpeg", "ex_images/카카오픽커/실물_2026/08_상세_지도_판교.jpeg", "ex_images/카카오픽커/실물_2026/09_상세_가격오르기전_9693.jpeg", "ex_images/카카오픽커/실물_2026/10_상세_가격오른뒤_11393.jpeg", "ex_images/카카오픽커/실물_2026/10-1_상세_시트(상).jpeg", "ex_images/카카오픽커/실물_2026/10-2_상세_시트(중).jpeg", "ex_images/카카오픽커/실물_2026/10-3_상세_시트(하).jpeg", "ex_images/카카오픽커/실물_2026/33_상세_예약콜_위례_삼성2동.png"], "overlays": [
        {"name": "첫 계약 필수정보", "kind": "POPUP", "match": [{"all": ["필수 정보를 입력해 주세요"]}], "meaning": "이메일 · 거주지를 넣어야 수락할 수 있다(한 번만)", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/14_첫계약_필수정보입력_팝업_1회성.jpeg"]},
        {"name": "배정 실패 오류", "kind": "POPUP", "match": [{"any": ["이미 배정이 완료된", "다른 기사에게 배정"]}], "meaning": "수락했지만 남이 먼저 잡았다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
      ]},
      {"name": "내 오더 탭", "standard": "MY_ORDERS", "match": [{"all": ["목록 지도", "신규", "내 오더"], "none": ["리스트 설정", "수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15_내오더탭_픽업준비14분남음.jpeg", "ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg", "ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png"], "overlays": [
        {"name": "오더 없음 안내", "kind": "BANNER", "match": [{"all": ["진행 중인 오더가 없어요"]}], "meaning": "진행 중인 오더가 없다 — 수락의 증거가 아니다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg"]},
        {"name": "수락 토스트", "kind": "TOAST", "match": [{"all": ["오더를 수락했습니다"]}], "meaning": "방금 수락이 됐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png"]},
        {"name": "합짐 개수 띠", "kind": "BANNER", "match": [{"all": ["최대 합짐 개수"]}], "meaning": "퀵을 몇 건까지 합짐할 수 있나", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg"]}
      ]},
      {"name": "신규 리스트", "standard": "LIST", "match": [{"all": ["리스트 설정"]}, {"none": ["수락하기", "목록 지도"], "shape": {"read": "\\d+(?:\\.\\d+)?km\\s.{0,40}?\\d{1,3}(?:,\\d{3})+", "min": 3}}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13_리스트_가까운순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-1_신규_리스트(퀵,중형,반나절,승,예약).jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg (내려감)"], "overlays": [
        {"name": "«배정» 알림", "kind": "NOTICE", "match": [{"any": ["방금 배정된 오더", "이미 배정이 완료된"]}], "meaning": "남이 먼저 잡았다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "실물 로그 09-30 13:08:45 «방금 배정된 오더»"]},
        {"name": "광고 줄", "kind": "BANNER", "match": [], "meaning": "목록 사이에 끼는 일거리 광고", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처", "wordsFrom": "server/config/keywords_picker.json adStartWords"},
        {"name": "정렬 시트", "kind": "POPUP", "match": [], "meaning": "목록 정렬(높은 가격순 · 추천순 · 가까운순 …)을 고른다", "seen": "REAL", "evidence": ["A24 폰 로그 10-02 09:14:30"], "toCollect": "캡처 · 알아보는 글자"},
        {"name": "오더카드 대기 띠", "kind": "BANNER", "match": [{"all": ["오더카드 대기 중"]}], "meaning": "지금 오더카드 없음 · 대기 중 — 늘 맨 위에 붙는다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg"]},
        {"name": "오더카드", "kind": "BANNER", "match": [], "meaning": "대기 띠 자리에 들어온 오더 한 건 — 띠 안에 «P 수락» 버튼이 있다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg"], "toCollect": "알아보는 글자(로그)"},
        {"name": "서포트 모드 띠", "kind": "BANNER", "match": [{"all": ["서포트 모드 1장 받기"]}], "meaning": "퀵 서포트 모드 받기 진행 안내", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png"]}
      ]},
      {"name": "콜을 누른 직후 넘어가는 틀", "standard": "TRANSITION", "match": [{"any": ["서포트모드", "서포트 모드"], "none": ["리스트 설정", "수락하기", "목록 지도"], "shape": {"read": "\\d+(?:\\.\\d+)?km\\s.{0,40}?\\d{1,3}(?:,\\d{3})+", "max": 2}}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-02 09:20:45 · 09:31:17 · 09:48:01 · 09:53:16"], "toCollect": "캡처 — 0.3~0.7초라 로그만 있다", "overlays": []},
      {"name": "안드로이드 공유 시트", "standard": "OTHER_APP", "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/27_공유시트_문자앱고르기.jpeg"], "toCollect": "패키지 이름", "overlays": []},
      {"name": "메시지 앱 문자 작성", "standard": "OTHER_APP", "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/29_문자작성_배송완료MMS.jpeg"], "toCollect": "패키지 이름", "overlays": []},
      {"name": "메시지 앱 채팅+ 안내", "standard": "OTHER_APP", "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/28_채팅플러스_안내.jpeg"], "toCollect": "패키지 이름", "overlays": []}
    ],
    "pages": {
      "list": [
        {"field": "fare", "where": "목록 줄 오른쪽", "sample": "16,093", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "pickupDistance", "where": "몸통 줄 맨 앞", "sample": "4.7km", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "itemSize", "where": "꼬리표 줄", "sample": "중형", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "tags", "where": "꼬리표 줄", "sample": "퀵 반나절 승", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "reservation", "where": "꼬리표 줄 «예약» 뒤", "sample": "예약 내일 · 예약 18:30 · 예약 9/30(수) · 예약", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.listReservation"},
        {"field": "remaining", "where": "꼬리표 줄", "sample": "준비 29분 · 31분 내", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse (꼬리표)"},
        {"field": "pickup", "where": "몸통 줄 — 시·구 줄임 + 동", "sample": "광주 경안", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
        {"field": "dropoff", "where": "꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동", "sample": "용산 한남", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"}
      ],
      "detail": [
        {"field": "tags", "where": "사진 위쪽 꼬리표 줄", "sample": "퀵 반나절 예약", "seen": "REAL", "handling": "UNUSED"},
        {"field": "reservation", "where": "사진 띠", "sample": "내일 14:00 픽업예약", "seen": "REAL", "handling": "READ", "usedAt": "PickerDetailOcrParser.detailReservation"},
        {"field": "pickup", "where": "사진 첫 정거장 — 행정동 + 건물", "sample": "경기 광주시 경안동 / 람미당", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
        {"field": "dropoff", "where": "사진 둘째 정거장", "sample": "서울 용산구 한남동 / 아라마크", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
        {"field": "pickupDistance", "where": "사진 정거장 오른쪽", "sample": "픽업 4.7km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
        {"field": "deliveryDistance", "where": "사진 정거장 오른쪽", "sample": "배송 26.4km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
        {"field": "clock", "where": "사진 정거장 시각", "sample": "내일 17:49 · 12:39까지", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — 하차 at 읽고 안 씀"},
        {"field": "itemSize", "where": "사진 물품 정보", "sample": "중형 세 변의 합 140cm · 20kg 이하", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail · 서버 제외어 찾는 칸(excludeScan) — 접근성 글에서 «최종 수익» · «유의사항» · 버튼 앞까지 · 관제웹 물품 칸(서버 pageFieldOf)", "read": "물품\\s*정보\\s+([\\s\\S]*?)(?=\\s+유의사항|\\s+최종 수익|\\s+넘기기|\\s+수락하기|$)"},
        {"field": "memo", "where": "사진 유의사항", "sample": "바로 배송가주실 분만 잡아주세요", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «유의사항» 다음 «최종 수익» · 버튼 앞 · 원달앱은 이 칸을 안 읽는다(사진 판독도 안 씀)", "read": "유의사항\\s+([\\s\\S]*?)(?=\\s+최종 수익|\\s+넘기기|\\s+수락하기|$)"},
        {"field": "fare", "where": "상세 아래 최종 수익", "sample": "최종 수익 2,387", "seen": "REAL", "handling": "UNUSED"}
      ],
      "confirm": [
        {"field": "stage", "where": "픽업 시트 머리", "sample": "지금 바로 출발해 주세요 · 픽업이 지연되고 있어요", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
        {"field": "remaining", "where": "시트 머리", "sample": "준비 13분 · 배송 33분", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "시트 픽업지", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
        {"field": "dropoff", "where": "시트 배송지", "sample": "쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"}
      ],
      "myorders": [
        {"field": "stage", "where": "내 오더 줄 머리", "sample": "픽업 준비 14분 남음", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
        {"field": "remaining", "where": "내 오더 줄 머리", "sample": "14분 남음", "seen": "REAL", "handling": "UNUSED"},
        {"field": "pickup", "where": "픽업 배지 옆", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
        {"field": "dropoff", "where": "배송지 줄", "sample": "배송지: 쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"},
        {"field": "tags", "where": "오른쪽 배지", "sample": "도보", "seen": "REAL", "handling": "UNUSED"}
      ]
    }
  }
}/*JSON*/ as Record<TargetAppType, NetworkPageSpec>;
