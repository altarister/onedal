import { useCallback, useEffect, useState } from 'react';
import type {
    OpsAnomaliesReply, OpsAudit, OpsCall, OpsCallNoteWrite, OpsContent, OpsContentKind, OpsContentSave, OpsCounts, OpsMember, OpsMemberDetail, OpsNotice, OpsNoticePost, OpsPhone, OpsSuspendRequest,
} from '@onedal/shared';
import { client, errorTextOf, statusOf } from './client';
import { createListeners } from './listeners';

/**
 * 🏢 **운영센터가 서버 문 `/api/ops/*` 를 부르는 곳 — 이 파일 하나** (reviews/29 3단계 · 서버 `routes/ops.ts` · 규격 shared `ops.ts`).
 *    쓰기마다 서버가 `ops_audit` 한 줄을 남긴다 — 화면은 기록을 따로 적지 않는다. 회원 상세 열람도 서버가 적는다(«회원 봄»).
 *    🔴 서버가 안 되면 쪽이 «서버 응답이 없습니다 — 다시»를 보인다 — 예시 자료로 대신 그리지 않는다(장애를 가리면 노이즈).
 *    통계는 서버의 관리자 통계 문(`/api/stats/flows/admin`)을 읽는다. 아직 서버 문이 없는 쪽(앱 배포 · 멤버 대조 · 현황판)은 `example.ts` 의 예시 자료를 쓰고 쪽 머리에 그렇다고 적는다.
 */
const get = async <T,>(path: string) => (await client.get<T>(`/ops${path}`)).data;
const post = async <T,>(path: string, body?: unknown) => (await client.post<T>(`/ops${path}`, body)).data;

export const api = {
    members: () => get<OpsMember[]>('/members'),
    member: (id: string) => get<OpsMemberDetail>(`/members/${id}`),
    phones: () => get<OpsPhone[]>('/phones'),
    anomalies: () => get<OpsAnomaliesReply>('/anomalies'),
    contents: () => get<OpsContent[]>('/contents'),
    notices: () => get<OpsNotice[]>('/notices'),
    /** since 가 있으면 그 날(한국 날)부터 전부 · 없으면 최근 200줄 */
    audit: (since?: string) => get<OpsAudit[]>(since ? `/audit?since=${since}` : '/audit'),
    counts: () => get<OpsCounts>('/counts'),

    /** 승인 — 승인 시각만 적는다. 유료 기한은 안 건드린다(가족판은 비움 = 기한 없음) */
    approve: (id: string) => post<OpsMember>(`/members/${id}/approve`),
    /** 정지 — «끝난 뒤»(진행 중 콜이 끝나면 멈춤) 또는 즉시(관제웹 연결도 끊긴다 · 안전취소가 멈춘다) */
    suspend: (id: string, afterActive: boolean) => post<OpsMember>(`/members/${id}/suspend`, { afterActive } satisfies OpsSuspendRequest),
    resume: (id: string) => post<OpsMember>(`/members/${id}/resume`),
    withdraw: (id: string) => post<OpsMember>(`/members/${id}/withdraw`),
    /** 글 저장은 새 판 한 줄 — 옛 판을 덮어쓰지 않는다(동의가 판을 가리킨다) */
    saveContent: async (kind: OpsContentKind, title: string, body: string) => (await client.put<OpsContent>(`/ops/contents/${kind}`, { title, body } satisfies OpsContentSave)).data,
    postNotice: (text: string, activeUntil: string | null) => post<OpsNotice>('/notices', { text, activeUntil } satisfies OpsNoticePost),
    /** 내림 — 줄을 지우지 않고 내린 시각을 적는다 */
    endNotice: (id: number) => post<OpsNotice>(`/notices/${id}/end`),

    /** 📞 진행 중 KEEP 콜 — 서버가 «통화 필요»(🟡 이고 상차 통화 전)를 위에 놓는다 */
    calls: (memberId?: string) => get<OpsCall[]>(memberId ? `/calls?memberId=${encodeURIComponent(memberId)}` : '/calls'),
    /** 통화 결과 적기 — 서버가 그 콜의 통화 단계 행에 적는다(기사 소켓과 같은 길 · 400 칸 이상 · 404 진행 중 아님 · 409 기사님 현장 실측 있음) */
    writeCallNote: (id: string, note: OpsCallNoteWrite) => post<OpsCall>(`/calls/${id}/note`, note),

    /** 📊 콜 흐름 통계(관리자 문 `/api/stats/flows/admin` · 회원 칸 포함) — 기본 최근 28일. 평균은 요금을 아는 콜로만(없으면 null) */
    statsAdmin: async (groupBy: StatsGroupBy) => (await client.get<StatsAdminReply>('/stats/flows/admin', { params: { groupBy } })).data,
};

export type StatsGroupBy = 'weekday' | 'hour' | 'month';
export interface StatsAdminCell { group: string; targetApp: string; from: string; to: string; userId: string; drivers: number; calls?: number; fareCalls?: number; fareFirstAvg?: number | null; fareLastAvg?: number | null }
export interface StatsAdminReply { from: string; to: string; groupBy: string; cells: StatsAdminCell[] }

export interface Loaded<T> { data: T | null; error: string | null; reload: () => void }

/**
 * 서버에서 읽는 훅 — 쪽은 `const { data, error, reload } = useOps(() => api.members(), [])`.
 * 쓰기 뒤에는 `reload()`. `error` 가 있으면 쪽이 `ErrorBand` 를 그린다. 401 · 403 은 `client.ts` 가 로그인 · «허락 없음»으로 보낸다.
 */
export function useOps<T>(load: () => Promise<T>, deps: unknown[]): Loaded<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [n, setN] = useState(0);
    const reload = useCallback(() => setN(x => x + 1), []);
    useEffect(() => {
        let alive = true;
        load().then(d => { if (alive) { setData(d); setError(null); } })
            .catch((e: unknown) => { if (alive) setError(statusOf(e) === 404 ? (errorTextOf(e) ?? '없습니다') : '서버 응답이 없습니다'); });   // 404 는 장애가 아니라 «없는 회원입니다»
        return () => { alive = false; };
    }, [n, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
    return { data, error, reload };
}

/** 메뉴 숫자(`/ops/counts`)를 다시 읽으라는 소식 — 틀(Shell)이 듣고, 쓰기가 끝나면 알린다(60초를 안 기다린다) */
export const countsRefresh = createListeners();

/** 쓰기 한 번 — 끝나면 다시 읽고 메뉴 숫자도 다시. 실패하면 창 하나(화면은 그대로) — 서버가 까닭을 줬으면(«자기 계정은 정지 · 탈퇴할 수 없습니다» 등) 그 글 */
export async function write(go: () => Promise<unknown>, reload: () => void): Promise<void> {
    try { await go(); reload(); countsRefresh.notify(); }
    catch (e: unknown) { alert(errorTextOf(e) ?? '서버에 적지 못했습니다 — 다시 해 주세요'); }
}
