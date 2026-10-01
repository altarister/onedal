import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TARGET_APP_LABEL, type OpsHome } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { useCallsChanged } from '../api/socket';
import { Card, ErrorBand, KV, PageHeader, fmtDateTime, fmtTime, memberName } from '../ui';

/**
 * 🏠 **홈** — 전체가 괜찮나 · 지금 할 일은(reviews/33 2단계 · 서버 `GET /api/ops/home` 한 번).
 *    숫자는 서버가 각 쪽의 문과 같은 함수로 센다 — 홈 숫자 = 그 쪽 숫자. 숫자를 누르면 그 쪽으로 간다.
 *    칸 순서는 33 의 순위: 지금 할 일 → 접속 상태 · 못 읽는 배차망 화면 → 지금 일하는 사람 · 지역 분포 → 회원 수 · 카카오.
 *    🔴 «몇 분 전» 같은 상대시각은 쓰지 않는다(shared format.ts — 화면이 멈추면 숫자가 거짓이 된다) — KEEP 시각을 그대로 적는다.
 *    🔴 지역 분포는 위치 문(3단계)이 주기 전엔 자리만 — 지어낸 값을 넣지 않는다. 콜이 바뀌면(서버 신호) 바로, 그 밖엔 30초마다 다시 읽는다.
 */
const LEVEL_DOT: Record<OpsHome['networks'][number]['level'], { dot: string; text: string }> = {
    ok: { dot: 'text-success', text: '잘 읽는 중' },
    warn: { dot: 'text-warning', text: '주의 — 처음 보는 글자' },
    alarm: { dot: 'text-danger', text: '비상 — 한동안 못 읽음' },
};

export default function Home() {
    const [n, setN] = useState(0);
    const again = useCallback(() => setN(x => x + 1), []);
    useCallsChanged(again);
    useEffect(() => { const t = setInterval(again, 30_000); return () => clearInterval(t); }, [again]);
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.home()]), [n]);
    const [members, h] = data ?? [[], null];
    const t = h?.todo;
    const todo: Array<{ icon: string; label: string; n: number | undefined; to: string; urgent?: boolean; note?: string }> = [
        { icon: '🚨', label: '기사 이상 신호', n: t?.emergencies, to: '/inspect', urgent: true },
        { icon: '📡', label: '배차망 비상', n: t?.networkAlarms, to: '/inspect', urgent: true },
        { icon: '📞', label: '전화할 콜', n: t?.callsTodo, to: '/calls', urgent: true, note: t?.oldestKeepAt ? `가장 오래된 KEEP ${fmtTime(t.oldestKeepAt)}` : undefined },
        { icon: '👤', label: '승인 대기', n: t?.pendingMembers, to: '/members' },
        { icon: '⏳', label: '곧 끝나는 기한', n: t?.expiringSoon, to: '/members', note: '7일 안 · 유예 중' },
        { icon: '📵', label: '끊긴 폰', n: t?.phonesOffline, to: '/inspect' },
        { icon: '📱', label: '업데이트 필요', n: t?.needUpdate, to: '/manage?tab=releases' },
    ];
    const more = (to: string, text: string): ReactNode => <Link to={to} className="text-xs text-info hover:underline">{text} →</Link>;

    return (
        <>
            <PageHeader title="홈" sub="운영센터 한 장 — 지금 할 일이 맨 위" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card title="지금 할 일">
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {todo.map(x => (
                        <Link key={x.label} to={x.to} className="rounded-xl border border-border-card bg-surface-alt/30 px-3 py-2 block hover:bg-surface-alt">
                            <div className="text-xs text-text-muted">{x.icon} {x.label}</div>
                            <div className={`text-2xl font-black ${x.n ? (x.urgent ? 'text-danger' : 'text-warning') : 'text-text-muted/60'}`}>{x.n ?? '—'}</div>
                            {x.note && <div className="text-[10px] text-text-muted">{x.note}</div>}
                        </Link>
                    ))}
                </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                <Card title="접속 상태">
                    <KV k="폰 연결 · 끊김" v={h ? `${h.access.phonesOnline} · ${h.access.phonesOffline}` : '—'} />
                    <KV k="마지막 폰 보고" v={fmtTime(h?.access.lastScrapAt)} />
                    <KV k="서버 부팅" v={fmtDateTime(h?.access.bootedAt)} />
                    {/* 🧯 서버 오류 줄 — 서버 메모리가 센 그대로(다시 띄우거나 날이 바뀌면 0)라 «부팅 뒤 · 오늘»을 같이 적는다 */}
                    <KV k="오류 (부팅 뒤 · 오늘)" v={!h ? '—' : h.access.errorsToday.count === 0 ? '없음' : <span className="text-warning font-bold">{h.access.errorsToday.count}줄 · {h.access.errorsToday.kinds}가지</span>} />
                    <KV k="붙은 화면 (관제웹 · 운영센터)" v={h ? `${h.access.sockets.web} · ${h.access.sockets.ops}` : '—'} />
                    {more('/inspect', '점검에서 보기')}
                </Card>
                <Card title="못 읽는 배차망 화면">
                    {h?.networks.length === 0 && <p className="text-sm text-text-muted">폰이 보고한 배차망이 없습니다</p>}
                    {h?.networks.map(nw => (
                        <div key={nw.targetApp} className="text-sm flex justify-between gap-2">
                            <span><span className={LEVEL_DOT[nw.level].dot}>●</span> <b>{TARGET_APP_LABEL[nw.targetApp]}</b> <span className="text-text-muted">{LEVEL_DOT[nw.level].text}</span></span>
                            <span className="text-text-muted shrink-0">마지막 {fmtTime(nw.lastGoodAt)} · 못 읽음 {nw.anomaliesToday} / 7일 {nw.anomalies7d} · 새 글자 {nw.newWords}</span>
                        </div>
                    ))}
                    {more('/inspect', '이상 기록 보기')}
                </Card>
                <Card title={`지금 일하는 사람 — 보고 중 ${h?.working.reporting ?? '—'} · 운행 중 ${h?.working.driving ?? '—'}`}>
                    {h?.working.rows.length === 0 && <p className="text-sm text-text-muted">운행 중인 기사가 없습니다</p>}
                    {h?.working.rows.map(r => (
                        <Link key={r.memberId} to={`/members/${r.memberId}`} className="text-sm flex justify-between gap-2 hover:underline">
                            <span><b>{memberName(members, r.memberId)}</b> · {r.stage}</span>
                            <span className="text-text-muted shrink-0">{r.nextStop ?? '—'}{r.etaAt ? ` · ${fmtTime(r.etaAt)} 도착 예정` : ''}</span>
                        </Link>
                    ))}
                </Card>
                <Card title="지역 분포 — 회원이 지금 있는 시 · 구">
                    {h && h.regions.length === 0 && <p className="text-sm text-text-muted">위치 문이 생기면 채워집니다</p>}
                    <div className="flex flex-wrap gap-1.5">
                        {h?.regions.map(r => <Link key={r.label} to="/map" className="rounded-full border border-border-card bg-surface-alt/40 px-2.5 py-1 text-xs">{r.label} <b>{r.count}</b></Link>)}
                    </div>
                </Card>
                <Card title="회원">
                    <KV k="전체 · 사용 중" v={h ? `${h.members.total} · ${h.members.active}` : '—'} />
                    <KV k="승인 대기 · 정지 · 유예" v={h ? `${h.members.pending} · ${h.members.suspended} · ${h.members.grace}` : '—'} />
                    {more('/members', '회원 보기')}
                </Card>
                <Card title="카카오 호출 — 오늘 / 이달">
                    <KV k="길찾기" v={h ? `${h.kakao.route.today} / ${h.kakao.route.month}` : '—'} />
                    <KV k="좌표 찾기" v={h ? `${h.kakao.local.today} / ${h.kakao.local.month}` : '—'} />
                    {more('/inspect', '누가 썼나 보기')}
                </Card>
            </div>
        </>
    );
}
