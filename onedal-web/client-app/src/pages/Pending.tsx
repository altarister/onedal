import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { TARGET_APP_LABEL, type JoinMeReply } from '@onedal/shared';
import { useAuth } from '../contexts/AuthContext';
import { fetchMeSafe } from '../api/join';
import { gateDecision } from '../lib/joinFlow';
import { JoinShell, SectionCard } from './JoinSteps';

/**
 * ⏳ **승인 기다리는 중** — 관리자가 운영센터에서 승인하면 관제 화면이 열린다 (`/api/join/me` 의 `approvedAt`).
 *    승인되면 관제로 · 막힘이면 «이용이 멈췄습니다»로 보낸다. 회원 줄이 없으면(신청 전) 가입으로. 못 읽으면 그대로 보이고 «다시 보기».
 */
export default function Pending() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuth();
    const [me, setMe] = useState<JoinMeReply | null>(null);
    const [failed, setFailed] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (isLoading || !isAuthenticated) return;
        let alive = true;
        fetchMeSafe().then(r => {
            if (!alive) return;
            setFailed(r.failed);
            if (r.missing) { navigate('/join', { replace: true }); return; }
            setMe(r.me);
            const d = gateDecision(r.me, r.failed);
            if (d === 'ok' && r.me) navigate('/', { replace: true });
            if (d === 'blocked') navigate('/blocked', { replace: true });
        });
        return () => { alive = false; };
    }, [isAuthenticated, isLoading, navigate, tick]);

    if (!isLoading && !isAuthenticated) {
        return (
            <JoinShell title="승인 기다리는 중" subtitle="신청한 계정으로 로그인하면 상태가 보입니다">
                <Button asChild className="w-full"><Link to="/login" state={{ from: '/pending' }}>구글로 로그인</Link></Button>
                <p className="text-center text-xs text-text-muted"><Link to="/join" className="underline">아직 신청 전이면 가입하기</Link></p>
            </JoinShell>
        );
    }

    return (
        <JoinShell title="승인 기다리는 중" subtitle="관리자가 확인하면 관제 화면이 열립니다">
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div className="text-sm">
                    <div className="font-bold">{failed ? '상태를 읽지 못했습니다' : '신청이 접수됐습니다'}</div>
                    <div className="text-text-muted">{failed ? '서버가 답하지 않습니다 — 잠시 뒤 «다시 보기»를 눌러 주세요.' : '보통 하루 안에 승인됩니다. 승인되면 이 계정으로 관제 화면이 열립니다.'}</div>
                </div>
            </div>
            {me?.info && (
                <SectionCard title="신청 내용">
                    <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                        <dt className="text-text-muted">연락처</dt><dd className="font-semibold">{me.info.phone}</dd>
                        <dt className="text-text-muted">배차망</dt><dd className="font-semibold">{me.info.dispatchNetworks.map(n => TARGET_APP_LABEL[n]).join(' · ')}</dd>
                    </dl>
                    <Button asChild variant="outline" size="sm"><Link to="/join?step=info">가입 정보 고치기</Link></Button>
                </SectionCard>
            )}
            <SectionCard title="기다리는 동안">
                <p className="text-sm text-text-muted">앱 두 개를 미리 받아 설치해 두면 승인 직후 바로 쓸 수 있습니다.</p>
                <Button asChild className="w-full"><Link to="/join/apps">앱 받기 · 설치 안내</Link></Button>
            </SectionCard>
            <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setTick(t => t + 1)}>다시 보기</Button>
                <Button asChild variant="ghost" className="flex-1"><Link to="/withdraw">신청 취소 · 탈퇴</Link></Button>
            </div>
        </JoinShell>
    );
}
