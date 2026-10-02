import { useCallback, useEffect, useState } from 'react';
import { RELEASE_UPLOAD_HEADERS } from '@onedal/shared';
import type {
    OpsAllowRequest, OpsAnomaliesReply, OpsBoardFilter, OpsBoardIntel, OpsBoardKakao, OpsBoardMember, OpsBoardPhone, OpsBoardServer, OpsHome, OpsLocations, OpsAudit, OpsCall, OpsCallNoteWrite, OpsContent, OpsContentKind, OpsContentSave, OpsCounts, OpsMember, OpsMemberDetail, OpsMinimumRelease, OpsNotice, OpsNoticePost, OpsPaidUntilRequest, OpsPhone, OpsRelease, OpsStats, OpsSuspendRequest,
} from '@onedal/shared';
import { client, errorTextOf, statusOf } from './client';
import { createListeners } from './listeners';

/**
 * 🏢 **운영센터가 서버 문 `/api/ops/*` 를 부르는 곳 — 이 파일 하나** (reviews/29 3단계 · 서버 `routes/ops.ts` · 규격 shared `ops.ts`).
 *    쓰기마다 서버가 `ops_audit` 한 줄을 남긴다 — 화면은 기록을 따로 적지 않는다. 회원 상세 열람도 서버가 적는다(«회원 봄»).
 *    🔴 서버가 안 되면 쪽이 «서버 응답이 없습니다 — 다시»를 보인다 — 예시 자료로 대신 그리지 않는다(장애를 가리면 노이즈).
 *    아직 서버 문이 없는 쪽(멤버 대조)은 `example.ts` 의 예시 자료를 쓰고 쪽 머리에 그렇다고 적는다.
 */
const get = async <T,>(path: string) => (await client.get<T>(`/ops${path}`)).data;
const post = async <T,>(path: string, body?: unknown) => (await client.post<T>(`/ops${path}`, body)).data;

export const api = {
    members: () => get<OpsMember[]>('/members'),
    member: (id: string) => get<OpsMemberDetail>(`/members/${id}`),
    phones: () => get<OpsPhone[]>('/phones'),
    anomalies: () => get<OpsAnomaliesReply>('/anomalies'),
    /** 📷 이상 기록 사진 — 줄을 펼칠 때만 받는다(머리 칸 인증이라 `<img src>` 로 바로 못 연다 · 서버가 «사진 봄» 기록을 남긴다 · 지워졌으면 404) */
    anomalyShot: async (id: number) => (await client.get<Blob>(`/ops/anomalies/${id}/shot`, { responseType: 'blob' })).data,
    contents: () => get<OpsContent[]>('/contents'),
    notices: () => get<OpsNotice[]>('/notices'),
    /** since 가 있으면 그 날(한국 날)부터 전부 · 없으면 최근 200줄 */
    audit: (since?: string) => get<OpsAudit[]>(since ? `/audit?since=${since}` : '/audit'),
    counts: () => get<OpsCounts>('/counts'),
    /** 🗺️ 회원 위치 — 운전석 폰 GPS 마지막 점 + 시 · 구 뱃지(서버가 동 명부로 찾는다 · 열람 기록 «위치 봄»은 서버가 남긴다) */
    locations: () => get<OpsLocations>('/locations'),
    /** 🏠 홈 한 장 — 서버가 각 쪽의 문과 같은 함수로 센 숫자(홈 숫자 = 쪽 숫자) */
    home: () => get<OpsHome>('/home'),

    /** 승인 — 승인 시각만 적는다. 유료 기한은 안 건드린다(가족판은 비움 = 기한 없음) */
    approve: (id: string) => post<OpsMember>(`/members/${id}/approve`),
    /** 정지 — «끝난 뒤»(진행 중 콜이 끝나면 멈춤) 또는 즉시(관제웹 연결도 끊긴다 · 안전취소가 멈춘다) */
    suspend: (id: string, afterActive: boolean) => post<OpsMember>(`/members/${id}/suspend`, { afterActive } satisfies OpsSuspendRequest),
    resume: (id: string) => post<OpsMember>(`/members/${id}/resume`),
    withdraw: (id: string) => post<OpsMember>(`/members/${id}/withdraw`),
    /** 허락(자동 잡기 · 통계) 켜기 · 끄기 — 켜기는 허락 시각이 없으면 지금 · 기한은 날(YYYY-MM-DD) 또는 비움(= 기한 없음) · 끄기는 허락 시각만 비운다 */
    setAllow: (id: string, what: OpsAllowRequest['what'], on: boolean, until: string | null) => post<OpsMember>(`/members/${id}/allow`, { what, on, until } satisfies OpsAllowRequest),
    /** 유료 기한 — 날 또는 비움(가족 = 기한 없음). 지나면 서버가 «끝난 뒤 멈춤»과 같은 길로 막는다 */
    setPaidUntil: (id: string, until: string | null) => post<OpsMember>(`/members/${id}/paid-until`, { until } satisfies OpsPaidUntilRequest),
    /** 글 저장은 새 판 한 줄 — 옛 판을 덮어쓰지 않는다(동의가 판을 가리킨다) */
    saveContent: async (kind: OpsContentKind, title: string, body: string) => (await client.put<OpsContent>(`/ops/contents/${kind}`, { title, body } satisfies OpsContentSave)).data,
    postNotice: (text: string, activeUntil: string | null) => post<OpsNotice>('/notices', { text, activeUntil } satisfies OpsNoticePost),
    /** 내림 — 줄을 지우지 않고 내린 시각을 적는다 */
    endNotice: (id: number) => post<OpsNotice>(`/notices/${id}/end`),

    /** 📞 진행 중 KEEP 콜 — 서버가 «통화 필요»(🟡 이고 상차 통화 전)를 위에 놓는다 */
    calls: (memberId?: string) => get<OpsCall[]>(memberId ? `/calls?memberId=${encodeURIComponent(memberId)}` : '/calls'),
    /** 통화 결과 적기 — 서버가 그 콜의 통화 단계 행에 적는다(기사 소켓과 같은 길 · 400 칸 이상 · 404 진행 중 아님 · 409 기사님 현장 실측 있음) */
    writeCallNote: (id: string, note: OpsCallNoteWrite) => post<OpsCall>(`/calls/${id}/note`, note),

    /** 📦 앱 배포 — 올린 판 전부(최신은 판 번호 최대 · 최소는 앱마다 한 줄 — 서버가 정한다) */
    releases: () => get<OpsRelease[]>('/releases'),
    setMinimum: (app: OpsRelease['app'], versionCode: number) => (async () => (await client.put<OpsRelease[]>('/ops/releases/minimum', { app, versionCode } satisfies OpsMinimumRelease)).data)(),
    /** APK 올리기 — 본문은 파일 바이트 그대로(메모리 복사 없음) · 판 정보는 shared 머리 칸 넷(글자는 encodeURIComponent — 서버가 decode) · 같은 판 409 · 상한 413 */
    uploadRelease: async (file: File, app: OpsRelease['app'], versionName: string, versionCode: number, onProgress: (pct: number) => void) =>
        (await client.post<OpsRelease[]>('/ops/releases', file, {
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                [RELEASE_UPLOAD_HEADERS.app]: app, [RELEASE_UPLOAD_HEADERS.versionCode]: String(versionCode),
                [RELEASE_UPLOAD_HEADERS.versionName]: encodeURIComponent(versionName), [RELEASE_UPLOAD_HEADERS.fileName]: encodeURIComponent(file.name),
            },
            onUploadProgress: e => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
        })).data,

    /** 🧰 현황판(점검) — 읽기만 · 회원을 고르는 둘(filter · intel)은 서버가 열람 기록을 남긴다(열어 둔 동안 한 줄) */
    boardServer: () => get<OpsBoardServer>('/board/server'),
    boardPhones: (memberId?: string) => get<OpsBoardPhone[]>(memberId ? `/board/phones?memberId=${encodeURIComponent(memberId)}` : '/board/phones'),
    boardFilter: (memberId: string) => get<OpsBoardFilter>(`/board/filter?memberId=${encodeURIComponent(memberId)}`),
    /** 카카오 호출 수 — 회원마다 + 주인 없음(memberId null) 줄 · 이달에 센 주인만 · 합계는 화면이 더한다 */
    boardKakao: () => get<OpsBoardKakao>('/board/kakao'),
    /** 📍⚖️📰 관제웹 현황판의 그 기사 몫 셋 — 서버가 쥔 내 위치 · 심사 중인 콜 · 새 글자(모든 폰 공통). 세션이 없으면 위치 · 심사는 null */
    boardMember: (memberId: string) => get<OpsBoardMember>(`/board/member?memberId=${encodeURIComponent(memberId)}`),
    boardIntel: (memberId: string, limit = 40) => get<OpsBoardIntel>(`/board/intel?memberId=${encodeURIComponent(memberId)}&limit=${limit}`),

    /** 📊 통계 — 목록에 뜬 실물 콜만(시뮬레이터 콜은 서버가 안 센다) · 기간은 서버 기본(최근 28일) · 합 · 평균은 서버가 센 그대로 */
    stats: () => get<OpsStats>('/stats'),
};


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
