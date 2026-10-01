import { useEffect, useState } from 'react';
import { CONTENT_KINDS } from '@onedal/shared';
import type { OpsAudit, OpsCall, OpsCallNote, OpsContent, OpsContentKind, OpsMember, OpsNotice, OpsRelease } from '@onedal/shared';
import { session } from './client';
import { ANOMALIES, AUDIT, BOARD_DROPPED, BOARD_FILTER_FULL, BOARD_PHONE_DETAIL, BOARD_SERVER, CALLS, CHECKS, CONTENTS, KAKAO_USAGE, MEMBERS, MONTH_CODE, NOTICES, PHONES, RELEASES, SCREEN_WORDS, STATS_ROWS } from '../mock/data';

/**
 * 🏢 **운영센터가 서버를 부르는 곳 — 이 파일 하나** (reviews/29 3단계 · 서버 문 `/api/ops/*` 는 ab 가 만든다).
 *    🔴 지금은 목업이다: 메모리의 예시 자료를 읽고 쓴다. 서버가 생기면 이 함수들만 바꾼다 — 화면은 안 바뀐다.
 *    쓰기는 전부 `audit` 에 한 줄 남긴다 (열람 기록의 짝 · ops/CLAUDE.md).
 *    날짜 칸(`paidUntil` · `autoUntil` …)은 한국 날 `YYYY-MM-DD` 다 — UTC 로 세지 않는다.
 */

/** 지금 보는 관리자 — 로그인한 사람의 이름(`client.ts` 의 `session` · 문지기가 `/auth/me` 로 채운다) */
export function currentAdminName(): string { return session.name || '관리자'; }

const now = () => new Date().toISOString();
const localDay = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const todayDay = () => localDay(new Date());
/** 기한 +1달 — 남은 날이 있으면 그 위에 얹는다(오늘부터 다시 재지 않는다) */
const plusOneMonthFrom = (base: string | null) => {
    const t = base && base > todayDay() ? new Date(`${base}T12:00:00`) : new Date();
    t.setMonth(t.getMonth() + 1);
    return localDay(t);
};

let auditSeq = AUDIT.length + 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

/** 화면이 «자료가 바뀌었다»를 듣는 자리 — 목업이라 메모리 변화를 그대로 알린다 */
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

/** 자료가 바뀌면 다시 그린다 — 서버가 생기면 {data · loading · error} 훅으로 바뀐다(쪽은 그때 훅만 바꾼다) */
export function useTick() {
    const [, setN] = useState(0);
    useEffect(() => subscribe(() => setN(n => n + 1)), []);
}

function log(action: string, targetMemberId: string | null, detail: string) {
    AUDIT.unshift({ id: auditSeq++, at: now(), admin: currentAdminName(), action, targetMemberId, detail });
}

/** 열람 기록 — 같은 열람이 3초 안에 두 번 오면(StrictMode · 다시 그리기) 한 줄만 */
const recentViews = new Map<string, number>();
function logViewOnce(what: string, targetMemberId: string | null, detail: string) {
    const key = `${what}|${targetMemberId}|${detail}`;
    const t = Date.now();
    if ((recentViews.get(key) ?? 0) > t - 3000) return;
    recentViews.set(key, t);
    log(what, targetMemberId, detail);
}

export const api = {
    members: (): OpsMember[] => MEMBERS,
    member: (id: string): OpsMember | undefined => MEMBERS.find(m => m.id === id),
    phones: () => PHONES,
    calls: (): OpsCall[] => CALLS,
    anomalies: () => ANOMALIES,
    screenWords: () => SCREEN_WORDS,
    /** 글 순서는 규격의 순서 — 화면이 늘 같은 차례로 보인다 */
    contents: (): OpsContent[] => [...CONTENTS].sort((a, b) => CONTENT_KINDS.indexOf(a.kind) - CONTENT_KINDS.indexOf(b.kind)),
    notices: (): OpsNotice[] => NOTICES,
    releases: (): OpsRelease[] => RELEASES,
    audit: (): OpsAudit[] => AUDIT,
    checks: () => CHECKS,
    monthCode: () => MONTH_CODE,
    /** 5단계 표(kakao_usage_days)가 생기기 전엔 null — 화면은 «아직 안 셈» */
    kakaoUsage: (memberId: string): { today: number; month: number } | null => KAKAO_USAGE[memberId] ?? null,
    stats: () => STATS_ROWS,
    boardServer: () => BOARD_SERVER,
    boardPhoneDetail: (deviceId: string) => BOARD_PHONE_DETAIL[deviceId],
    boardFilterFull: (memberId: string) => BOARD_FILTER_FULL[memberId],
    boardDropped: () => BOARD_DROPPED,
    /** 메뉴 옆 숫자 — 할 일이 있는 것만 */
    counts: () => ({
        pendingMembers: MEMBERS.filter(m => m.role !== 'ADMIN' && !m.approvedAt && !m.withdrawnAt).length,
        callsTodo: CALLS.filter(c => c.needsCall).length,
        phonesOffline: PHONES.filter(p => p.status === 'OFFLINE').length,
    }),

    /** 열람도 기록에 남긴다 — 누구 것을 봤는지까지 */
    viewed(what: string, targetMemberId: string | null, detail: string) { logViewOnce(what, targetMemberId, detail); notify(); },

    /** 승인 — 승인 시각만 적는다. 유료 기한은 안 건드린다(가족판은 비움 = 기한 없음 · 멤버 대조가 따로 늘린다) */
    approve(id: string) {
        const m = this.member(id); if (!m) return;
        m.approvedAt = now();
        log('승인', id, ''); notify();
    },
    suspend(id: string, immediate: boolean) {
        const m = this.member(id); if (!m) return;
        m.suspendedAt = now(); m.suspendAfterActive = !immediate;
        log(immediate ? '즉시 정지' : '정지 (진행 중 콜 끝난 뒤)', id, immediate ? '안전취소 멈춤 경고 확인' : ''); notify();
    },
    resume(id: string) {
        const m = this.member(id); if (!m) return;
        m.suspendedAt = null; m.suspendAfterActive = false;
        log('정지 풀기', id, ''); notify();
    },
    withdraw(id: string) {
        const m = this.member(id); if (!m) return;
        m.withdrawnAt = now();
        log('탈퇴 처리', id, '폰 보고 거절 · 파기 예정'); notify();
    },
    /** 허락 켜기 · 끄기 — 켜면 «허락 시각»이 생기고 기한은 비움(없음). 기한은 따로 둔다 */
    setAllow(id: string, what: 'auto' | 'stats', on: boolean, until: string | null = null) {
        const m = this.member(id); if (!m) return;
        if (what === 'auto') { m.autoAllowedAt = on ? now() : null; m.autoUntil = on ? until : null; }
        else { m.statsAllowedAt = on ? now() : null; m.statsUntil = on ? until : null; }
        log(`${what === 'auto' ? '자동 잡기' : '통계'} ${on ? '허락' : '끔'}`, id, on ? (until ? `${until} 까지` : '기한 없음') : ''); notify();
    },
    setPaidUntil(id: string, until: string | null) {
        const m = this.member(id); if (!m) return;
        m.paidUntil = until;
        log('유료 기한', id, until ?? '없음'); notify();
    },
    writeCallNote(callId: string, note: Omit<OpsCallNote, 'writtenBy' | 'writtenAt'>) {
        const c = CALLS.find(x => x.id === callId); if (!c) return;
        c.callNote = { ...note, writtenBy: currentAdminName(), writtenAt: now() };
        c.needsCall = false;
        log('통화 결과 적음', c.memberId, `${callId} · ${note.cargoSize}${note.counterpartCancelled ? ' · 상대 취소' : ''}`); notify();
    },
    saveContent(kind: OpsContentKind, title: string, body: string) {
        const c = CONTENTS.find(x => x.kind === kind); if (!c) return;
        c.title = title; c.body = body; c.version += 1; c.updatedAt = now();
        log('페이지 글 적음', null, `${title} v${c.version}`); notify();
    },
    postNotice(text: string, activeUntil: string | null) {
        NOTICES.unshift({ id: Math.max(0, ...NOTICES.map(n => n.id)) + 1, text, postedAt: now(), activeUntil, endedAt: null });
        log('공지 올림', null, text.slice(0, 30)); notify();
    },
    /** 내림 — 줄을 지우지 않고 내린 시각을 적는다(지우기는 기사님 · 기록은 남는다) */
    endNotice(id: number) {
        const n = NOTICES.find(x => x.id === id); if (!n || n.endedAt) return;
        n.endedAt = now();
        log('공지 내림', null, `#${id}`); notify();
    },
    /** 올리기 — «최신»은 versionCode 가 가장 큰 판이다. 낮은 판을 올리면 최신이 되지 않는다(최소 판이 최신보다 높아지지 않게) */
    uploadRelease(app: OpsRelease['app'], version: string, versionCode: number, fileName: string) {
        const maxCode = Math.max(0, ...RELEASES.filter(r => r.app === app).map(r => r.versionCode));
        const isLatest = versionCode > maxCode;
        if (isLatest) RELEASES.forEach(r => { if (r.app === app) r.isLatest = false; });
        RELEASES.unshift({ app, version, versionCode, fileName, sha256: '(계산 자리)', uploadedAt: now(), isLatest, isMinimum: false });
        log('APK 올림', null, `${app} ${version} (code ${versionCode}${isLatest ? ' · 최신' : ' · 옛 판'})`); notify();
    },
    /** 최소 판 — 최신보다 높게는 못 둔다 */
    setMinimum(app: OpsRelease['app'], versionCode: number) {
        const latest = RELEASES.find(r => r.app === app && r.isLatest);
        if (latest && versionCode > latest.versionCode) return;
        RELEASES.forEach(r => { if (r.app === app) r.isMinimum = r.versionCode === versionCode; });
        log('최소 판 지정', null, `${app} versionCode ${versionCode}`); notify();
    },
    checkMember(memberId: string, ok: boolean) {
        const c = CHECKS.find(x => x.memberId === memberId); if (!c) return;
        c.checkedAt = now(); c.result = ok ? 'OK' : 'MISMATCH';
        if (ok) { const m = this.member(memberId); if (m) m.paidUntil = plusOneMonthFrom(m.paidUntil); }
        log('멤버 대조', memberId, ok ? '일치 · 기한 +1달' : '불일치'); notify();
    },
};
