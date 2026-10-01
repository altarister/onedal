import axios from 'axios';
import type { Agreement, ContentKind, ContentReply, DownloadLink, JoinMeReply, JoinRequest } from '@onedal/shared';
import { apiClient } from './apiClient';
import { socketBase } from '../lib/serverTarget';

/**
 * 📝 **가입 · 탈퇴 · 페이지 글 — 서버 문을 부르는 곳은 이 파일 하나** (reviews/29 2단계 · 서버 `routes/join.ts` · `routes/contents.ts`).
 *    화면(`pages/Join*` · `Pending` · `Blocked` · `Withdraw` · `Terms` · `App.tsx` MemberGate)은 **이 파일만** 부른다.
 *    🔴 동의 판이 그 사이 최신 판과 달라지면 서버가 409 — `JoinStaleError` 로 던진다. 화면은 글을 다시 읽어 동의 단계를 다시 그린다.
 */

export class JoinStaleError extends Error {
    kind: ContentKind | null;
    constructor(kind: ContentKind | null) { super('글이 바뀌었습니다 — 다시 읽고 동의해 주세요'); this.kind = kind; }
}

function stale(e: unknown): JoinStaleError | null {
    if (axios.isAxiosError(e) && e.response?.status === 409) return new JoinStaleError((e.response.data as { kind?: ContentKind })?.kind ?? null);
    return null;
}

/** 운영센터 «페이지 글»에서 적은 글 — 없으면 null(화면이 «글 자리»를 보인다). 로그인 없이 읽는다 */
export async function fetchContents(kind: ContentKind): Promise<ContentReply | null> {
    const r = await apiClient.get<ContentReply | null>(`/contents/${kind}`);
    return r.data ?? null;
}

/** 내 가입 상태 — 🔴 못 읽으면 failed 로 돌려주고 던지지 않는다(문지기가 «통과»로 다룬다). 로그인 안 됨 · 회원 줄 없음은 missing */
export async function fetchMeSafe(): Promise<{ me: JoinMeReply | null; failed: boolean; missing: boolean }> {
    try {
        const r = await apiClient.get<JoinMeReply>('/join/me');
        return { me: r.data, failed: false, missing: false };
    } catch (e) {
        const status = axios.isAxiosError(e) ? e.response?.status : undefined;
        if (status === 401 || status === 404) return { me: null, failed: false, missing: true };
        return { me: null, failed: true, missing: false };
    }
}

export async function submitJoin(req: JoinRequest): Promise<JoinMeReply> {
    try { return (await apiClient.post<JoinMeReply>('/join', req)).data; }
    catch (e) { throw stale(e) ?? e; }
}

export async function agree(agreements: Agreement[]): Promise<JoinMeReply> {
    try { return (await apiClient.post<JoinMeReply>('/join/agree', { agreements })).data; }
    catch (e) { throw stale(e) ?? e; }
}

export async function submitWithdraw(): Promise<{ ok: true }> {
    return (await apiClient.post<{ ok: true }>('/join/withdraw')).data;
}

/**
 * 📥 앱 받기 링크 — 앱별 최신 판 + 10분 열쇠 주소(폰 브라우저가 그 주소를 연다 — 머리 칸을 못 실어 서버가 열쇠를 준다).
 * 🔴 던지지 않는다: 403(승인 전 · 막힘)은 blocked · 로그인 안 됨(401)은 missing · 그 밖은 failed. 표가 비면 links 가 [].
 */
export async function fetchDownloadLinks(): Promise<{ links: DownloadLink[]; blocked: boolean; missing: boolean; failed: boolean }> {
    try {
        const r = await apiClient.post<DownloadLink[]>('/downloads/links');
        // 서버가 주는 주소는 `/api/downloads/<열쇠>` — 브라우저는 같은 출처라 그대로, 관제앱(다른 출처)은 서버 주소를 앞에 붙인다
        const origin = socketBase() ?? '';
        return { links: (r.data ?? []).map(l => ({ ...l, url: origin + l.url })), blocked: false, missing: false, failed: false };
    } catch (e) {
        const status = axios.isAxiosError(e) ? e.response?.status : undefined;
        if (status === 403) return { links: [], blocked: true, missing: false, failed: false };
        if (status === 401) return { links: [], blocked: false, missing: true, failed: false };
        return { links: [], blocked: false, missing: false, failed: true };
    }
}
