import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CONTENT_KINDS, TARGET_APP_LABEL, type OpsAgreement } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps, write } from '../api/ops';
import { allowState } from '../api/allowance';
import MemberPhoneFilter from './MemberPhoneFilter';
import { COLOR_DOT, Card, ErrorBand, PageHeader, Stat, StatRow, StatusBadge, fmtTime, fmtWon, statusKo, todayKey } from '../ui';

/**
 * 👤 회원 한 명 — 칸 다섯: 기본(사실 칸 · 관리자가 하는 일 · 숫자) · 폰 · 필터(`MemberPhoneFilter`) · 오늘 콜 · 동의 · 기록(이상 기록 · 이 회원에 대한 기록). 열람은 서버가 기록에 남긴다(«회원 봄»).
 *    허락(자동 잡기 · 통계) · 유료 기한은 서버 `/members/:id/allow` · `/paid-until` 에 적는다 — «지금 살아 있나»는 shared `allowanceLive`(`api/allowance.ts`) 하나. 날짜를 더하는 버튼은 없다(날은 달력 칸으로 고른다).
 */
const CONTENT_TITLE: Record<string, string> = { terms: '이용약관', privacy: '개인정보 처리방침', location: '위치정보 약관', joinGuide: '가입 안내', installGuide: '설치 안내', withdrawGuide: '탈퇴 안내', ack: '고지 확인' };
const ACK_TITLE: Record<string, string> = { thirdParty: '제3자 정보 고지', networkRisk: '배차망 제재 위험 고지' };
const agreementText = (a: OpsAgreement) => a.kind === 'ack' ? (ACK_TITLE[a.item ?? ''] ?? a.item ?? '고지') : `${CONTENT_TITLE[a.kind] ?? a.kind} ${a.version}판`;

/** 지난 날을 골랐으면 한 번 묻는다 — «YYYY-MM-DD» 글자 비교(날짜 계산 아님). 오늘 · 뒷날 · 비움은 그대로 통과 */
const pastOk = (until: string | null, today: string, ask: string) => !until || until >= today || confirm(ask);

/** 칸 — 주소(`?tab=`)에 남는다. «폰 · 필터»는 현황판에서 회원을 골라 보던 것(reviews/33) */
const TABS = [['basic', '기본'], ['phone', '폰 · 필터'], ['calls', '오늘 콜'], ['agree', '동의'], ['log', '기록']] as const;
type Tab = typeof TABS[number][0];
const PURPOSE = { ask: '이 사람은 지금 일하나? 폰은 살아 있나? 왜 콜을 안 잡았나?', can: '칸: 기본 · 폰 · 필터 · 오늘 콜 · 동의 · 기록' };

export default function MemberDetail() {
    const { id = '' } = useParams();
    const [params, setParams] = useSearchParams();
    const tab: Tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') as Tab : 'basic';
    const { data, error, reload } = useOps(() => api.member(id), [id]);
    if (error) return <><PageHeader title="회원" sub={id} purpose={PURPOSE} /><ErrorBand text={error} onRetry={reload} /></>;
    if (!data) return <PageHeader title="읽는 중…" sub={id} purpose={PURPOSE} />;

    const m = data.member;
    const { todayCalls, anomalies, audit, agreements, kakaoUsage: usage } = data;
    const activeCalls = todayCalls.filter(c => c.status === 'ORDER_CONFIRMED').length;
    const alive = !m.withdrawnAt;
    const act = (go: () => Promise<unknown>) => void write(go, reload);
    const today = todayKey();
    const auto = allowState(m.autoAllowedAt, m.autoUntil, today);
    const stats = allowState(m.statsAllowedAt, m.statsUntil, today);

    return (
        <>
            <PageHeader title={m.name} sub={`${m.email} · 가입 ${m.createdAt.slice(0, 10)}`} right={<><StatusBadge m={m} /><Button asChild variant="ghost" size="sm"><Link to="/members">← 목록</Link></Button></>} purpose={PURPOSE} />

            <div className="flex gap-2 flex-wrap">
                {TABS.map(([k, label]) => <Button key={k} type="button" size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => setParams(k === 'basic' ? {} : { tab: k })}>{label}</Button>)}
            </div>

            {tab === 'basic' && <>
            <Card title="사실 칸 — 화면의 «상태»는 이 칸들에서만 만든다">
                <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-text-muted">승인</dt><dd className="font-semibold">{fmtTime(m.approvedAt)}</dd>
                    <dt className="text-text-muted">유료 기한</dt><dd className="font-semibold">{m.paidUntil ?? '없음'}</dd>
                    <dt className="text-text-muted">정지</dt><dd className="font-semibold">{m.suspendedAt ? `${fmtTime(m.suspendedAt)}${m.suspendAfterActive ? ' (끝난 뒤)' : ' (즉시)'}` : '—'}</dd>
                    <dt className="text-text-muted">탈퇴</dt><dd className="font-semibold">{fmtTime(m.withdrawnAt)}</dd>
                    <dt className="text-text-muted">자동 잡기</dt><dd className="font-semibold">{auto.text}{!auto.live && <span className="font-normal text-text-muted"> — 폰은 알람으로 돕니다</span>}</dd>
                    <dt className="text-text-muted">통계</dt><dd className="font-semibold">{stats.text}</dd>
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
                            {!m.approvedAt && <span className="text-xs text-text-muted self-center">승인하면 자동 잡기 · 통계 허락이 함께 켜집니다 — 알람만 쓰게 하려면 승인 뒤 «자동 잡기 끄기»</span>}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="outline" onClick={() => { if (confirm(`진행 중 콜 ${activeCalls}건 — 끝나면 멈춥니다. 정지할까요?`)) act(() => api.suspend(m.id, true)); }}>정지 (끝난 뒤)</Button>
                            )}
                            {!m.suspendedAt && m.approvedAt && (
                                <Button type="button" size="sm" variant="destructive" onClick={() => { if (confirm('⚠️ 즉시 정지하면 KEEP 한 콜의 안전취소가 멈추고 관제웹 연결이 끊깁니다. 계정 도용 같은 때만 쓰세요. 진행할까요?')) act(() => api.suspend(m.id, false)); }}>즉시 정지</Button>
                            )}
                            {m.suspendedAt && <Button type="button" size="sm" onClick={() => act(() => api.resume(m.id))}>정지 풀기</Button>}
                            <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm('탈퇴 처리는 되돌릴 수 없습니다. 폰 보고가 거절되고 관제웹 연결이 끊깁니다. 기록은 남습니다.')) act(() => api.withdraw(m.id)); }}>탈퇴 처리</Button>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-border-card">
                            <AllowRow label="자동 잡기" state={auto} until={m.autoUntil} offConfirm="자동 잡기를 끄면 이 회원 폰은 다음 보고부터 알람으로 돕니다. 끌까요?" onSet={(on, until) => { if (pastOk(until, today, '기한이 이미 지난 날입니다 — 적는 즉시 «기한 지남»이 됩니다. 그래도 적을까요?')) act(() => api.setAllow(m.id, 'auto', on, until)); }} />
                            <AllowRow label="통계" state={stats} until={m.statsUntil} onSet={(on, until) => { if (pastOk(until, today, '기한이 이미 지난 날입니다 — 적는 즉시 «기한 지남»이 됩니다. 그래도 적을까요?')) act(() => api.setAllow(m.id, 'stats', on, until)); }} />
                            <DayRow label="유료 기한" value={m.paidUntil} emptyLabel="없음으로 (가족)" onSet={until => { if (pastOk(until, today, '유료 기한이 이미 지난 날입니다 — 이 회원은 진행 중 콜이 끝나면 바로 막힙니다. 그래도 적을까요?')) act(() => api.setPaidUntil(m.id, until)); }} />
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
            </>}
            {tab === 'phone' && <MemberPhoneFilter memberId={m.id} />}
            {tab === 'calls' && (
                <Card title="오늘 콜 (구간 · 요금 · 판정)">
                    {todayCalls.length === 0 && <p className="text-sm text-text-muted">오늘은 없습니다</p>}
                    {todayCalls.map(c => (
                        <div key={c.id} className="text-sm flex justify-between gap-2">
                            <span>{COLOR_DOT[c.verdict]} {c.pickup.place} → {c.dropoff.place}</span>
                            <span className="text-text-muted shrink-0">{fmtWon(c.fare)} · {statusKo(c.status)}</span>
                        </div>
                    ))}
                </Card>
            )}
            {tab === 'agree' && (
                <Card title="동의 기록 — 글 판 · 고지 확인">
                    {agreements.length === 0 && <p className="text-sm text-text-muted">없습니다 (가입 전)</p>}
                    {[...agreements].sort((a, b) => CONTENT_KINDS.indexOf(a.kind as never) - CONTENT_KINDS.indexOf(b.kind as never)).map((a, i) => (
                        <div key={i} className="text-sm flex justify-between gap-2"><span>{agreementText(a)}</span><span className="text-text-muted shrink-0">{fmtTime(a.at)}</span></div>
                    ))}
                </Card>
            )}
            {tab === 'log' && (
                <div className="grid md:grid-cols-2 gap-3 md:gap-4">
                <Card title="이상 기록">
                    {anomalies.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {anomalies.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {TARGET_APP_LABEL[a.targetApp]} · {a.screen} — {a.reason}</div>)}
                </Card>
                <Card title="이 회원에 대한 기록">
                    {audit.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {audit.map(a => <div key={a.id} className="text-sm"><span className="text-text-muted">{fmtTime(a.at)}</span> {a.action} <span className="text-text-muted">{a.detail}</span></div>)}
                </Card>
                </div>
            )}
        </>
    );
}

/** 허락 한 줄 — [켜기/끄기] + 기한 날(달력 칸) + [기한 적기] + [기한 없애기]. 날짜를 더하지 않는다 */
function AllowRow({ label, state, until, offConfirm, onSet }: {
    label: string; state: { on: boolean; live: boolean; text: string }; until: string | null; offConfirm?: string; onSet: (on: boolean, until: string | null) => void;
}) {
    const [day, setDay] = useState('');
    return (
        <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="w-20 text-xs text-text-muted">{label}</span>
            <span className={`text-xs font-semibold ${state.live ? 'text-success' : 'text-text-muted'}`}>{state.text}</span>
            {state.on
                ? <Button type="button" size="xs" variant="outline" onClick={() => { if (!offConfirm || confirm(offConfirm)) onSet(false, null); }}>{label} 끄기</Button>
                : <Button type="button" size="xs" variant="outline" onClick={() => onSet(true, day || null)}>{label} 허락 ({day || '기한 없음'})</Button>}
            <Input type="date" value={day} onChange={e => setDay(e.target.value)} className="w-40 h-8" aria-label={`${label} 기한`} />
            {state.on && <Button type="button" size="xs" variant="ghost" disabled={!day} onClick={() => { onSet(true, day); setDay(''); }}>기한 적기</Button>}
            {state.on && until && <Button type="button" size="xs" variant="ghost" onClick={() => onSet(true, null)}>기한 없애기</Button>}
        </div>
    );
}

/** 날 한 칸 — 유료 기한. 달력 칸으로 고른 날을 그대로 적는다 */
function DayRow({ label, value, emptyLabel, onSet }: { label: string; value: string | null; emptyLabel: string; onSet: (until: string | null) => void }) {
    const [day, setDay] = useState('');
    return (
        <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="w-20 text-xs text-text-muted">{label}</span>
            <span className="text-xs font-semibold">{value ?? '없음'}</span>
            <Input type="date" value={day} onChange={e => setDay(e.target.value)} className="w-40 h-8" aria-label={label} />
            <Button type="button" size="xs" variant="outline" disabled={!day} onClick={() => { onSet(day); setDay(''); }}>적기</Button>
            {value && <Button type="button" size="xs" variant="ghost" onClick={() => onSet(null)}>{emptyLabel}</Button>}
        </div>
    );
}
