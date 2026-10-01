import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { Shell } from './ui';
import { client, fetchMeName, logout, session, statusOf, token } from './api/client';
import Login from './pages/Login';
import Members from './pages/Members';
import MemberDetail from './pages/MemberDetail';
import MembersCheck from './pages/MembersCheck';
import Calls from './pages/Calls';
import MapPage from './pages/MapPage';
import Phones from './pages/Phones';
import Anomalies from './pages/Anomalies';
import Contents from './pages/Contents';
import Notices from './pages/Notices';
import Releases from './pages/Releases';
import Stats from './pages/Stats';
import Audit from './pages/Audit';
import Board from './pages/Board';

/**
 * 🏢 **운영센터 주소 — reviews/29 5장 그대로.** 로그인(`/login`) 밖은 토큰이 없으면 로그인으로.
 *    들어올 수 있나는 서버가 정한다 — `/api/ops/counts` 한 번에 403 이면 «허락이 없는 계정»(`users.ops_allowed_at` · core/opsAccess). 화면은 role 을 읽지 않는다.
 */
function OpsGate({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const [checked, setChecked] = useState(false);
    const [denied, setDenied] = useState(false);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        if (!token()) { navigate('/login', { replace: true }); return; }
        let alive = true;
        (async () => {
            try {
                await client.get('/ops/counts');
                session.name = await fetchMeName();
                if (alive) setChecked(true);
            } catch (e) {
                if (!alive) return;
                if (statusOf(e) === 403) { setDenied(true); setChecked(true); }
                else if (statusOf(e) !== 401) setFailed('서버 응답이 없습니다');
            }
        })();
        return () => { alive = false; };
    }, [navigate]);

    const leave = async () => { await logout(); navigate('/login', { replace: true }); };

    if (failed) return <Notice title="서버 응답이 없습니다" body="잠시 뒤 다시 열어 주세요." action={<Button type="button" variant="outline" onClick={() => window.location.reload()}>다시</Button>} />;
    if (!checked) return <Notice title="확인 중…" body="" />;
    if (denied) return <Notice title="운영센터 허락이 없는 계정입니다" body="관리자에게 물어보세요. 기사 화면은 관제웹(1dal.altari.com)입니다." action={<Button type="button" variant="outline" onClick={() => void leave()}>로그아웃</Button>} />;
    return <>{children}</>;
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
                <Route path="/*" element={
                    <OpsGate>
                        <Shell>
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
                        </Shell>
                    </OpsGate>
                } />
            </Routes>
        </BrowserRouter>
    );
}
