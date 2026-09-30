/**
 * 📝 **가입 단계 흐름 — 순수 계산** (reviews/29 «페이지는 형식 · 단계 흐름 · 글은 기사님»).
 *    화면(`pages/Join.tsx` · `JoinApps.tsx`)은 여기서 «지금 단계 · 다음으로 갈 수 있나»만 묻는다.
 *    단계는 주소 `?step=` 에 싣는다 — 새로고침 · 뒤로 가기에도 같은 화면.
 *    🔴 서버 문(`/api/join`)은 `api/join.ts` 가 부른다 — 여기서는 서버를 모른다.
 */

import type { TargetAppType } from '@onedal/shared';

export const JOIN_STEPS = ['agree', 'info', 'done'] as const;
export type JoinStep = typeof JOIN_STEPS[number];

export const APP_STEPS = ['download', 'install', 'pair'] as const;
export type AppStep = typeof APP_STEPS[number];

/** 약관 글의 종류 — `/terms` · `/privacy` · `/location-terms` 와 짝. 글은 운영센터 «페이지 글»에서 온다 */
export type ContentKind = 'terms' | 'privacy' | 'location' | 'joinGuide' | 'installGuide' | 'withdrawGuide';

export interface AgreementItem {
    key: string;
    label: string;
    required: boolean;
    /** 눌러 읽을 글이 있으면 그 종류 */
    contentKind?: ContentKind;
}

/** 가입 때 받는 동의 다섯 (reviews/29 «받는 동의») — 글은 비어 있어도 체크 칸은 있다 */
export const AGREEMENT_ITEMS: readonly AgreementItem[] = [
    { key: 'terms', label: '서비스 약관', required: true, contentKind: 'terms' },
    { key: 'privacy', label: '개인정보 수집 · 이용', required: true, contentKind: 'privacy' },
    { key: 'location', label: '위치정보 이용약관 · 개인위치정보 수집 · 이용', required: true, contentKind: 'location' },
    { key: 'thirdParty', label: '배차망 화면의 고객 · 가게 정보를 앱이 읽어 서버로 보낸다는 고지', required: true },
    { key: 'networkRisk', label: '배차망 계정 제재 위험 — 최종 책임은 본인', required: true },
];

/** 차종 · 배차망 목록은 shared 의 것(`VEHICLE_PICKS` · `TARGET_APPS` + `TARGET_APP_LABEL`)을 쓴다 — 판정 · 필터의 차종과 갈라지지 않게. 저장은 키, 보이는 글은 이름표 */
export interface JoinInfo {
    vehicle: string;
    phone: string;
    networks: TargetAppType[];
    region: string;
    youtubeChannel: string;
}

export const EMPTY_INFO: JoinInfo = { vehicle: '', phone: '', networks: [], region: '', youtubeChannel: '' };

export interface JoinState {
    agreed: Record<string, boolean>;
    info: JoinInfo;
}

export function allRequiredAgreed(agreed: Record<string, boolean>): boolean {
    return AGREEMENT_ITEMS.filter(i => i.required).every(i => agreed[i.key] === true);
}

/** 유튜브 채널명은 12월 뒤(멤버 대조)에 쓰는 칸이라 비어도 된다 */
export function infoComplete(info: JoinInfo): boolean {
    return info.vehicle.trim() !== '' && info.phone.trim() !== '' && info.networks.length > 0 && info.region.trim() !== '';
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
