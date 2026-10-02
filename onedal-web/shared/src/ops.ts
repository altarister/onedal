import type { Color } from './judge';
import type { TargetAppType, DeviceSession, AutoDispatchFilter, JudgmentSnapshot } from './index';
import type { ContentKind } from './join';
import type { WordKind } from './pageFields';
import type { CargoUnit } from './cargoUnits';
import type { FlowCell, WatchedHour } from './flowViews';
import { kstDateText } from './format';

/**
 * 🏢 **운영센터 API 규격 — 타입 + 회원 상태 규칙(순수)** (reviews/29 · 운영센터 `ops/` 와 서버 문 `/api/ops/*` 가 같은 모양을 읽는다).
 *    값 계산은 없다. 회원 상태는 이름 한 칸이 아니라 **사실 시각 칸**이다 — «승인 대기 · 사용 중 · 정지»는 화면이 시각을 보고 글로만 만든다.
 */

export interface OpsMember {
    id: string;
    name: string;
    email: string;
    phone: string;
    vehicle: string;
    networks: TargetAppType[];
    role: 'ADMIN' | 'USER';
    createdAt: string;
    approvedAt: string | null;
    suspendedAt: string | null;
    suspendAfterActive: boolean;
    withdrawnAt: string | null;
    paidUntil: string | null;
    /** 허락은 «허락 시각»(비면 안 켜짐) + «기한»(비면 기한 없음) 두 칸 — 상태 이름 한 칸이 아니다 (reviews/29 4장) */
    autoAllowedAt: string | null;
    autoUntil: string | null;
    statsAllowedAt: string | null;
    statsUntil: string | null;
    /** 운영센터에 들어올 수 있나 — 비면 못 들어온다 (기사님 = 기사 + 관리자 · reviews/29 기준 4) */
    opsAllowedAt: string | null;
    phones: OpsPhone[];
}

export interface OpsPhone {
    deviceId: string;
    deviceName: string;
    memberId: string;
    status: 'ONLINE' | 'OFFLINE';
    offlineReason: string | null;
    lastSeenAt: string;
    appVersion: string;
    mode: 'AUTO' | 'ALARM' | 'MANUAL';
    locationOn: boolean;
}

export interface OpsCall {
    id: string;
    memberId: string;
    targetApp: TargetAppType;
    status: string;
    verdict: Color;
    needsCall: boolean;
    pickup: { place: string; phone: string | null; address: string; at: string | null };
    dropoff: { place: string; phone: string | null; address: string; at: string | null };
    fare: number;
    capturedAt: string;
    callNote: OpsCallNote | null;
    /** 📵 상대 취소가 적힌 통화 행마다(통화를 마쳤든 아니든) — 없으면 빈 배열 · by 는 적은 사람 이름 */
    counterpartCancelled: Array<{ stopType: 'pickup' | 'dropoff'; at: string; by: string }>;
}

/**
 * 통화 도우미가 적는 결과 — 기사가 쓰는 «통화함» 규격과 같은 구조 값(짐을 글자로 받으면 판정이 못 굳는다) + 누가 적었나.
 * «상대가 취소했다»는 지금은 memo 글로만(사실 칸은 기사님 «가» 뒤 · reviews/29 5단계).
 */
export interface OpsCallNote {
    stopType: 'pickup' | 'dropoff';
    unit: CargoUnit | null;
    quantity: number | null;
    /** 약속(언제까지 가나) — ISO */
    promisedArrivalAt: string | null;
    memo: string;
    /** 마지막으로 적은 사람 이름(기사 · 관리자) */
    writtenBy: string;
    writtenAt: string;
}

export interface OpsAnomaly {
    id: number;
    at: string;
    memberId: string | null;
    deviceId: string;
    targetApp: TargetAppType;
    screen: string;
    reason: string;
    /** 원달앱이 읽은 화면 글(가린 글 · 앞 200자) — 없으면 null */
    text: string | null;
    /** 📷 그 순간의 폰 사진이 있나 — 사진은 `/api/ops/anomalies/:id/shot` 으로 펼칠 때만 받는다(가리지 않은 원본 · 보관 날수 뒤 지워짐) */
    hasShot: boolean;
}

export interface OpsScreenWord {
    targetApp: TargetAppType;
    page: string;
    word: string;
    /** 저장은 키 · 글은 화면이 shared `WORD_KIND_LABEL` 로 */
    kind: WordKind;
    firstSeenAt: string;
}

/** 글 종류는 가입 규격(`join.ts`)의 것 하나 */
export type OpsContentKind = ContentKind;

export interface OpsContent {
    kind: OpsContentKind;
    title: string;
    body: string;
    version: number;
    updatedAt: string;
}

export interface OpsNotice {
    id: number;
    text: string;
    postedAt: string;
    activeUntil: string | null;
    /** 내린 시각 — 줄을 지우지 않는다(지우기는 기사님 · 기록은 남는다) */
    endedAt: string | null;
}

export interface OpsRelease {
    app: 'scanner' | 'dashboard';
    version: string;
    versionCode: number;
    fileName: string;
    sha256: string;
    uploadedAt: string;
    isLatest: boolean;
    isMinimum: boolean;
}

export interface OpsAudit {
    id: number;
    at: string;
    admin: string;
    action: string;
    targetMemberId: string | null;
    detail: string;
}

export interface OpsMemberCheck {
    memberId: string;
    month: string;
    codeEntered: string | null;
    checkedAt: string | null;
    result: 'OK' | 'MISMATCH' | null;
}

/** 회원 한 명 화면 — 열람 기록은 서버가 이 문에서 남긴다 */
export interface OpsMemberDetail {
    member: OpsMember;
    todayCalls: OpsCall[];
    anomalies: OpsAnomaly[];
    audit: OpsAudit[];
    /** 카카오 길찾기 호출 수 — 5단계 표(kakao_usage_days)가 생기기 전엔 null(«아직 안 셈») */
    kakaoUsage: { today: number; month: number };
    /** 동의 기록 — 글 동의(종류 · 판)와 글 없는 고지(kind 'ack' · item 키 · 0판) · 지우지 않는다 */
    agreements: OpsAgreement[];
}

/** 동의 한 줄 — 서버 agreements 표 그대로 */
export interface OpsAgreement {
    kind: ContentKind | 'ack';
    item: string | null;
    version: number;
    at: string;
}

/** 메뉴 옆 숫자 — 할 일이 있는 것만 */
export interface OpsCounts { pendingMembers: number; callsTodo: number; phonesOffline: number }

export interface OpsAnomaliesReply { anomalies: OpsAnomaly[]; screenWords: OpsScreenWord[] }

/** 쓰기 요청 — 서버는 쓰기마다 ops_audit 한 줄 */
export interface OpsSuspendRequest { afterActive: boolean }
export interface OpsAllowRequest { what: 'auto' | 'stats'; on: boolean; until: string | null }
export interface OpsPaidUntilRequest { until: string | null }
export interface OpsContentSave { title: string; body: string }
export interface OpsNoticePost { text: string; activeUntil: string | null }
export type OpsCallNoteWrite = Omit<OpsCallNote, 'writtenBy' | 'writtenAt'> & {
    /** 📵 true = 상대 취소 · false = 상대 취소 지움 · 없으면 그대로 */
    counterpartCancelled?: boolean;
};
/** 통화 메모 글자 수 상한 — 서버가 넘으면 400 · 운영센터 화면이 같은 상수로 글자 수를 보인다 */
export const CALL_NOTE_MEMO_MAX = 200;
export interface OpsMinimumRelease { app: OpsRelease['app']; versionCode: number }

/** 유예 — 유료 기한이 지난 뒤 확인 번호로 되살릴 수 있는 날 수 (reviews/29 · 첫 값 · 유튜브 결제 실패 재시도 기간 확인 후 조정) */
export const GRACE_DAYS = 14;

export type OpsMemberStatus = {
    /** 🔴 서버가 읽는 사실 — **새 일을 받지 않는다**. 판단은 `accountBlocked` 한 곳(서버 폰 보고 거절 · JoinMeReply · 이 글이 같은 함수를 부른다) */
    blocked: boolean;
    text: string;
    tone: 'ok' | 'warn' | 'bad' | 'muted';
    /** 기한이 지난 날 수 — 기한 안이면 없음 */
    graceDay?: number;
};

type AccountFacts = Pick<OpsMember, 'approvedAt' | 'suspendedAt' | 'suspendAfterActive' | 'withdrawnAt' | 'paidUntil'>;

/**
 * 🔴 **새 일을 받지 않는가 — 판단은 여기 한 곳** (reviews/29 · 서버의 폰 보고 거절 · `JoinMeReply.blocked` · `opsMemberStatus` 가 같이 부른다).
 * 참: 탈퇴 · 즉시 정지 · 승인 전 · «끝난 뒤» 정지와 유료 기한 지남(둘 다 «끝난 뒤 멈춤»과 같은 길 — 진행 중 콜이 있으면 끝날 때까지 아직 막지 않는다. 중간에 끊으면 안전취소가 멈춘다).
 * 🔴 봐주는 것은 그날까지 — «끝난 뒤» 정지는 정지 건 한국 날, 유료 기한은 기한 다음 날까지만 진행 중 콜을 봐준다. 그 뒤는 콜이 있어도 막는다
 *    (기획 29 3단계 · 27 Q5 «결재 안 한 콜이 남아도 영업일이 바뀌면 멈춤» — 콜 하나로 정지가 끝없이 미뤄지지 않게).
 * `hasActiveCall` 은 서버만 아는 사실이라 인자로 받는다. `today` 는 한국 날 YYYY-MM-DD.
 */
export function accountBlocked(m: AccountFacts, today: string, hasActiveCall = false): boolean {
    if (m.withdrawnAt) return true;
    if (!m.approvedAt) return true;
    if (m.suspendedAt) {
        if (!m.suspendAfterActive) return true;
        const suspendedDay = kstDateText(m.suspendedAt);
        if (suspendedDay && suspendedDay < today) return true;
        return !hasActiveCall;
    }
    if (m.paidUntil && m.paidUntil < today) {
        const graceEnd = kstDateText(Date.parse(`${m.paidUntil}T00:00:00+09:00`) + 86_400_000);   // 기한 다음 날
        if (graceEnd && graceEnd < today) return true;
        return !hasActiveCall;
    }
    return false;
}

/**
 * 회원 상태 글 — **사실 시각 칸에서만** 만든다. 상태 이름 칸은 없다. `blocked` 는 `accountBlocked` 가 정한다.
 * 순서: 탈퇴 → 정지 → 승인 전 → 기한 지남(= 자동 정지 · «정지 · 유예 D+n» · GRACE_DAYS 지나면 «정지 · 유예 끝 — 탈퇴 처리 필요», 탈퇴는 관리자 손) → 사용 중.
 */
export function opsMemberStatus(m: AccountFacts, today: string, hasActiveCall = false): OpsMemberStatus {
    const blocked = accountBlocked(m, today, hasActiveCall);
    if (m.withdrawnAt) return { blocked, text: '탈퇴', tone: 'muted' };
    if (m.suspendedAt) return { blocked, text: m.suspendAfterActive ? (blocked ? '정지 (끝난 뒤)' : '정지 (진행 중 콜 끝난 뒤)') : '정지', tone: 'bad' };
    if (!m.approvedAt) return { blocked, text: '승인 대기', tone: 'warn' };
    if (m.paidUntil && m.paidUntil < today) {
        const graceDay = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${m.paidUntil}T00:00:00`)) / 86_400_000);
        return graceDay > GRACE_DAYS
            ? { blocked, text: '정지 · 유예 끝 — 탈퇴 처리 필요', tone: 'bad', graceDay }
            : { blocked, text: `정지 · 유예 D+${graceDay}`, tone: 'bad', graceDay };
    }
    return { blocked, text: '사용 중', tone: 'ok' };
}

// ── 운영센터 현황판(/api/ops/board/*) — 관제웹 현황판과 같은 칸 · 읽기만 ─────────────

/** 서버 상태 — 부팅 · 빌드 · DB 파일 · 붙은 소켓 수 · 마지막 폰 보고 */
export interface OpsBoardServer {
    bootedAt: string;
    commit: string; branch: string; committedAt: string;
    dbFile: string;
    /** web = 기사 관제웹 소켓(기본 이름공간) · ops = 운영센터 소켓(/ops) */
    sockets: { web: number; ops: number };
    /** 기기 세션 lastSeen 가운데 가장 늦은 것(ISO) — 붙은 폰이 없으면 null */
    lastScrapAt: string | null;
    /** 🧯 서버 오류 줄(ERR) 수 · 같은 모양을 접은 가짓수 — 부팅 뒤 · 오늘(한국 날)만 */
    errorsToday: { count: number; kinds: number };
}

/** 폰 한 대 — 기기 세션 칸 그대로(좌표 빼고) + 주인 · 위치 있음 여부(좌표는 지도 문 몫) */
export type OpsBoardPhone = Omit<DeviceSession, 'lat' | 'lng'> & { memberId: string; hasLocation: boolean };

/**
 * 📦 앱에 내려갈 필터 — 서버 `appFilterOf` 가 만든 그대로(자동 반경 · 복귀 목적지 · 내일 콜 칸 · 경로 순서 · 잠금이 얹힌 값).
 *    피기백 v2 가 전선에서 줄이기 전 값이다 — 앱이 합쳐 쓰는 값과 같다. 칸 이름은 `APP_FILTER_KEYS` 와 그 위에 얹는 칸.
 */
export type AppFilter = Record<string, unknown>;

/** 필터 전문 — active 는 오늘 세션이 있을 때만(없으면 null · 세션을 만들지 않는다) · base 는 평소 설정 · app 은 그 회원 폰마다(세션 없으면 null) */
export interface OpsBoardFilter { active: AutoDispatchFilter | null; base: AutoDispatchFilter; app: Array<{ deviceId: string; filter: AppFilter }> | null }


/**
 * 🗺️ 현황판 «카카오 호출 — 오늘 / 이달» — 이달(1일~오늘)에 한 번이라도 센 주인만 줄로 · 합계는 화면이 줄을 더한다.
 *    memberId null = 주인 없음(요청 흐름 밖 · 시뮬레이터). 길찾기 · 좌표 찾기는 카카오 한도가 따로라 나눈다.
 */
export interface OpsBoardKakao {
    /** 한국 오늘 YYYY-MM-DD */
    day: string;
    rows: Array<{ memberId: string | null; route: { today: number; month: number }; local: { today: number; month: number } }>;
}

/** 🗺️ 카카오 호출 합계 — 줄들의 덧셈 한 곳(운영센터 홈 · 현황판 카드가 같이 부른다 · 서버는 따로 합을 저장하지 않는다) */
export function kakaoTotalOf(rows: OpsBoardKakao['rows']): { route: { today: number; month: number }; local: { today: number; month: number } } {
    const sum = (pick: (r: OpsBoardKakao['rows'][number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
    return {
        route: { today: sum(r => r.route.today), month: sum(r => r.route.month) },
        local: { today: sum(r => r.local.today), month: sum(r => r.local.month) },
    };
}

/**
 * 📊 운영센터 통계 (reviews/33 4단계) — «목록에 뜬 실물 콜»(배차망 화면을 읽어 올린 것 · 시뮬 빼고)로만.
 *    기사별 벌이는 없다 — 잡은 콜에 시뮬/실콜을 가를 칸이 없다(화면이 «실제 콜이 생기면 채워집니다»).
 */
export interface OpsStats {
    from: string; to: string;
    /** 배차망별 실물 콜 수 — 화면 머리가 «지금은 카카오 픽커만»처럼 사실로 적는다 */
    sources: Array<{ targetApp: TargetAppType; calls: number }>;
    /** 노선(출발 시군구 → 도착 시군구) — 많은 순 · 평균은 아는 값으로만 */
    routes: Array<{ from: string; to: string; calls: number; fareCalls: number; fareFirstAvg: number | null; fareLastAvg: number | null; kmAvg: number | null; passed: number }>;
    dropped: {
        /** 앱이 떨어뜨린 축마다(글자는 VERDICT_AXIS_LABEL) */
        byAxis: Array<{ axis: string; calls: number }>;
        /** 잠겨서 안 본 것 — 버린 것이 아니다 */
        locked: number;
        /** 판정이 안 실린 것(옛 앱) */
        unjudged: number;
        /** 버린 콜 중 요금 높은 20 */
        topFares: Array<{ at: string; targetApp: string; pickup: string; dropoff: string; fare: number; axis: string }>;
    };
    /** 📊 흐름 칸 — 콜 흐름 표(stats_flows)를 요일 시 × 배차망 × 출발 → 도착으로 기사를 합쳐 묶은 합 · 운영센터 «④ 어디로 · 몇 시에»가 shared flowViews 로 센다 */
    flows: FlowCell[];
    /** 👀 요일 시마다 폰이 콜을 본 날 수 — ③ 의 나누는 수 · 없는 칸은 «못 봄» */
    watched: WatchedHour[];
}

/**
 * 🧑‍✈️ 회원 상세 «폰 · 필터» 칸의 기사 몫 셋 — 관제웹 현황판과 같은 값(GET /api/ops/board/member · 읽기만 · 세션 없으면 위치 · 심사 중 null).
 *    newWords 는 모든 폰 공통(화면 낱말에 «누가» 칸이 없다 — 배차망 화면이 바뀐 신호라 회원별일 까닭이 적다).
 */
/** 📰 처음 본 화면 낱말 한 줄 — 서버 recentNewWords 가 돌려주는 그대로(관제웹 «새 글자» · 운영센터 회원 상세가 같은 함수) */
export interface NewScreenWord { targetApp: string; page: string; word: string; kind: string; firstSeen: string; seenCount: number; sample: string | null }

export interface OpsBoardMember {
    /** 📍 서버가 그 기사의 «지금 자리»로 쥔 기점 — at 은 ISO(운영센터 다른 시각 칸과 같은 모양) · source 는 gps · mock · manual · home */
    location: { lat: number; lng: number; at: string | null; source: string | null; isFallback: boolean; region: string } | null;
    /** ⚖️ 지금 심사 중인 콜(shared judgingCallOf) — 판정은 관제웹 «⚖️ 심사 중»이 그리는 JudgmentSnapshot 그대로 */
    judging: { id: string; pickup: string | null; dropoff: string | null; status: string | null; isPreview: boolean; fare: number | null; judgment: JudgmentSnapshot | null } | null;
    newWords: NewScreenWord[];
}

/** 🗺️ 회원 위치 — 운전석 폰 진짜 GPS 마지막 점 · 시 · 구는 동 명부 · regions 는 rows 의 시 · 구를 센 것(많은 순) */
export interface OpsLocations {
    rows: Array<{ memberId: string; lat: number; lng: number; at: string; region: string }>;
    regions: Array<{ label: string; count: number }>;
}

/**
 * 🏠 **운영센터 홈 한 장** (reviews/33 2단계 · GET /api/ops/home · 모양은 onedal-ea) — 숫자는 그 쪽 문과 같은 함수로 센다(홈 숫자 = 쪽 숫자).
 *    기사마다 오늘 콜 수 · 매출은 없다 — 시뮬 콜과 실콜을 가를 칸이 아직 없다(실콜이 생기면 채운다 · onedal-69 «가» Q1).
 */
export interface OpsHome {
    todo: {
        /** 기사 이상 신호 — 진행 중 콜이 있는 기사 중 배차망 폰이 하나도 안 붙음 · 위치(운전석 GPS · 원달앱 폰 중 늦은 것)가 10분 넘게 안 옴 */
        emergencies: number;
        /** 배차망 «비상»(🔴 단계) 수 — 기사 신호와 섞지 않는다(networks 의 level 'alarm' 수) */
        networkAlarms: number;
        callsTodo: number;
        /** 가장 오래된 전화할 콜의 KEEP 시각(ISO) — 화면이 «몇 분 전»을 셈한다 */
        oldestKeepAt: string | null;
        pendingMembers: number;
        /** 유료 · 허락 기한이 7일 안에 끝나는 회원 + 유예 중 */
        expiringSoon: number;
        phonesOffline: number;
        /** 최소 판보다 낮은 폰 */
        needUpdate: number;
    };
    access: { phonesOnline: number; phonesOffline: number; lastScrapAt: string | null; bootedAt: string; sockets: { web: number; ops: number }; errorsToday: OpsBoardServer['errorsToday'] };
    networks: Array<{ targetApp: TargetAppType; lastGoodAt: string | null; anomaliesToday: number; anomalies7d: number; newWords: number; level: 'ok' | 'warn' | 'alarm' }>;
    working: { reporting: number; driving: number; rows: Array<{ memberId: string; stage: string; nextStop: string | null; etaAt: string | null }> };
    /** 시 · 구 뱃지 — /locations 와 같은 함수 · 오늘 점만(«지금 어디서 일하나») */
    regions: OpsLocations['regions'];
    members: { total: number; active: number; pending: number; suspended: number; grace: number };
    kakao: { route: { today: number; month: number }; local: { today: number; month: number } };
}

/** 원장(intel) 한 줄 — 서버 칸 이름 그대로(device_id) · verdict 는 앱 판정(pass · 떨어뜨린 축 · locked · null) — 화면은 옮겨 적기만 */
export interface IntelRow {
    id: number; type?: string | null; pickup: string; dropoff: string; fare: number | null;
    timestamp: string; device_id: string | null; targetApp: string | null;
    itemSize?: string | null; pickupDistanceKm: number | null; tagsText?: string | null;
    vehicleType: string | null; deliveryDistanceKm: number | null; scheduleText: string | null;
    postTime: string | null; rawText: string | null;
    pickupX?: number | null; pickupY?: number | null; dropoffX?: number | null; dropoffY?: number | null;
    verdict: string | null;
}
/** 최근 N 줄 + 그 범위의 총수(«전부»가 아니라 «최근 N») */
export interface OpsBoardIntel { rows: IntelRow[]; total: number }
