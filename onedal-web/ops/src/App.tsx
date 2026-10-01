import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { Shell } from './ui';
import { client, fetchMeName, logout, session, statusOf, token } from './api/client';
import { connectSignal, disconnectSignal } from './api/socket';
import Login from './pages/Login';

/** 쪽은 열 때 따로 받는다 — 처음 받는 덩어리를 줄여 폰 브라우저에서 빨리 뜨게. 로그인만 처음부터(첫 화면) */
const Members = lazy(() => import('./pages/Members'));
const MemberDetail = lazy(() => import('./pages/MemberDetail'));
const MembersCheck = lazy(() => import('./pages/MembersCheck'));
const Calls = lazy(() => import('./pages/Calls'));
const MapPage = lazy(() => import('./pages/MapPage'));
const Phones = lazy(() => import('./pages/Phones'));
const Anomalies = lazy(() => import('./pages/Anomalies'));
const Contents = lazy(() => import('./pages/Contents'));
const Notices = lazy(() => import('./pages/Notices'));
const Releases = lazy(() => import('./pages/Releases'));
const Stats = lazy(() => import('./pages/Stats'));
const Audit = lazy(() => import('./pages/Audit'));
const Board = lazy(() => import('./pages/Board'));

/**
 * 🏢 **운영센터 주소 — reviews/29 5장 그대로.** 로그인(`/login`) 밖은 토큰이 없으면 로그인으로.
 *    들어올 수 있나는 서버가 정한다 — `/api/ops/counts` 한 번에 403 이면 «허락이 없는 계정»(`/denied` · `users.ops_allowed_at` · core/opsAccess).
 *    쓰는 중에 허락을 거둬도 `client.ts` 가 403 을 `/denied` 로 보낸다(한 곳). 화면은 role 을 읽지 않는다.
 */
function OpsGate({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const [checked, setChecked] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        if (!token()) { navigate('/login', { replace: true }); return; }
        let alive = true;
        (async () => {
            try {
                await client.get('/ops/counts');
                session.name = await fetchMeName();
                if (alive) { connectSignal(); setChecked(true); }   // 허락이 확인된 뒤에만 신호 소켓(/ops)을 연다
            } catch (e) {
                if (!alive) return;
                if (statusOf(e) === 403) navigate('/denied', { replace: true });
                else if (statusOf(e) !== 401) setFailed('서버 응답이 없습니다');
            }
        })();
        return () => { alive = false; disconnectSignal(); };   // 로그인 화면으로 나가면 닫는다
    }, [navigate]);

    if (failed) return <Notice title="서버 응답이 없습니다" body="잠시 뒤 다시 열어 주세요." action={<Button type="button" variant="outline" onClick={() => window.location.reload()}>다시</Button>} />;
    if (!checked) return <Notice title="확인 중…" body="" />;
    return <>{children}</>;
}

/** 🚫 허락이 없는 계정 — 서버 문을 부르지 않는다(403 되돌이 없음). 허락을 받았으면 «다시 확인»이 문지기를 다시 돈다 */
function Denied() {
    const navigate = useNavigate();
    const leave = async () => { await logout(); navigate('/login', { replace: true }); };
    return <Notice title="운영센터 허락이 없는 계정입니다" body="관리자에게 물어보세요. 기사 화면은 관제웹(1dal.altari.com)입니다." action={
        <div className="flex gap-2 justify-center">
            <Button type="button" variant="outline" onClick={() => navigate('/', { replace: true })}>다시 확인</Button>
            <Button type="button" variant="ghost" onClick={() => void leave()}>로그아웃</Button>
        </div>
    } />;
}

function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-base px-4 text-text-primary">
            <div className="bg-surface border border-border-card p-8 rounded-2xl shadow-xl w-full max-w-sm space-y-3 text-center">
                <div className="text-lg font-black">{title}</div>
                {body && <div className="text-sm text-text-muted">{body}</div>}
                {action}
            </div>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/denied" element={<Denied />} />
                <Route path="/*" element={
                    <OpsGate>
                        <Shell>
                            <Suspense fallback={<p className="text-sm text-text-muted">읽는 중…</p>}>
                            <Routes>
                                <Route path="/" element={<Navigate to="/members" replace />} />
                                <Route path="/members" element={<Members />} />
                                <Route path="/members/check" element={<MembersCheck />} />
                                <Route path="/members/:id" element={<MemberDetail />} />
                                <Route path="/calls" element={<Calls />} />
                                <Route path="/map" element={<MapPage />} />
                                <Route path="/phones" element={<Phones />} />
                                <Route path="/anomalies" element={<Anomalies />} />
                                <Route path="/board" element={<Board />} />
                                <Route path="/contents" element={<Contents />} />
                                <Route path="/notices" element={<Notices />} />
                                <Route path="/releases" element={<Releases />} />
                                <Route path="/stats" element={<Stats />} />
                                <Route path="/audit" element={<Audit />} />
                                <Route path="*" element={<Navigate to="/members" replace />} />
                            </Routes>
                            </Suspense>
                        </Shell>
                    </OpsGate>
                } />
            </Routes>
        </BrowserRouter>
    );
}
