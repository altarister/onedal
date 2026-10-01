import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useOps } from '../api/ops';
import { useCallsChanged } from '../api/socket';
import { Card, ErrorBand, PageHeader } from '../ui';

/**
 * 🏠 **홈** — 전체가 괜찮나 · 지금 할 일은(reviews/33). 숫자를 누르면 그 쪽으로 간다.
 *    지금은 «지금 할 일» 줄의 셋(전화할 콜 · 승인 대기 · 끊긴 폰)만 서버 `/api/ops/counts` 의 실제 숫자다.
 *    🔴 나머지 칸은 서버 문(`/api/ops/home`)이 생기기 전이라 자리만 — 지어낸 숫자를 넣지 않는다(가짜 숫자는 실측처럼 읽힌다).
 *    칸 순서는 33 의 순위: 지금 할 일 → 접속 상태 · 못 읽는 배차망 화면 → 지금 일하는 사람 · 지역 분포 → 회원 수 · 카카오.
 */
const LATER = '서버 문(홈 요약)이 생기면 채워집니다';

export default function Home() {
    const [n, setN] = useState(0);
    const again = useCallback(() => setN(x => x + 1), []);
    useCallsChanged(again);   // 콜이 바뀌면 바로 다시 읽는다
    const { data: c, error, reload } = useOps(() => api.counts(), [n]);
    const todo: Array<{ icon: string; label: string; n: number | null; to?: string; urgent?: boolean }> = [
        { icon: '🚨', label: '기사 이상 신호', n: null },
        { icon: '📞', label: '전화할 콜', n: c?.callsTodo ?? 0, to: '/calls', urgent: true },
        { icon: '👤', label: '승인 대기', n: c?.pendingMembers ?? 0, to: '/members' },
        { icon: '⏳', label: '곧 끝나는 기한', n: null },
        { icon: '📵', label: '끊긴 폰', n: c?.phonesOffline ?? 0, to: '/inspect' },
        { icon: '📱', label: '업데이트 필요', n: null },
    ];
    return (
        <>
            <PageHeader title="홈" sub="운영센터 한 장 — 지금 할 일이 맨 위" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card title="지금 할 일">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    {todo.map(t => {
                        const body = (
                            <>
                                <div className="text-xs text-text-muted">{t.icon} {t.label}</div>
                                <div className={`text-2xl font-black ${t.n == null ? 'text-text-muted/50' : t.n > 0 ? (t.urgent ? 'text-danger' : 'text-warning') : 'text-text-muted/60'}`}>{t.n ?? '—'}</div>
                                {t.n == null && <div className="text-[10px] text-text-muted">{LATER}</div>}
                            </>
                        );
                        const cls = 'rounded-xl border border-border-card bg-surface-alt/30 px-3 py-2 block';
                        return t.to ? <Link key={t.label} to={t.to} className={`${cls} hover:bg-surface-alt`}>{body}</Link> : <div key={t.label} className={cls}>{body}</div>;
                    })}
                </div>
            </Card>
            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                {['접속 상태 — 폰 연결 · 마지막 보고 · 서버', '못 읽는 배차망 화면 — 배차망마다 주의 · 비상', '지금 일하는 사람 — 어디까지 왔나', '지역 분포 — 회원이 지금 있는 시 · 구', '회원 — 전체 · 사용 중 · 승인 대기 · 정지 · 유예', '카카오 호출 — 오늘 · 이달'].map(title => (
                    <Card key={title} title={title}><p className="text-sm text-text-muted">{LATER}</p></Card>
                ))}
            </div>
        </>
    );
}
