import type { Color } from './judge';
import type { TargetAppType } from './index';

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
    region: string;
    youtubeChannel: string | null;
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
    targetApp: TargetAppType;
    screen: string;
    reason: string;
}

export interface OpsScreenWord {
    targetApp: TargetAppType;
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

/** 유예 — 유료 기한이 지난 뒤 확인 번호로 되살릴 수 있는 날 수 (reviews/29 · 첫 값 · 유튜브 결제 실패 재시도 기간 확인 후 조정) */
export const GRACE_DAYS = 14;

export type OpsMemberStatus = {
    /** 🔴 서버가 읽는 사실 — **새 일을 받지 않는다** (탈퇴 · 정지 · 승인 전 · 기한 지남 = 참). 글(text)로 가르지 않는다.
     *  진행 중 콜을 끝까지 두는 것(«끝난 뒤» · 기한 지남 — 중간에 끊으면 안전취소가 멈춘다)은 서버가 «진행 중 콜 있음» 사실로 따로 가른다 */
    blocked: boolean;
    text: string;
    tone: 'ok' | 'warn' | 'bad' | 'muted';
    /** 기한이 지난 날 수 — 기한 안이면 없음 */
    graceDay?: number;
};

/**
 * 회원 상태 — **사실 시각 칸에서만** 만든다 (`approvedAt` · `suspendedAt` · `withdrawnAt` · `paidUntil`). 상태 이름 칸은 없다.
 * 서버(폰 보고 거절 · 자동 정지)와 운영센터 화면이 같은 규칙을 읽는다 — 서버는 `blocked` 만 본다.
 * 순서: 탈퇴 → 정지 → 승인 전 → 기한 지남(= 자동 정지 · «정지 · 유예 D+n» · GRACE_DAYS 지나면 «정지 · 유예 끝 — 탈퇴 처리 필요», 탈퇴는 관리자 손) → 사용 중 (reviews/29).
 * `today` 는 한국 날 `YYYY-MM-DD` — UTC 로 자르지 않는다.
 */
export function opsMemberStatus(m: Pick<OpsMember, 'approvedAt' | 'suspendedAt' | 'suspendAfterActive' | 'withdrawnAt' | 'paidUntil'>, today: string): OpsMemberStatus {
    if (m.withdrawnAt) return { blocked: true, text: '탈퇴', tone: 'muted' };
    if (m.suspendedAt) return { blocked: true, text: m.suspendAfterActive ? '정지 (끝난 뒤)' : '정지', tone: 'bad' };
    if (!m.approvedAt) return { blocked: true, text: '승인 대기', tone: 'warn' };
    if (m.paidUntil && m.paidUntil < today) {
        const graceDay = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${m.paidUntil}T00:00:00`)) / 86_400_000);
        return graceDay > GRACE_DAYS
            ? { blocked: true, text: '정지 · 유예 끝 — 탈퇴 처리 필요', tone: 'bad', graceDay }
            : { blocked: true, text: `정지 · 유예 D+${graceDay}`, tone: 'bad', graceDay };
    }
    return { blocked: false, text: '사용 중', tone: 'ok' };
}
