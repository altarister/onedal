import { TARGET_APP_LABEL, VERDICT_AXIS_LABEL, isTargetApp, type OpsStats } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Table, fmtDateTime, fmtWon, type Column } from '../ui';

/**
 * 📊 **통계 — 세 질문** (reviews/33 4단계 · 서버 `GET /api/ops/stats` · 읽기만).
 *    ① 벌이가 어떤가 ② 어느 길이 돈이 되나 ③ 놓친 좋은 콜. 숫자는 «목록에 뜬 실물 콜»만이다 — 시뮬레이터 콜은 서버가 안 센다.
 *    합 · 평균 · 순서는 서버가 센 그대로 그린다(화면이 다시 세면 두 벌이 된다). 기간은 서버 기본(최근 28일) — 머리에 적는다.
 *    ① 은 서버 응답에 없다(잡은 콜에 시뮬레이터 콜과 실제 콜을 가를 칸이 없다) — «실제 콜이 생기면 채워집니다» 한 줄.
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
