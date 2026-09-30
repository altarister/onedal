/**
 * 🏢 **운영센터 API 규격 — 타입만** (reviews/29 · 운영센터 `ops/` 와 서버 문 `/api/ops/*` 가 같은 모양을 읽는다).
 *    값 계산은 없다. 회원 상태는 이름 한 칸이 아니라 **사실 시각 칸**이다 — «승인 대기 · 사용 중 · 정지»는 화면이 시각을 보고 글로만 만든다.
 */

export interface OpsMember {
    id: string;
    name: string;
    email: string;
    phone: string;
    vehicle: string;
    networks: string[];
    region: string;
    youtubeChannel: string | null;
    role: 'ADMIN' | 'USER';
    createdAt: string;
    approvedAt: string | null;
    suspendedAt: string | null;
    suspendAfterActive: boolean;
    withdrawnAt: string | null;
    paidUntil: string | null;
    autoUntil: string | null;
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
    targetApp: string;
    status: string;
    verdict: '꿀' | '보통' | '똥' | '사고';
    needsCall: boolean;
    pickup: { place: string; phone: string | null; address: string; at: string | null };
    dropoff: { place: string; phone: string | null; address: string; at: string | null };
    fare: number;
    capturedAt: string;
    callNote: OpsCallNote | null;
}

/** 통화 도우미가 적는 결과 — 기사가 쓰는 «통화함» 규격과 같은 칸 + 누가 적었나 */
export interface OpsCallNote {
    cargoSize: string;
    pickupReadyAt: string | null;
    counterpartCancelled: boolean;
    memo: string;
    writtenBy: string;
    writtenAt: string;
}

export interface OpsAnomaly {
    id: number;
    at: string;
    memberId: string | null;
    deviceId: string;
    targetApp: string;
    screen: string;
    reason: string;
}

export interface OpsScreenWord {
    targetApp: string;
    page: string;
    word: string;
    kind: '잡음' | '정의 밖' | '남은 토막';
    firstSeenAt: string;
}

export type OpsContentKind = 'terms' | 'privacy' | 'location' | 'joinGuide' | 'installGuide' | 'withdrawGuide';

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
