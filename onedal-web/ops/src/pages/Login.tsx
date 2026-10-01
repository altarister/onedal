import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { Button } from '@onedal/ui/button';
import { fetchHealth, loginBypass, loginGoogle, token } from '../api/client';

/**
 * 🔐 **운영센터 로그인** — 구글 로그인 하나(관제웹과 같은 웹 클라이언트 ID · 서버 검증 `/api/auth/google` 도 같다).
 *    누가 들어올 수 있나(`ops_allowed_at`)는 로그인 뒤 서버 403 으로 안다(`App.tsx` 의 `OpsGate`) — 여기서 role 을 읽지 않는다.
 *    🧪 «개발 우회 로그인»은 서버가 `/api/health` 로 «라이브가 아니다»라고 말할 때만 그린다 — 우회 문을 불러 보는 것으로 가르지 않는다(부르는 순간 로그인이 된다).
 */
export default function Login() {
    const navigate = useNavigate();
    const [live, setLive] = useState<boolean | undefined>(undefined);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        fetchHealth().then(h => { if (alive) setLive(h.live); }).catch(() => { if (alive) setFailed('서버 응답이 없습니다'); });
        return () => { alive = false; };
    }, []);

    if (token()) return <Navigate to="/members" replace />;

    const after = async (go: () => Promise<void>) => {
        setFailed(null);
        try { await go(); navigate('/members', { replace: true }); }
        catch { setFailed('로그인에 실패했습니다'); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
            <div className="bg-surface border border-border-card p-8 rounded-2xl shadow-xl w-full max-w-sm flex flex-col items-center">
                <span className="w-14 h-14 rounded-xl bg-gradient-to-tr from-accent-alt to-info flex items-center justify-center text-white font-black text-lg mb-5">1D</span>
                <h1 className="text-2xl font-black mb-1">1DAL 운영센터</h1>
                <p className="text-text-muted text-sm mb-7">관리자만 들어옵니다 · 열람은 기록에 남습니다</p>
                <div className="w-full flex flex-col items-center gap-3">
                    <GoogleLogin onSuccess={r => { if (r.credential) void after(() => loginGoogle(r.credential!)); }} onError={() => setFailed('구글 로그인이 열리지 않습니다')} theme="filled_black" size="large" />
                    {live === false && (
                        <Button type="button" variant="ghost" size="sm" className="text-xs text-text-muted" onClick={() => void after(loginBypass)}>
                            개발 우회 로그인 (로컬 서버)
                        </Button>
                    )}
                    {failed && <div className="text-sm text-danger">{failed}</div>}
                </div>
            </div>
        </div>
    );
}
