import type { TargetAppType } from './index';

/**
 * 📝 **가입 · 약관 규격 — 타입만** (reviews/29 2단계 · 서버 문 /api/join/* · /api/contents/:kind).
 *    가입 칸은 4장에서 «가» 받은 것만 — 연락처 · 배차망. 차종은 기사 설정(user_settings)에 이미 있고, 지역 · 유튜브 채널은 12월 칸이라 받지 않는다.
 *    상태 이름 칸은 없다 — 사실 시각 칸만 주고, 화면 글은 `opsMemberStatus` 가, 거절은 `accountBlocked` 가 정한다.
 */

/** 글(약관 · 안내)의 종류 — 운영센터 «페이지 글»과 관제웹 가입 화면이 같은 이름을 쓴다 */
export type ContentKind = 'terms' | 'privacy' | 'location' | 'joinGuide' | 'installGuide' | 'withdrawGuide';
export const CONTENT_KINDS: readonly ContentKind[] = ['terms', 'privacy', 'location', 'joinGuide', 'installGuide', 'withdrawGuide'];
/** 다시 동의를 받는 글 — 판이 오르면 회원이 다음 로그인 때 다시 동의한다 */
export const CONSENT_KINDS: readonly ContentKind[] = ['terms', 'privacy', 'location'];

export interface JoinInfo {
    phone: string;
    dispatchNetworks: TargetAppType[];
}

/** 동의한 글과 그 판 */
export interface Agreement {
    kind: ContentKind;
    version: number;
}

export interface JoinRequest {
    info: JoinInfo;
    agreements: Agreement[];
}

/** 내 가입 상태 — 사실 시각 칸 + 서버가 계산한 blocked(`accountBlocked`) */
export interface JoinMeReply {
    approvedAt: string | null;
    suspendedAt: string | null;
    suspendAfterActive: boolean;
    withdrawnAt: string | null;
    paidUntil: string | null;
    blocked: boolean;
    info: JoinInfo | null;
    agreed: Agreement[];
    /** 지금 판보다 낮게 동의한 필수 글 — 비어 있지 않으면 화면이 동의 단계로 보낸다 */
    reconsent: ContentKind[];
}

/** 글 한 편 — 없으면 null (화면이 «글 자리»를 보인다) */
export interface ContentReply {
    kind: ContentKind;
    title: string;
    body: string;
    version: number;
    updatedAt: string;
}
