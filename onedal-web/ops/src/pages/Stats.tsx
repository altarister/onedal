import { useState } from 'react';
import { TARGET_APP_LABEL, VERDICT_AXIS_LABEL, destinationPairs, flowsFromOrigin, hourHeat, isTargetApp, originsOf, type DestinationPair, type OpsStats, type RouteStat } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Table, fmtDateTime, fmtWon, type Column } from '../ui';

/**
 * 📊 **통계 — 세 질문** (reviews/33 4단계 · 서버 `GET /api/ops/stats` · 읽기만).
 *    ① 벌이가 어떤가 ② 어느 길이 돈이 되나 ③ 놓친 좋은 콜. 숫자는 «목록에 뜬 실물 콜»만이다 — 시뮬레이터 콜은 서버가 안 센다.
 *    합 · 평균 · 순서는 서버가 센 그대로 그린다(화면이 다시 세면 두 벌이 된다). 기간은 서버 기본(최근 28일) — 머리에 적는다.
 *    ① 은 서버 응답에 없다(잡은 콜에 시뮬레이터 콜과 실제 콜을 가를 칸이 없다) — «실제 콜이 생기면 채워집니다» 한 줄.
 *    ④ 어디로 · 몇 시에(reviews/36)는 서버 흐름 칸(flows · watched)을 shared flowViews 로 센다 — 출발지를 바꿀 때마다 화면이 고르므로 셈은 shared 한 벌.
 */
type Route = OpsStats['routes'][number];
type Dropped = OpsStats['dropped']['topFares'][number];

const EMPTY = '실제 콜이 생기면 채워집니다';
/** 노선 표는 서버가 준 순서(많은 순)의 앞 이만큼만 펴 둔다 — 나머지는 접어 ③ 칸이 아래로 밀리지 않게 */
const ROUTES_OPEN = 15;
const appOf = (app: string) => isTargetApp(app) ? TARGET_APP_LABEL[app] : app;
const axisOf = (axis: string) => VERDICT_AXIS_LABEL[axis] ?? axis;
const wonOrDash = (n: number | null) => n != null ? fmtWon(n) : '—';
const fareOf = (r: Route) => `${wonOrDash(r.fareFirstAvg)} / ${wonOrDash(r.fareLastAvg)}`;
const kmOf = (r: Route) => r.kmAvg != null ? `${r.kmAvg.toFixed(1)}km` : '—';

export default function Stats() {
    const { data: s, error, reload } = useOps(() => api.stats(), []);
    const routeCols: Column<Route>[] = [
        { key: 'route', label: '출발 → 도착', render: r => <b>{r.from} → {r.to}</b> },
        { key: 'n', label: '콜 수', render: r => r.calls },
        { key: 'fare', label: '평균 요금 (처음 / 마지막)', render: r => <>{fareOf(r)}{r.fareCalls < r.calls && <span className="text-xs text-text-muted"> · 요금 아는 콜 {r.fareCalls}</span>}</> },
        { key: 'km', label: '평균 거리', render: kmOf },
        { key: 'pass', label: '필터 통과', render: r => r.passed },
    ];
    const dropCols: Column<Dropped>[] = [
        { key: 'at', label: '뜬 시각', render: r => fmtDateTime(r.at) },
        { key: 'app', label: '배차망', render: r => appOf(r.targetApp) },
        { key: 'route', label: '상차 → 하차', render: r => `${r.pickup} → ${r.dropoff}` },
        { key: 'fare', label: '요금', render: r => <b>{fmtWon(r.fare)}</b> },
        { key: 'axis', label: '버린 까닭', render: r => axisOf(r.axis) },
    ];
    const d = s?.dropped;
    const routes = s?.routes ?? [];
    const routeKey = (r: Route) => `${r.from}|${r.to}`;
    const routeCard = (r: Route) => (
        <div className="space-y-1">
            <div className="flex justify-between gap-2"><span className="font-bold">{r.from} → {r.to}</span><span className="font-bold">{r.calls}콜</span></div>
            <KV k="평균 요금 (처음 / 마지막)" v={fareOf(r)} />
            <KV k="평균 거리 · 필터 통과" v={`${kmOf(r)} · ${r.passed}`} />
        </div>
    );
    return (
        <>
            <PageHeader title="통계" sub={s
                ? `목록에 뜬 콜 · 실물 배차망만 — ${s.sources.map(x => `${appOf(x.targetApp)} ${x.calls}`).join(' · ')} · ${s.from} ~ ${s.to}`
                : '목록에 뜬 콜 · 실물 배차망만'} />
            {error && <ErrorBand text={error} onRetry={reload} />}

            <Card title="① 벌이가 어떤가 — 기사가 일을 더 할지 · 쉴지">
                <p className="text-sm text-text-muted">{EMPTY}</p>
                <p className="text-xs text-text-muted mt-1">기사별 · 주별 · 달별 콜 수 · 매출 · 하루 평균 — 잡은 콜에서 시뮬레이터 콜과 실제 콜을 가를 수 있게 되면 셉니다.</p>
            </Card>

            {s && <FlowCard s={s} />}

            <Card title="② 어느 길이 돈이 되나 — 필터 목적지를 정하는 근거">
                <Table rows={routes.slice(0, ROUTES_OPEN)} columns={routeCols} rowKey={routeKey} empty={s ? EMPTY : '읽는 중…'} card={routeCard} />
                {routes.length > ROUTES_OPEN && (
                    <details className="mt-2">
                        <summary className="text-xs text-info cursor-pointer">나머지 {routes.length - ROUTES_OPEN}개 노선 보기</summary>
                        <div className="mt-2"><Table rows={routes.slice(ROUTES_OPEN)} columns={routeCols} rowKey={routeKey} card={routeCard} /></div>
                    </details>
                )}
            </Card>

            <Card title="③ 놓친 좋은 콜 — 필터가 너무 좁은가">
                {d && d.byAxis.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {d.byAxis.map(a => <span key={a.axis} className="rounded-full border border-border-card bg-surface-alt/40 px-2.5 py-1 text-xs">{axisOf(a.axis)} <b>{a.calls}</b></span>)}
                    </div>
                )}
                {d && <p className="text-xs text-text-muted mb-2">잠겨서 안 본 것 {d.locked} (버린 것이 아님) · 판정 없음 {d.unjudged}</p>}
                <Table rows={d?.topFares ?? []} columns={dropCols} rowKey={r => `${r.at}|${r.pickup}|${r.dropoff}|${r.fare}`} empty={s ? EMPTY : '읽는 중…'} card={r => (
                    <div className="space-y-1">
                        <div className="flex justify-between gap-2"><span className="font-bold">{r.pickup} → {r.dropoff}</span><span className="font-bold">{fmtWon(r.fare)}</span></div>
                        <KV k={`${appOf(r.targetApp)} · ${fmtDateTime(r.at)}`} v={axisOf(r.axis)} />
                    </div>
                )} />
                {d && d.topFares.length > 0 && <p className="text-xs text-text-muted mt-2">앱이 버린 콜 중 요금이 높은 순 — 같은 까닭이 여럿이면 그 필터가 좁은지 기사와 이야기합니다(필터는 기사가 관제웹에서 고칩니다).</p>}
            </Card>
        </>
    );
}

/** 🗓️ ③ 칸의 요일 차례 — 월요일부터 */
const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
/** 🎨 하루 평균 콜을 가장 많은 칸에 견준 진하기 넷 */
const heatTone = (v: number, max: number) => {
    const r = max ? v / max : 0;
    return r === 0 ? 'bg-surface-alt/40' : r < 0.34 ? 'bg-info/20' : r < 0.67 ? 'bg-info/50' : 'bg-info/80 text-white';
};

/**
 * 📊 **④ 어디로 · 몇 시에** (reviews/36) — 출발 시군구를 고르면 ① 어디로 가나 ② 목적지 후보(갈 콜 · 돌아올 콜) ③ 요일 × 시간.
 *    ① · ② 의 줄을 누르면 ③ 이 그 길로 바뀐다. 못 본 시간(그 시간에 폰이 콜을 한 건도 못 본 날만 있는 칸)은 «·» — 콜이 없었다는 뜻이 아니다.
 */
function FlowCard({ s }: { s: OpsStats }) {
    const origins = originsOf(s.flows);
    const [picked, setPicked] = useState<string | null>(null);
    const [to, setTo] = useState<string | null>(null);
    const origin = picked ?? origins[0]?.origin ?? null;
    if (!origin) return <Card title="④ 어디로 · 몇 시에 — 목적지를 고르는 근거"><p className="text-sm text-text-muted">{EMPTY}</p></Card>;

    const flows = flowsFromOrigin(s.flows, origin);
    const pairs = destinationPairs(s.flows, origin);
    const { cells: heat, hours, max } = hourHeat(s.flows, s.watched, origin, to ?? undefined);
    const at = (w: string, h: number) => heat.find(x => x.weekday === w && x.hour === h);
    const won = (n: number | null) => n != null ? fmtWon(n) : '—';
    const flowCols: Column<RouteStat>[] = [
        { key: 'to', label: '도착', render: r => <b>{r.to}</b> },
        { key: 'n', label: '콜 수', render: r => r.calls },
        { key: 'fare', label: '평균 요금', render: r => won(r.fareAvg) },
        { key: 'km', label: '평균 거리', render: r => r.kmAvg != null ? `${r.kmAvg}km` : '—' },
        { key: 'perKm', label: 'km당', render: r => won(r.perKm) },
    ];
    const pairCols: Column<DestinationPair>[] = [
        { key: 'place', label: '목적지 후보', render: p => <b>{p.place}</b> },
        { key: 'go', label: `갈 콜 (${origin} →)`, render: p => p.go },
        { key: 'back', label: `돌아올 콜 (→ ${origin})`, render: p => p.back },
        { key: 'pair', label: '왕복으로 이어질 수', render: p => <b>{p.pair}</b> },
    ];
    const pick = (o: string) => { setPicked(o); setTo(null); };

    return (
        <Card title="④ 어디로 · 몇 시에 — 목적지를 고르는 근거">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-text-muted">출발</span>
                <select value={origin} onChange={e => pick(e.target.value)} className="rounded-lg border border-border-card bg-surface px-3 py-1.5 text-sm">
                    {origins.map(o => <option key={o.origin} value={o.origin}>{o.origin} ({o.calls})</option>)}
                </select>
                <span className="text-xs text-text-muted">콜 흐름 표 · 실물만 · 기간 안에 묶인 날</span>
            </div>

            <h3 className="text-sm font-bold mt-3">① {origin}에서 어디로 가나</h3>
            <Table rows={flows.rows} columns={flowCols} rowKey={r => r.to} onRow={r => setTo(r.to)} card={r => (
                <div className="space-y-1" onClick={() => setTo(r.to)}>
                    <div className="flex justify-between gap-2"><span className="font-bold">→ {r.to}</span><span className="font-bold">{r.calls}콜</span></div>
                    <KV k="평균 요금 · 거리 · km당" v={`${won(r.fareAvg)} · ${r.kmAvg != null ? `${r.kmAvg}km` : '—'} · ${won(r.perKm)}`} />
                </div>
            )} />
            {flows.unresolved > 0 && <p className="text-xs text-text-muted mt-1">도착 시군구를 못 가린 콜 {flows.unresolved} / {flows.total} — 순위에 안 넣었다</p>}

            <h3 className="text-sm font-bold mt-3">② 목적지를 어디로 — 갈 콜과 돌아올 콜</h3>
            <Table rows={pairs} columns={pairCols} rowKey={p => p.place} onRow={p => setTo(p.place)} card={p => (
                <div className="space-y-1" onClick={() => setTo(p.place)}>
                    <div className="flex justify-between gap-2"><span className="font-bold">{p.place}</span><span className="font-bold">왕복 {p.pair}</span></div>
                    <KV k="갈 콜 · 돌아올 콜" v={`${p.go} · ${p.back}`} />
                </div>
            )} />
            <p className="text-xs text-text-muted mt-1">갈 콜만 많고 돌아올 콜이 없으면 빈 차로 돌아온다 — «왕복으로 이어질 수»(둘 중 적은 쪽) 순</p>

            <h3 className="text-sm font-bold mt-3">③ 몇 시에 — {origin} → {to ?? '전체'} · 본 날 하루 평균 콜{to && <button className="ml-2 text-xs text-info" onClick={() => setTo(null)}>전체로</button>}</h3>
            {hours.length === 0 ? <p className="text-sm text-text-muted">{EMPTY}</p> : (
                <div className="overflow-x-auto">
                    <table className="text-xs border-separate border-spacing-0.5">
                        <thead><tr><th />{hours.map(h => <th key={h} className="font-normal text-text-muted px-1">{h}</th>)}</tr></thead>
                        <tbody>{WEEK.map(w => (
                            <tr key={w}><th className="font-normal text-text-muted pr-1">{w}</th>{hours.map(h => {
                                const c = at(w, h);
                                return <td key={h} title={c ? `${w} ${h}시 · 본 날 ${c.days} · 콜 ${c.calls}` : `${w} ${h}시 · 못 봄`}
                                    className={`min-w-7 h-7 text-center rounded ${c ? heatTone(c.perDay, max) : 'text-text-muted'}`}>{c ? c.perDay : '·'}</td>;
                            })}</tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <p className="text-xs text-text-muted mt-1">«·» = 못 봄 — 그 시간에 폰이 콜을 한 건도 못 본 날뿐이다(콜이 없었다는 뜻이 아니다) · 숫자 = 콜 ÷ 그 시간에 콜을 본 날 수</p>
        </Card>
    );
}
