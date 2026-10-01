import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { kstDateText, opsMemberStatus, type JoinMeReply } from '@onedal/shared';
import { useAuth } from '../contexts/AuthContext';
import { fetchMeSafe } from '../api/join';
import { gateDecision } from '../lib/joinFlow';
import { ContentSlot, JoinShell, SectionCard } from './JoinSteps';

/**
 * 🚫 **이용이 멈췄습니다** — 정지 · 탈퇴 · 유료 기한 지남 (서버 `/api/join/me` 의 `blocked`).
 *    기사는 운전 중 원달앱을 안 보니 막힘은 관제웹이 알린다. 까닭 글은 사실 칸에서 shared `opsMemberStatus` 가 만든다 — 상태 이름 칸은 없다.
 *    막힘이 풀렸으면(다시 읽어 blocked 가 거짓) 관제로 돌아간다.
 */
const todayKey = () => kstDateText(Date.now()) ?? '';   // 한국 달력 날 — 기기 시간대와 상관없이(shared 하나)

export default function Blocked() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [me, setMe] = useState<JoinMeReply | null>(null);
    const [failed, setFailed] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        fetchMeSafe().then(r => {
            if (!alive) return;
            setFailed(r.failed); setMe(r.me);
            const d = gateDecision(r.me, r.failed);
            if (d === 'ok') navigate('/', { replace: true });
            if (d === 'pending') navigate('/pending', { replace: true });
        });
        return () => { alive = false; };
    }, [navigate, tick]);

    /* 관리자가 정지를 풀면 이 화면에서 스스로 나간다 — 30초마다 · 화면이 다시 보일 때 다시 읽는다(안 그러면 «다시 보기»를 누를 때까지 갇힌다) */
    useEffect(() => {
        const again = () => setTick(t => t + 1);
        const onVisible = () => { if (document.visibilityState === 'visible') again(); };
        const timer = setInterval(again, 30_000);
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    }, []);

    const why = me ? opsMemberStatus(me, todayKey()).text : failed ? '상태를 읽지 못했습니다' : '확인 중…';

    return (
        <JoinShell title="이용이 멈췄습니다" subtitle="이 계정으로는 지금 콜을 받지 않습니다">
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-4 flex items-center gap-3">
                <span className="text-2xl">🚫</span>
                <div className="text-sm">
                    <div className="font-bold">{why}</div>
                    <div className="text-text-muted">
                        {me?.withdrawnAt ? '탈퇴한 계정입니다. 다시 쓰려면 새로 가입하세요.'
                            : me?.suspendedAt ? '관리자가 정지했습니다. 까닭은 관리자에게 물어보세요.'
                                : me?.paidUntil ? `유료 기한(${me.paidUntil})이 지났습니다. 멤버십을 확인하고 관리자에게 알려 주세요.`
                                    : '잠시 뒤 «다시 보기»를 눌러 주세요.'}
                    </div>
                </div>
            </div>
            <ContentSlot kind="withdrawGuide" placeholder="예: 관리자 연락처 · 멤버십 확인 방법" />
            <SectionCard>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setTick(t => t + 1)}>다시 보기</Button>
                    <Button type="button" variant="ghost" className="flex-1" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>로그아웃</Button>
                </div>
            </SectionCard>
        </JoinShell>
    );
}
