import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TARGET_APP_LABEL, deviceLabel, type TargetAppType } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { api } from '../api/ops';
import { Card, PageHeader, Stat, StatusBadge, VERDICT_DOT, fmtTime, fmtWon, useTick } from '../ui';

/** 👤 회원 한 명 — 사실 칸 · 폰 · 오늘 콜 · 이상 기록 · 카카오 사용량 · 이 회원에 대한 기록. 열람은 기록에 남는다 */
export default function MemberDetail() {
    useTick();
    const { id = '' } = useParams();
    const m = api.member(id);
    useEffect(() => { if (m) api.viewed('회원 봄', m.id, '/members/:id'); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!m) return <PageHeader title="회원을 찾을 수 없습니다" sub={id} />;

    const plusDays = (n: number) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
    const calls = api.calls().filter(c => c.memberId === m.id);
    const anomalies = api.anomalies().filter(a => a.memberId === m.id);
    const audit = api.audit().filter(a => a.targetMemberId === m.id);
    const usage = api.kakaoUsage(m.id);
    const activeCalls = calls.filter(c => c.status === 'ORDER_CONFIRMED').length;

    return (
        <>
            <PageHeader title={m.name} sub={`${m.email} · 가입 ${m.createdAt.slice(0, 10)}`} right={<><StatusBadge m={m} /><Button asChild variant="ghost" size="sm"><Link to="/members">← 목록</Link></Button></>} />

            <Card title="사실 칸 — 화면의 «상태»는 이 칸들에서만 만든다">
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-text-muted">승인</dt><dd className="font-semibold">{fmtTime(m.approvedAt)}</dd>
                    <dt className="text-text-muted">유료 기한</dt><dd className="font-semibold">{m.paidUntil ?? '없음'}</dd>
                    <dt className="text-text-muted">정지</dt><dd className="font-semibold">{m.suspendedAt ? `${fmtTime(m.suspendedAt)}${m.suspendAfterActive ? ' (끝난 뒤)' : ' (즉시)'}` : '—'}</dd>
                    <dt className="text-text-muted">탈퇴</dt><dd className="font-semibold">{fmtTime(m.withdrawnAt)}</dd>
                    <dt className="text-text-muted">자동 잡기</dt><dd className="font-semibold">{m.autoUntil ? `${m.autoUntil} 까지` : '알람만'}</dd>
                    <dt className="text-text-muted">통계</dt><dd className="font-semibold">{m.statsUntil ? `${m.statsUntil} 까지` : '없음'}</dd>
                    <dt className="text-text-muted">차종 · 배차망</dt><dd className="font-semibold">{m.vehicle || '—'} · {m.networks.map(n => TARGET_APP_LABEL[n as TargetAppType]).join(' · ') || '—'}</dd>
                    <dt className="text-text-muted">지역 · 유튜브</dt><dd className="font-semibold">{m.region || '—'} · {m.youtubeChannel ?? '(비움)'}</dd>
                    <dt className="text-text-muted">운영센터</dt><dd className="font-semibold">{m.opsAllowedAt ? `허락됨 (${fmtTime(m.opsAllowedAt)})` : '—'}</dd>
                </dl>
            </Card>

            <Card title="관리자가 하는 일 — 전부 기록에 남습니다">
                <div className="flex flex-wrap gap-2">
                    {!m.approvedAt && <Button type="button" size="sm" onClick={() => api.approve(m.id)}>승인 (+1달)</Button>}
                    {!m.suspendedAt && m.approvedAt && (
                        <Button type="button" size="sm" variant="outline" onClick={() => { if (confirm(`진행 중 콜 ${activeCalls}건 — 끝나면 멈춥니다. 정지할까요?`)) api.suspend(m.id, false); }}>정지 (끝난 뒤)</Button>
                    )}
                    {!m.suspendedAt && m.approvedAt && (
                        <Button type="button" size="sm" variant="destructive" onClick={() => { if (confirm('⚠️ 즉시 정지하면 KEEP 한 콜의 안전취소가 멈춥니다. 계정 도용 같은 때만 쓰세요. 진행할까요?')) api.suspend(m.id, true); }}>즉시 정지</Button>
                    )}
                    {m.suspendedAt && <Button type="button" size="sm" onClick={() => api.resume(m.id)}>정지 풀기</Button>}
                    {!m.withdrawnAt && <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm('탈퇴 처리는 되돌릴 수 없습니다. 폰 보고가 거절되고 자료가 파기 예정이 됩니다.')) api.withdraw(m.id); }}>탈퇴 처리</Button>}
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border-card">
                    <span className="text-xs text-text-muted self-center">허락 · 기한:</span>
                    <Button type="button" size="xs" variant="outline" onClick={() => api.setAllow(m.id, 'autoUntil', m.autoUntil ? null : plusDays(365))}>{m.autoUntil ? '자동 잡기 끄기' : '자동 잡기 켜기 (+1년)'}</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => api.setAllow(m.id, 'statsUntil', m.statsUntil ? null : plusDays(365))}>{m.statsUntil ? '통계 끄기' : '통계 켜기 (+1년)'}</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => api.setAllow(m.id, 'paidUntil', plusDays(30))}>유료 기한 +1달</Button>
                </div>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="오늘 본 콜" value={calls.length} />
                <Stat label="진행 중" value={activeCalls} tone={activeCalls ? 'ok' : undefined} />
                <Stat label="카카오 오늘 / 이달" value={`${usage.today} / ${usage.month}`} hint="길찾기 호출 수" />
                <Stat label="이상 기록" value={anomalies.length} tone={anomalies.length ? 'warn' : undefined} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
                <Card title="폰">
                    {m.phones.length === 0 && <p className="text-sm text-text-muted">연결된 폰이 없습니다</p>}
                    {m.phones.map(p => (
                        <div key={p.deviceId} className="flex items-center justify-between text-sm">
                            <div><span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> <b>{deviceLabel(p)}</b> <span className="text-text-muted">v{p.appVersion} · {p.mode}</span></div>
                            <div className="text-xs text-text-muted">{p.status === 'ONLINE' ? fmtTime(p.lastSeenAt) : p.offlineReason ?? '끊김'}</div>
                        </div>
                    ))}
                </Card>
                <Card title="오늘 콜 (구간 · 요금 · 판정)">
                    {calls.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {calls.map(c => (
                        <div key={c.id} className="text-sm flex justify-between gap-2">
                            <span>{VERDICT_DOT[c.verdict]} {c.pickup.place} → {c.dropoff.place}</span>
                            <span className="text-text-muted shrink-0">{fmtWon(c.fare)} · {c.status.replace('ORDER_', '')}</span>
                        </div>
                    ))}
                </Card>
                <Card title="이상 기록">
                    {anomalies.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {anomalies.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {a.targetApp} · {a.screen} — {a.reason}</div>)}
                </Card>
                <Card title="이 회원에 대한 기록">
                    {audit.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {a.action} <span className="text-text-muted">{a.detail}</span></div>)}
                </Card>
            </div>
        </>
    );
}
