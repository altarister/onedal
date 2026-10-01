import axios from 'axios';
import type { HealthReply } from '@onedal/shared';   // 응답 모양은 shared 한 곳(공통 함수 6)

/**
 * 🔑 **운영센터가 서버를 부르는 길 — 이 파일 하나** (reviews/29 3단계 · 서버 문 `/api/auth/*` · `/api/ops/*`).
 *    운영센터는 관제웹과 다른 주소(3002 · ops.altari.com)라 저장소가 겹치지 않는다 — 따로 로그인한다(기사님은 관제웹 · 운영센터 두 번).
 *    🔴 관제웹 `api/apiClient.ts` 를 가져오지 않는다 — shared 는 의존 0(axios 못 넣음) · ui 는 React 부품만 · `opsIsolated` 검사가 문다.
 *    새로 받기(refresh)는 없다 — 로그인 30일이고 관리자 화면이라, 401 이면 토큰을 지우고 로그인 화면으로.
 *    주소: `VITE_API_URL` 이 있으면 그것(시험 때 다른 포트), 없으면 `/api`(Vite 프록시 → 4000 · 실서버는 같은 출처).
 */
const TOKEN_KEY = 'access_token';

export const client = axios.create({
    baseURL: (import.meta.env.VITE_API_URL as string | undefined) || '/api',
    headers: { 'Content-Type': 'application/json' },
});

export function token(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t: string | null) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* 사생활 보호 모드 — 이번 화면만 산다 */ }
}

client.interceptors.request.use(config => {
    const t = token();
    if (t) config.headers.Authorization = `Bearer ${t}`;
    return config;
});

/**
 * 토큰이 죽었으면(401) 지우고 로그인 화면으로 · 허락이 없으면(403 · `users.ops_allowed_at` 비움 — 쓰는 중에 거둬도) «허락 없음» 화면으로 — 한 곳에서.
 * «허락 없음» 화면(`/denied`)은 서버 문을 부르지 않으니 되돌이가 없다.
 */
client.interceptors.response.use(r => r, (e: unknown) => {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    if (status === 401 && token()) { setToken(null); window.location.assign('/login'); }
    if (status === 403 && window.location.pathname !== '/denied') window.location.assign('/denied');
    return Promise.reject(e);
});

/** HTTP 상태 하나를 읽는 자리 — 화면은 «403 이면 허락 없음» 같은 서버 사실로만 가른다 */
export function statusOf(e: unknown): number | undefined {
    return axios.isAxiosError(e) ? e.response?.status : undefined;
}

/** 서버가 준 까닭 글(`{ error }`) — 없으면 null. 관리자가 «왜»를 알게 창 · 띠에 그대로 보인다 */
export function errorTextOf(e: unknown): string | null {
    const data = axios.isAxiosError(e) ? e.response?.data as { error?: unknown } | undefined : undefined;
    return typeof data?.error === 'string' && data.error ? data.error : null;
}

/** 지금 로그인한 관리자 — 문지기(`OpsGate`)가 `/auth/me` 로 채운다. 화면 머리 · 목업 쓰기의 «누가 적었나»가 읽는다 */
export const session = { name: '' };

export async function fetchHealth(): Promise<HealthReply> {
    return (await client.get<HealthReply>('/health')).data;
}

export async function loginGoogle(credential: string): Promise<void> {
    const { data } = await client.post<{ accessToken: string }>('/auth/google', { credential });
    setToken(data.accessToken);
}

/** 🧪 로컬 전용 — 라이브에서는 서버가 404. 버튼은 `fetchHealth().live === false` 일 때만 그린다(누르기 전에 이 문을 부르지 않는다) */
export async function loginBypass(): Promise<void> {
    const { data } = await client.post<{ accessToken: string }>('/auth/bypass');
    setToken(data.accessToken);
}

/** 이름만 — 못 받아도 빈 이름(허락은 이미 확인됐으니 이름 때문에 화면을 막지 않는다) */
export async function fetchMeName(): Promise<string> {
    try { return (await client.get<{ user: { name: string } | null }>('/auth/me')).data.user?.name ?? ''; }
    catch { return ''; }
}

export async function logout(): Promise<void> {
    try { await client.post('/auth/logout'); } catch { /* 토큰이 이미 죽었어도 화면은 나간다 */ }
    setToken(null);
    session.name = '';
}
