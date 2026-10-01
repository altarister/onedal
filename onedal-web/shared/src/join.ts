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

/**
 * 📣 **글이 없는 필수 고지** — 체크 칸만 있고 판이 없다. 그래도 «동의했다» 기록은 남아야 한다(제재 위험 고지는 다툼 때 가장 먼저 찾는 기록).
 *    서버는 agreements 에 kind 'ack' · 0판 · item = 이 키로 적는다. 첫 가입(POST /api/join) 때만 받고, /agree 는 받지 않는다.
 *    고지 줄이 없는 기존 회원은 막지도 다시 동의로 보내지도 않는다(판이 없어 «다시»가 없다).
 */
export const ACK_KEYS = ['thirdParty', 'networkRisk'] as const;
export type AckKey = typeof ACK_KEYS[number];

export interface JoinInfo {
    phone: string;
    dispatchNetworks: TargetAppType[];
}

/** 동의한 글과 그 판 */
export interface Agreement {
    kind: ContentKind;
    version: number;
}

/** POST /api/join · /api/join/agree 의 몸 — 🔴 동의 판이 지금 최신 판과 다르면 서버가 409 (그 사이 글이 고쳐짐). 화면은 409 면 글을 다시 읽어 동의 단계를 다시 그린다 */
export interface JoinRequest {
    info: JoinInfo;
    agreements: Agreement[];
    /** 🔴 글 없는 고지 — ACK_KEYS 가 다 있어야 서버가 받는다(하나라도 빠지면 400) */
    acknowledged: AckKey[];
}

/** 내 가입 상태 — 사실 시각 칸 + 서버가 계산한 blocked(`accountBlocked`) */
export interface JoinMeReply {
    approvedAt: string | null;
    suspendedAt: string | null;
    suspendAfterActive: boolean;
    withdrawnAt: string | null;
    /** 6단계 칸 — 그 전엔 서버가 null */
    paidUntil: string | null;
    blocked: boolean;
    info: JoinInfo | null;
    agreed: Agreement[];
    /** 다시 동의할 글 — CONSENT_KINDS 가운데 **글(contents)에 그 종류의 판이 있고**, 동의가 없거나 동의 판 < 최신 판인 것.
     *  글이 없는 종류는 요구하지 않는다(글이 비어도 흐름이 돈다). 비어 있지 않으면 화면이 동의 단계로 보낸다 */
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
