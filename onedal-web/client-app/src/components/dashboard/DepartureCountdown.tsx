import { useEffect, useState } from 'react';
import { deriveCallStep, deriveCallTiming, deriveRouteTimeline, pickBindingDeparture,
         minutesUntil, formatCountdown } from '@onedal/shared';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import type { CallRecords } from '../../hooks/useCallProgress';
import { getAddressLabel } from '../../lib/routeUtils';
import { EMPTY_RECORDS } from '../../hooks/useCallProgress';

/**
 * **최소 출발 시각까지 남은 시간**을 센다.
 *
 * 기사님: *"첫 콜을 잡았다면 **최소 출발 시간이 카운트다운**하면 좋을 듯하다."*
 * *"1번 콜의 상차지까지 30분 걸리고 도착시간에 30분을 더했다면 난 30분 후에 출발해도 되는 것이고,
 * 그 30분 동안 현 위치에서 콜을 더 잡는 거야. 그러면 최장거리로 단가가 높은 콜을
 * 잡을 확률을 높일 수 있을 거다."*
 *
 * 그 남은 시간이 곧 **대기 예산**이다 — 우회에 쓰는 시간과 목적이 다르다.
 * 우회 예산은 "돌아가도 되는 시간"이고, 대기 예산은 **"여기 서서 더 좋은 콜을 기다리는 시간"** 이다.
 *
 * ⚠️ 마감을 아직 통화로 안 정했으면 기사님의 두 원칙으로 **추정**한다
 *    (일과 17시 · 이동 제외 2시간). 추정이라는 것을 숨기지 않는다.
 */
interface Props {
    orders: SecuredOrder[];
    records: Map<string, CallRecords>;
    /** 🧭 서버가 내려준 경로 순서 — 있으면 타임라인이 카운트다운의 원천이 된다 */
    routeStops: RouteStopInfo[];
    routeComputedAt: string | null;
}

export default function DepartureCountdown({ orders, records, routeStops, routeComputedAt }: Props) {
    // 카운트다운이므로 초 단위로 다시 그린다. 화면에 이것 하나뿐이라 부담이 없다
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    /**
     * 아직 상차하지 않은 콜 중 **가장 먼저 나가야 하는** 것.
     *
     * 시간 파생은 `deriveCallTiming` 한 곳에서만 한다 — 예전에는 여기서
     * `PinnedRouteCard` 와 같은 계산(단독 구간 선택·접근 거리·상차 정차)을 복제했다.
     * 한쪽만 고치면 카운트다운과 통화 화면이 **다른 시각**을 말한다.
     */
    let soonest: { at: string; estimated: boolean;
                   driveMin: number | null; dwellMin: number; waitMin: number | null;
                   boundBy: string | null } | null = null;

    /**
     * 🧭 **경로 타임라인이 원천이다** (기사님 2026-08-19): *"어떤 콜이건 가장 빨리
     * 출발해야 하는 것 기준으로 노출되어야 한다."*
     *
     * 🔴 예전에는 콜별 deriveCallTiming 의 departureAt 만 모았는데, 합짐은 단독
     *    주행값이 없어 departureAt 이 null → **후보에서 조용히 빠졌다.** 첫짐 혼자
     *    남아 1:20:57 이 떴다. 타임라인은 경로 위에서 누적하므로 합짐도 들어온다.
     *    하차 약속도 출발을 묶는다 — 상차만 보지 않는다.
     */
    const reportsOf = (id: string) => (records.get(id) ?? EMPTY_RECORDS).reports;
    const milestonesOf = (id: string) => (records.get(id) ?? EMPTY_RECORDS).milestones;
    const timeline = deriveRouteTimeline(routeStops, orders, reportsOf, milestonesOf, now, routeComputedAt);
    const binding = pickBindingDeparture(timeline);
    if (binding) {
        const o = orders.find(x => x.id === binding.orderId);
        soonest = {
            at: new Date(binding.departByMs!).toISOString(),
            estimated: !binding.promiseConfirmed,
            driveMin: null, dwellMin: binding.dwellMinutes,
            waitMin: minutesUntil(new Date(binding.departByMs!).toISOString(), now),
            // 시각을 같이 적는다 — 상차지가 둘 다 "경안동"이면 이름만으로는 어느 약속인지 모른다
            boundBy: o ? `${getAddressLabel(binding.stopType === 'pickup' ? o.pickup : o.dropoff)} ${binding.stopType === 'pickup' ? '상차' : '하차'} ${binding.promisedUntil ? new Date(binding.promisedUntil).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`.trim() : null,
        };
    }

    // 폴백 — 경로 순서가 아직 없다 (옛 서버 · 연산 전/실패). 콜별 파생으로라도 센다
    if (!soonest) for (const o of orders) {
        const r = records.get(o.id) ?? EMPTY_RECORDS;
        // 이미 상차했으면 출발을 기다릴 이유가 없다 (그 콜은 우회 예산 쪽이다)
        if (deriveCallStep(r.milestones, r.reports).index >= 4) continue;

        const t = deriveCallTiming(o, r.reports, r.milestones, now);
        if (!t.departureAt) continue;
        if (!soonest || new Date(t.departureAt).getTime() < new Date((soonest as any).at).getTime()) {
            // 🔴 내역을 함께 담는다 — 기사님이 **왜 그 시각인지** 알아야 판단하실 수 있다
            soonest = { at: t.departureAt, estimated: t.deadlineEstimated,
                        driveMin: t.approachMinutes, dwellMin: t.pickupDwell, waitMin: t.waitMinutes,
                        boundBy: null };
        }
    }

    if (!soonest) return null;

    const left = minutesUntil(soonest.at, now)!;
    const text = formatCountdown(soonest.at, now)!;
    const late = left < 0;
    const tight = !late && left < 15;

    return (
        <div className={`mx-3 mt-3 rounded-xl border px-4 py-2.5 flex items-center gap-3 ${
            late ? 'border-danger/45 bg-danger/10'
            : tight ? 'border-warning/45 bg-warning/10'
            : 'border-info/40 bg-info/[0.07]'
        }`}>
            <span className="text-lg leading-none">{late ? '🚨' : tight ? '⏰' : '🕒'}</span>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                    <span className={`text-[20px] font-black tabular-nums ${
                        late ? 'text-danger' : tight ? 'text-warning' : 'text-info'
                    }`}>{text}</span>
                    <span className="text-[11px] font-bold text-text-primary">
                        {late ? '출발 시각이 지났습니다' : '뒤에는 출발해야 합니다'}
                        {/* 어느 약속이 출발을 묶는지 — 없으면 왜 이 시각인지 알 수 없다 */}
                        {soonest.boundBy && <span className="text-text-muted font-normal"> · {soonest.boundBy} 약속 기준</span>}
                    </span>
                </div>
                <div className="text-[11px] text-text-muted break-keep">
                    {late
                        ? '지금 출발해도 상차 약속보다 늦습니다 — 상차지에 알리세요'
                        : `그 사이 여기서 콜을 더 잡을 수 있습니다`}
                    {/* 🔴 내역을 적는다 (기사님 2026-08-16): `09:25까지 출발 (주행 20, 상차 15, 대기 25분)`.
                        상차 정차가 들어가는 이유 — **상차 마감은 "실어 보내는" 시각**이라
                        주행뿐 아니라 상차 시간까지 빼야 그 시각에 보낼 수 있다. */}
                    {soonest.driveMin != null && (
                        <span className="ml-1 opacity-80">
                            (주행 {soonest.driveMin}, 상차 {soonest.dwellMin}
                            {soonest.waitMin != null && !late && `, 대기 ${soonest.waitMin}`}분)
                        </span>
                    )}
                    {soonest.estimated && (
                        <span className="ml-1 opacity-80">· 통화 전이라 <b>추정</b>입니다 (잡은 시각 +1시간)</span>
                    )}
                </div>
            </div>
        </div>
    );
}
