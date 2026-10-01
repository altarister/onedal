import { Link, useParams } from 'react-router-dom';
import { CONTENT_KINDS, TARGET_APP_LABEL, deviceLabel, type OpsAgreement } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { api, useOps, write } from '../api/ops';
import { COLOR_DOT, Card, ErrorBand, PageHeader, Stat, StatRow, StatusBadge, allowText, fmtTime, fmtWon, statusKo } from '../ui';

/**
 * 👤 회원 한 명 — 사실 칸 · 폰 · 오늘 콜 · 이상 기록 · 동의 기록 · 카카오 사용량 · 이 회원에 대한 기록. 열람은 서버가 기록에 남긴다(«회원 봄»).
 *    허락(자동 잡기 · 통계) · 유료 기한은 6단계 — 버튼은 자리만(눌리지 않는다). 통화 도우미 칸은 5단계.
 */
const CONTENT_TITLE: Record<string, string> = { terms: '이용약관', privacy: '개인정보 처리방침', location: '위치정보 약관', joinGuide: '가입 안내', installGuide: '설치 안내', withdrawGuide: '탈퇴 안내', ack: '고지 확인' };
const ACK_TITLE: Record<string, string> = { thirdParty: '제3자 정보 고지', networkRisk: '배차망 제재 위험 고지' };
const agreementText = (a: OpsAgreement) => a.kind === 'ack' ? (ACK_TITLE[a.item ?? ''] ?? a.item ?? '고지') : `${CONTENT_TITLE[a.kind] ?? a.kind} ${a.version}판`;

export default function MemberDetail() {
    const { id = '' } = useParams();
    const { data, error, reload } = useOps(() => api.member(id), [id]);
    if (error) return <><PageHeader title="회원" sub={id} /><ErrorBand text={error} onRetry={reload} /></>;
    if (!data) return <PageHeader title="읽는 중…" sub={id} />;

    const m = data.member;
    const { todayCalls, anomalies, audit, agreements, kakaoUsage: usage } = data;
    const activeCalls = todayCalls.filter(c => c.status === 'ORDER_CONFIRMED').length;
    const alive = !m.withdrawnAt;
    const act = (go: () => Promise<unknown>) => void write(go, reload);

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
                </dl>
            </Card>

            <Card title="관리자가 하는 일 — 전부 기록에 남습니다">
                {!alive && <p className="text-sm text-text-muted">탈퇴한 회원입니다 — 더 할 일이 없습니다.</p>}
                {alive && (
                    <>
                        <div className="flex flex-wrap gap-2">
                            {!m.approvedAt && <Button type="button" size="sm" onClick={() => act(() => api.approve(m.id))}>승인</Button>}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="outline" onClick={() => { if (confirm(`진행 중 콜 ${activeCalls}건 — 끝나면 멈춥니다. 정지할까요?`)) act(() => api.suspend(m.id, true)); }}>정지 (끝난 뒤)</Button>
                            )}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="destructive" onClick={() => { if (confirm('⚠️ 즉시 정지하면 KEEP 한 콜의 안전취소가 멈추고 관제웹 연결이 끊깁니다. 계정 도용 같은 때만 쓰세요. 진행할까요?')) act(() => api.suspend(m.id, false)); }}>즉시 정지</Button>
                            )}
                            {m.suspendedAt && <Button type="button" size="sm" onClick={() => act(() => api.resume(m.id))}>정지 풀기</Button>}
                            <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm('탈퇴 처리는 되돌릴 수 없습니다. 폰 보고가 거절되고 관제웹 연결이 끊깁니다. 기록은 남습니다.')) act(() => api.withdraw(m.id)); }}>탈퇴 처리</Button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-border-card items-center">
                            <span className="text-xs text-text-muted">허락 · 유료 기한 — 6단계에서 켜집니다:</span>
                            <Button type="button" size="xs" variant="outline" disabled>자동 잡기 허락</Button>
                            <Button type="button" size="xs" variant="outline" disabled>통계 허락</Button>
                            <Button type="button" size="xs" variant="outline" disabled>유료 기한 +1달</Button>
                        </div>
                    </>
                )}
            </Card>

            <StatRow>
                <Stat label="오늘 본 콜" value={todayCalls.length} />
                <Stat label="진행 중" value={activeCalls} tone={activeCalls ? 'ok' : undefined} />
                <Stat label="카카오 오늘 / 이달" value={usage ? `${usage.today} / ${usage.month}` : '아직 안 셈'} hint="길찾기 호출 수 — 5단계" />
                <Stat label="이상 기록" value={anomalies.length} tone={anomalies.length ? 'warn' : undefined} />
            </StatRow>

            <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                <Card title="폰 — 배차망 폰만 보입니다 (관제앱 폰은 서버가 세지 않습니다)">
                    {m.phones.length === 0 && <p className="text-sm text-text-muted">연결된 폰이 없습니다</p>}
                    {m.phones.map(p => (
                        <div key={p.deviceId} className="flex items-center justify-between text-sm gap-2">
                            <div><span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> <b>{deviceLabel(p)}</b> <span className="text-text-muted">v{p.appVersion || '?'} · {p.mode === 'AUTO' ? '자동' : p.mode === 'ALARM' ? '알람' : '대기'}</span></div>
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
                <Card title="동의 기록 — 글 판 · 고지 확인">
                    {agreements.length === 0 && <p className="text-sm text-text-muted">없습니다 (가입 전)</p>}
                    {[...agreements].sort((a, b) => CONTENT_KINDS.indexOf(a.kind as never) - CONTENT_KINDS.indexOf(b.kind as never)).map((a, i) => (
                        <div key={i} className="text-sm flex justify-between gap-2"><span>{agreementText(a)}</span><span className="text-text-muted shrink-0">{fmtTime(a.at)}</span></div>
                    ))}
                </Card>
                <Card title="이상 기록">
                    {anomalies.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {anomalies.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {TARGET_APP_LABEL[a.targetApp]} · {a.screen} — {a.reason}</div>)}
                </Card>
                <Card title="이 회원에 대한 기록">
                    {audit.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {audit.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {a.action} <span className="text-text-muted">{a.detail}</span></div>)}
                </Card>
            </div>
        </>
    );
}
