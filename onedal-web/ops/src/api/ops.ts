import type { OpsAudit, OpsCall, OpsCallNote, OpsContent, OpsContentKind, OpsMember, OpsNotice, OpsRelease } from '@onedal/shared';
import { ANOMALIES, AUDIT, CALLS, CHECKS, CONTENTS, KAKAO_USAGE, MEMBERS, MONTH_CODE, NOTICES, PHONES, RELEASES, SCREEN_WORDS, STATS_ROWS } from '../mock/data';

/**
 * 🏢 **운영센터가 서버를 부르는 곳 — 이 파일 하나** (reviews/29 3단계 · 서버 문 `/api/ops/*` 는 ab 가 만든다).
 *    🔴 지금은 목업이다: 메모리의 예시 자료를 읽고 쓴다. 서버가 생기면 이 함수들만 바꾼다 — 화면은 안 바뀐다.
 *    쓰기는 전부 `audit` 에 한 줄 남긴다 (열람 기록의 짝 · ops/CLAUDE.md).
 */

const ADMIN_NAME = '와이프 (관리자)';
const now = () => new Date().toISOString();
let auditSeq = AUDIT.length + 1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

/** 화면이 «자료가 바뀌었다»를 듣는 자리 — 목업이라 메모리 변화를 그대로 알린다 */
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

function log(action: string, targetMemberId: string | null, detail: string) {
    AUDIT.unshift({ id: auditSeq++, at: now(), admin: ADMIN_NAME, action, targetMemberId, detail });
}

export const api = {
    members: (): OpsMember[] => MEMBERS,
    member: (id: string): OpsMember | undefined => MEMBERS.find(m => m.id === id),
    phones: () => PHONES,
    calls: (): OpsCall[] => CALLS,
    anomalies: () => ANOMALIES,
    screenWords: () => SCREEN_WORDS,
    contents: (): OpsContent[] => CONTENTS,
    notices: (): OpsNotice[] => NOTICES,
    releases: (): OpsRelease[] => RELEASES,
    audit: (): OpsAudit[] => AUDIT,
    checks: () => CHECKS,
    monthCode: () => MONTH_CODE,
    kakaoUsage: (memberId: string) => KAKAO_USAGE[memberId] ?? { today: 0, month: 0 },
    stats: () => STATS_ROWS,

    /** 열람도 기록에 남긴다 */
    viewed(what: string, targetMemberId: string | null, detail: string) { log(what, targetMemberId, detail); notify(); },

    approve(id: string) {
        const m = this.member(id); if (!m) return;
        m.approvedAt = now();
        const until = new Date(); until.setMonth(until.getMonth() + 1); m.paidUntil = until.toISOString().slice(0, 10);
        log('승인', id, '유료 기한 +1달'); notify();
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
    setAllow(id: string, field: 'autoUntil' | 'statsUntil' | 'paidUntil', until: string | null) {
        const m = this.member(id); if (!m) return;
        m[field] = until;
        log('허락 · 기한', id, `${field} → ${until ?? '없음'}`); notify();
    },
    writeCallNote(callId: string, note: Omit<OpsCallNote, 'writtenBy' | 'writtenAt'>) {
        const c = CALLS.find(x => x.id === callId); if (!c) return;
        c.callNote = { ...note, writtenBy: ADMIN_NAME, writtenAt: now() };
        c.needsCall = false;
        log('통화 결과 적음', c.memberId, `${callId} · ${note.cargoSize}${note.counterpartCancelled ? ' · 상대 취소' : ''}`); notify();
    },
    saveContent(kind: OpsContentKind, title: string, body: string) {
        const c = CONTENTS.find(x => x.kind === kind); if (!c) return;
        c.title = title; c.body = body; c.version += 1; c.updatedAt = now();
        log('페이지 글 적음', null, `${title} v${c.version}`); notify();
    },
    postNotice(text: string, activeUntil: string | null) {
        NOTICES.unshift({ id: (NOTICES[0]?.id ?? 0) + 1, text, postedAt: now(), activeUntil });
        log('공지 올림', null, text.slice(0, 30)); notify();
    },
    removeNotice(id: number) {
        const i = NOTICES.findIndex(n => n.id === id); if (i >= 0) NOTICES.splice(i, 1);
        log('공지 내림', null, `#${id}`); notify();
    },
    uploadRelease(app: OpsRelease['app'], version: string, versionCode: number, fileName: string) {
        RELEASES.forEach(r => { if (r.app === app) r.isLatest = false; });
        RELEASES.unshift({ app, version, versionCode, fileName, sha256: '(계산 자리)', uploadedAt: now(), isLatest: true, isMinimum: false });
        log('APK 올림', null, `${app} ${version} (최신)`); notify();
    },
    setMinimum(app: OpsRelease['app'], versionCode: number) {
        RELEASES.forEach(r => { if (r.app === app) r.isMinimum = r.versionCode === versionCode; });
        log('최소 판 지정', null, `${app} versionCode ${versionCode}`); notify();
    },
    checkMember(memberId: string, ok: boolean) {
        const c = CHECKS.find(x => x.memberId === memberId); if (!c) return;
        c.checkedAt = now(); c.result = ok ? 'OK' : 'MISMATCH';
        if (ok) { const m = this.member(memberId); if (m) { const u = new Date(); u.setMonth(u.getMonth() + 1); m.paidUntil = u.toISOString().slice(0, 10); } }
        log('멤버 대조', memberId, ok ? '일치 · 기한 +1달' : '불일치'); notify();
    },
};
