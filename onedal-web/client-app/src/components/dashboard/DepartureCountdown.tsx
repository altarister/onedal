import { useEffect, useState } from 'react';
import {
    deriveCallStep, remainingToStop, dwellMinutes, unitPoints,
    defaultDropoffDeadline, derivePickupDeadline, departureDeadline,
    minutesUntil, formatCountdown,
} from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';
import type { CallRecords } from '../../hooks/useCallProgress';
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
}

export default function DepartureCountdown({ orders, records }: Props) {
    // 카운트다운이므로 초 단위로 다시 그린다. 화면에 이것 하나뿐이라 부담이 없다
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    /** 아직 상차하지 않은 콜 중 **가장 먼저 나가야 하는** 것을 찾는다 */
    let soonest: { at: string; order: SecuredOrder; estimated: boolean } | null = null;

    for (const o of orders) {
        const r = records.get(o.id) ?? EMPTY_RECORDS;
        const p = deriveCallStep(r.milestones, r.reports);
        // 이미 상차했으면 출발을 기다릴 이유가 없다 (그 콜은 우회 예산 쪽이다)
        if (p.index >= 4) continue;

        const has = (m: string) => r.milestones.some(x => x.milestone === m);
        const soloKm = o.osrmSoloDistanceKm ?? o.kakaoSoloDistanceKm;
        const soloMin = o.osrmSoloDistanceKm ? o.osrmSoloDurationMin : o.kakaoSoloDurationMin;
        const pickupCargo = r.reports.find(x => x.stopType === 'pickup' && x.kind === 'ACTUAL')
                         ?? r.reports.find(x => x.stopType === 'pickup' && x.kind === 'DECLARED');
        const pickupDwell = dwellMinutes(pickupCargo?.handling, unitPoints(pickupCargo?.unit, pickupCargo?.quantity));

        const lead = remainingToStop({
            stop: 'pickup',
            approachMinutes: o.approachDurationMin,
            approachKm: o.totalDistanceKm != null && soloKm != null
                ? Math.max(0, Number(o.totalDistanceKm) - Number(soloKm)) : null,
            soloMinutes: soloMin,
            soloKm: soloKm != null ? Number(soloKm) : null,
            pickupDwellMinutes: pickupDwell,
            arrivedPickup: has('ARRIVED_PICKUP'),
            pickedUp: has('PICKED_UP'),
            arrivedDropoff: has('ARRIVED_DROPOFF'),
        });
        if (lead.driveMinutes == null) continue;   // 현위치를 모르면 셀 수 없다

        // 통화로 정한 상차 마감이 있으면 그것이 진실이다
        const declaredPickup = r.reports.find(x => x.stopType === 'pickup' && x.kind === 'DECLARED')?.deadlineAt;

        let pickupDeadline = declaredPickup ?? null;
        let estimated = false;
        if (!pickupDeadline) {
            // 두 원칙으로 역산한다 — 통화 전에도 대기 예산이 있어야 사냥을 판단할 수 있다
            const dropDeclared = r.reports.find(x => x.stopType === 'dropoff' && x.kind === 'DECLARED')?.deadlineAt;
            const dropoffDwell = dwellMinutes(pickupCargo?.handling, unitPoints(pickupCargo?.unit, pickupCargo?.quantity));
            const dropDeadline = dropDeclared
                ?? defaultDropoffDeadline(now, lead.driveMinutes + pickupDwell + (soloMin ?? 0));
            pickupDeadline = derivePickupDeadline(dropDeadline, soloMin, dropoffDwell);
            estimated = true;
        }

        const dep = departureDeadline(pickupDeadline, lead.driveMinutes);
        if (!dep) continue;
        if (!soonest || new Date(dep).getTime() < new Date(soonest.at).getTime()) {
            soonest = { at: dep, order: o, estimated };
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
                    </span>
                </div>
                <div className="text-[11px] text-text-muted break-keep">
                    {late
                        ? '지금 출발해도 상차 약속보다 늦습니다 — 상차지에 알리세요'
                        : `그 사이 여기서 콜을 더 잡을 수 있습니다`}
                    {soonest.estimated && (
                        <span className="ml-1 opacity-80">· 통화 전이라 <b>추정</b>입니다 (일과 17시 · 이동 제외 2시간)</span>
                    )}
                </div>
            </div>
        </div>
    );
}
