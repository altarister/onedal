import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TARGET_APP_LABEL, deviceLabel } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { api } from '../api/ops';
import { COLOR_DOT, Card, PageHeader, Stat, StatRow, StatusBadge, allowText, dayKey, fmtTime, fmtWon, plusDaysKey, statusKo, todayKey, useTick } from '../ui';

/** 👤 회원 한 명 — 사실 칸 · 폰 · 오늘 콜 · 이상 기록 · 카카오 사용량 · 이 회원에 대한 기록. 열람은 기록에 남는다 */
export default function MemberDetail() {
    useTick();
    const { id = '' } = useParams();
    const m = api.member(id);
    useEffect(() => { if (m) api.viewed('회원 봄', m.id, '/members/:id'); }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!m) return <PageHeader title="회원을 찾을 수 없습니다" sub={id} />;

    const today = todayKey();
    const calls = api.calls().filter(c => c.memberId === m.id);
    const todayCalls = calls.filter(c => dayKey(c.capturedAt) === today);
    const anomalies = api.anomalies().filter(a => a.memberId === m.id);
    const audit = api.audit().filter(a => a.targetMemberId === m.id).sort((a, b) => (a.at < b.at ? 1 : -1));
    const usage = api.kakaoUsage(m.id);
    const activeCalls = calls.filter(c => c.status === 'ORDER_CONFIRMED').length;
    const alive = !m.withdrawnAt;

    return (
        <>
            <PageHeader title={m.name} sub={`${m.email} · 가입 ${m.createdAt.slice(0, 10)}`} right={<><StatusBadge m={m} /><Button asChild variant="ghost" size="sm"><Link to="/members">← 목록</Link></Button></>} />

            <Card title="사실 칸 — 화면의 «상태»는 이 칸들에서만 만든다">
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-text-muted">승인</dt><dd className="font-semibold">{fmtTime(m.approvedAt)}</dd>
                    <dt className="text-text-muted">유료 기한</dt><dd className="font-semibold">{m.paidUntil ?? '없음'}</dd>
                    <dt className="text-text-muted">정지</dt><dd className="font-semibold">{m.suspendedAt ? `${fmtTime(m.suspendedAt)}${m.suspendAfterActive ? ' (끝난 뒤)' : ' (즉시)'}` : '—'}</dd>
                    <dt className="text-text-muted">탈퇴</dt><dd className="font-semibold">{fmtTime(m.withdrawnAt)}</dd>
                    <dt className="text-text-muted">자동 잡기</dt><dd className="font-semibold">{m.autoAllowedAt ? `허락됨 · ${allowText(m.autoAllowedAt, m.autoUntil)}` : '알람만'}</dd>
                    <dt className="text-text-muted">통계</dt><dd className="font-semibold">{m.statsAllowedAt ? `허락됨 · ${allowText(m.statsAllowedAt, m.statsUntil)}` : '없음'}</dd>
                    <dt className="text-text-muted">운영센터</dt><dd className="font-semibold">{m.opsAllowedAt ? `허락됨 (${fmtTime(m.opsAllowedAt)})` : '—'}</dd>
                    <dt className="text-text-muted">차종 · 배차망</dt><dd className="font-semibold">{m.vehicle || '—'} · {m.networks.map(n => TARGET_APP_LABEL[n]).join(' · ') || '—'}</dd>
                    <dt className="text-text-muted">지역 · 유튜브</dt><dd className="font-semibold">{m.region || '—'} · {m.youtubeChannel ?? '(비움)'}</dd>
                </dl>
            </Card>

            <Card title="관리자가 하는 일 — 전부 기록에 남습니다">
                {!alive && <p className="text-sm text-text-muted">탈퇴한 회원입니다 — 더 할 일이 없습니다.</p>}
                {alive && (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {!m.approvedAt && <Button type="button" size="sm" onClick={() => api.approve(m.id)}>승인</Button>}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="outline" onClick={() => { if (confirm(`진행 중 콜 ${activeCalls}건 — 끝나면 멈춥니다. 정지할까요?`)) api.suspend(m.id, false); }}>정지 (끝난 뒤)</Button>
                            )}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="destructive" onClick={() => { if (confirm('⚠️ 즉시 정지하면 KEEP 한 콜의 안전취소가 멈춥니다. 계정 도용 같은 때만 쓰세요. 진행할까요?')) api.suspend(m.id, true); }}>즉시 정지</Button>
                            )}
                            {m.suspendedAt && <Button type="button" size="sm" onClick={() => api.resume(m.id)}>정지 풀기</Button>}
                            <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm('탈퇴 처리는 되돌릴 수 없습니다. 폰 보고가 거절되고 자료가 파기 예정이 됩니다.')) api.withdraw(m.id); }}>탈퇴 처리</Button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-border-card items-center">
                            <span className="text-xs text-text-muted">허락:</span>
                            <Button type="button" size="xs" variant="outline" onClick={() => api.setAllow(m.id, 'auto', !m.autoAllowedAt)}>{m.autoAllowedAt ? '자동 잡기 끄기' : '자동 잡기 허락 (기한 없음)'}</Button>
                            {m.autoAllowedAt && <Button type="button" size="xs" variant="ghost" onClick={() => api.setAllow(m.id, 'auto', true, m.autoUntil ? null : plusDaysKey(30))}>{m.autoUntil ? '기한 없애기' : '기한 30일로'}</Button>}
                            <Button type="button" size="xs" variant="outline" onClick={() => api.setAllow(m.id, 'stats', !m.statsAllowedAt)}>{m.statsAllowedAt ? '통계 끄기' : '통계 허락 (기한 없음)'}</Button>
                            <span className="text-xs text-text-muted ml-2">유료 기한:</span>
                            <Button type="button" size="xs" variant="outline" onClick={() => api.setPaidUntil(m.id, plusDaysKey(30, m.paidUntil && m.paidUntil > today ? `${m.paidUntil}T12:00:00` : new Date()))}>+1달</Button>
                            {m.paidUntil && <Button type="button" size="xs" variant="ghost" onClick={() => api.setPaidUntil(m.id, null)}>없음으로 (가족)</Button>}
                        </div>
                    </>
                )}
            </Card>

            <StatRow>
                <Stat label="오늘 본 콜" value={todayCalls.length} />
                <Stat label="진행 중" value={activeCalls} tone={activeCalls ? 'ok' : undefined} />
                <Stat label="카카오 오늘 / 이달" value={`${usage.today} / ${usage.month}`} hint="길찾기 호출 수" />
                <Stat label="이상 기록" value={anomalies.length} tone={anomalies.length ? 'warn' : undefined} />
            </StatRow>

            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                <Card title="폰">
                    {m.phones.length === 0 && <p className="text-sm text-text-muted">연결된 폰이 없습니다</p>}
                    {m.phones.map(p => (
                        <div key={p.deviceId} className="flex items-center justify-between text-sm gap-2">
                            <div><span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> <b>{deviceLabel(p)}</b> <span className="text-text-muted">v{p.appVersion} · {p.mode === 'AUTO' ? '자동' : p.mode === 'ALARM' ? '알람' : '대기'}</span></div>
                            <div className="text-xs text-text-muted text-right">{p.status === 'ONLINE' ? fmtTime(p.lastSeenAt) : p.offlineReason ?? '끊김'}</div>
                        </div>
                    ))}
                </Card>
                <Card title="오늘 콜 (구간 · 요금 · 판정)">
                    {todayCalls.length === 0 && <p className="text-sm text-text-muted">오늘은 없습니다</p>}
                    {todayCalls.map(c => (
                        <div key={c.id} className="text-sm flex justify-between gap-2">
                            <span>{COLOR_DOT[c.verdict]} {c.pickup.place} → {c.dropoff.place}</span>
                            <span className="text-text-muted shrink-0">{fmtWon(c.fare)} · {statusKo(c.status)}</span>
                        </div>
                    ))}
                </Card>
                <Card title="이상 기록">
                    {anomalies.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {anomalies.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {TARGET_APP_LABEL[a.targetApp]} · {a.screen} — {a.reason}</div>)}
                </Card>
                <Card title="이 회원에 대한 기록">
                    {audit.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {a.action} <span className="text-text-muted">{a.detail}</span></div>)}
                </Card>
            </div>
        </>
    );
}
