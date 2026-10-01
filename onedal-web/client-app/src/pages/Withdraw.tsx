import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { Checkbox } from '@onedal/ui/checkbox';
import { useAuth } from '../contexts/AuthContext';
import { submitWithdraw } from '../api/join';
import { ContentSlot, JoinShell, SectionCard } from './JoinSteps';

/**
 * 🚪 **탈퇴 — 안내 → 확인 → 끝** (reviews/29 6장 «탈퇴 · 파기»).
 *    무엇을 지우고 무엇을 몇 달 남기나는 개인정보 처리방침과 짝으로 정한다 — 지금은 목록 자리만 있다.
 *    🔴 서버가 하는 일은 «탈퇴 시각을 적고 폰 보고를 거절»까지(`POST /api/join/withdraw`) — `api/join.ts` 가 부른다. 끝나면 로그아웃.
 */

/** 형식 — 실제 항목과 기간은 처리방침(운영센터 «페이지 글»)이 정한다 */
const ERASE_LIST = [
    { what: '가입 정보 (이름 · 연락처 · 차종 · 배차망 · 지역)', when: '탈퇴 즉시' },
    { what: '폰 연결 · 필터 · 판정 기준', when: '탈퇴 즉시' },
    { what: '콜 기록 · 위치 궤적', when: '(처리방침이 정한 기간 뒤)' },
    { what: '결제 · 세금 증빙', when: '(법이 정한 기간 보관)' },
];

export default function Withdraw() {
    const [confirmed, setConfirmed] = useState(false);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { logout } = useAuth();

    const run = async () => {
        setBusy(true);
        setError(null);
        try { await submitWithdraw(); setDone(true); }
        catch { setError('탈퇴를 보내지 못했습니다 — 잠시 뒤 다시 눌러 주세요.'); }
        finally { setBusy(false); }
    };

    if (done) {
        return (
            <JoinShell title="탈퇴 처리되었습니다">
                <div className="rounded-2xl border border-border-card bg-surface px-4 py-6 text-center space-y-2">
                    <div className="text-3xl">👋</div>
                    <div className="font-bold">이 계정의 폰 보고는 이제 거절됩니다</div>
                    <p className="text-sm text-text-muted">자료는 위 목록의 시점에 지워집니다. 다시 쓰려면 새로 가입하세요.</p>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>로그아웃</Button>
            </JoinShell>
        );
    }

    return (
        <JoinShell title="탈퇴" subtitle="되돌릴 수 없습니다 — 천천히 읽어 주세요">
            {error && <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">{error}</div>}
            <ContentSlot kind="withdrawGuide" placeholder="예: 탈퇴하면 무엇이 지워지고 무엇이 남는지 한 문단" />
            <SectionCard title="지워지는 것">
                <ul className="space-y-2 text-sm">
                    {ERASE_LIST.map(e => (
                        <li key={e.what} className="flex justify-between gap-3">
                            <span>{e.what}</span>
                            <span className="text-text-muted shrink-0">{e.when}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>
            <SectionCard>
                <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} className="mt-0.5" />
                    <span className="text-sm">위 내용을 확인했고, 진행 중인 콜이 없습니다. 탈퇴합니다.</span>
                </label>
            </SectionCard>
            <div className="flex gap-2">
                <Button asChild variant="outline" className="flex-1"><Link to="/">그만두기</Link></Button>
                <Button type="button" variant="destructive" className="flex-[2]" disabled={!confirmed || busy} onClick={run}>{busy ? '처리 중…' : '탈퇴하기'}</Button>
            </div>
        </JoinShell>
    );
}
