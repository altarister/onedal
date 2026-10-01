/**
 * 📝 **가입 단계 흐름 — 순수 계산** (reviews/29 «페이지는 형식 · 단계 흐름 · 글은 기사님»).
 *    화면(`pages/Join.tsx` · `JoinApps.tsx` · `App.tsx` 의 MemberGate)은 여기서 «지금 단계 · 다음으로 갈 수 있나 · 어디로 보내나»만 묻는다.
 *    단계는 주소 `?step=` 에 싣는다 — 새로고침 · 뒤로 가기에도 같은 화면.
 *    🔴 서버 문(`/api/join`)은 `api/join.ts` 가 부른다 — 여기서는 서버를 모른다. 규격(가입 칸 · 글 종류)은 shared `join.ts` 하나.
 */

import { CONSENT_KINDS, type Agreement, type ContentKind, type ContentReply, type JoinInfo, type JoinMeReply, type TargetAppType } from '@onedal/shared';

export type { ContentKind, JoinInfo };

export const JOIN_STEPS = ['agree', 'info', 'done'] as const;
export type JoinStep = typeof JOIN_STEPS[number];

export const APP_STEPS = ['download', 'install', 'pair'] as const;
export type AppStep = typeof APP_STEPS[number];

export interface AgreementItem {
    key: string;
    label: string;
    required: boolean;
    /** 눌러 읽을 글이 있으면 그 종류 — 서버가 판을 적는 동의는 이것뿐 */
    contentKind?: ContentKind;
}

/** 가입 때 받는 동의 다섯 (reviews/29 «받는 동의») — 글은 비어 있어도 체크 칸은 있다. 서버에 가는 것은 글이 있는 종류의 판뿐 */
export const AGREEMENT_ITEMS: readonly AgreementItem[] = [
    { key: 'terms', label: '서비스 약관', required: true, contentKind: 'terms' },
    { key: 'privacy', label: '개인정보 수집 · 이용', required: true, contentKind: 'privacy' },
    { key: 'location', label: '위치정보 이용약관 · 개인위치정보 수집 · 이용', required: true, contentKind: 'location' },
    { key: 'thirdParty', label: '배차망 화면의 고객 · 가게 정보를 앱이 읽어 서버로 보낸다는 고지', required: true },
    { key: 'networkRisk', label: '배차망 계정 제재 위험 — 최종 책임은 본인', required: true },
];

/** 가입 칸은 연락처 · 배차망 둘 — 차종은 기사 설정에, 지역 · 유튜브는 12월 칸 (shared `JoinInfo`) */
export const EMPTY_INFO: JoinInfo = { phone: '', dispatchNetworks: [] };

export interface JoinState {
    agreed: Record<string, boolean>;
    info: JoinInfo;
}

export function allRequiredAgreed(agreed: Record<string, boolean>): boolean {
    return AGREEMENT_ITEMS.filter(i => i.required).every(i => agreed[i.key] === true);
}

export function infoComplete(info: JoinInfo): boolean {
    return info.phone.trim() !== '' && info.dispatchNetworks.length > 0;
}

export function canProceed(step: JoinStep, state: JoinState): boolean {
    if (step === 'agree') return allRequiredAgreed(state.agreed);
    if (step === 'info') return infoComplete(state.info);
    return true;
}

export function nextOf<T extends string>(steps: readonly T[], step: T): T | null {
    const i = steps.indexOf(step);
    return i >= 0 && i + 1 < steps.length ? steps[i + 1] : null;
}

export function prevOf<T extends string>(steps: readonly T[], step: T): T | null {
    const i = steps.indexOf(step);
    return i > 0 ? steps[i - 1] : null;
}

/** 주소의 `?step=` — 모르는 값 · 없는 값은 첫 단계 (없는 항목을 다른 항목으로 대신 보이지 않는다 · 그래서 «첫 단계»는 명시) */
export function stepFromQuery<T extends string>(steps: readonly T[], raw: string | null): T {
    return (steps as readonly string[]).includes(raw ?? '') ? (raw as T) : steps[0];
}

export function toggleNetwork(networks: TargetAppType[], key: TargetAppType): TargetAppType[] {
    return networks.includes(key) ? networks.filter(n => n !== key) : [...networks, key];
}

/** 서버로 보낼 동의 — 글이 있는 종류만, 그 글의 판으로 (글이 없는 종류는 서버가 요구하지 않는다 · 글이 비어도 흐름이 돈다) */
export function agreementsFor(contents: Partial<Record<ContentKind, ContentReply | null>>): Agreement[] {
    return CONSENT_KINDS.flatMap(kind => {
        const c = contents[kind];
        return c ? [{ kind, version: c.version }] : [];
    });
}

/**
 * 🚪 **로그인 뒤 어디로 보내나** — 쓰는 곳은 `App.tsx` 의 MemberGate 하나.
 *    🔴 문이 안 되면(옛 서버 · 장애 · 회원 줄 없음) `ok` — 기사님 운행을 막지 않는다 (규칙 ⑤-2 모르는 값은 불리하게 가정하지 않는다).
 *    🔴 다시 동의(reconsent)는 여기서 가르지 않는다 — 운전 중인 기사를 동의 페이지로 옮기면 결재를 못 한다. 그건 관제 화면 위 띠 한 줄(`me.reconsent.length` 사실)이다.
 */
export type GateDecision = 'ok' | 'pending' | 'blocked';
export function gateDecision(me: JoinMeReply | null, failed: boolean): GateDecision {
    if (failed || !me) return 'ok';
    if (me.withdrawnAt) return 'blocked';
    if (!me.approvedAt) return 'pending';
    if (me.blocked) return 'blocked';
    return 'ok';
}
