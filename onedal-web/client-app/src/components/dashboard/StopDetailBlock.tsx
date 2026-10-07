import type { SecuredOrder, RouteTimelineEntry, CallTiming } from '@onedal/shared';
import { stopDetailRowsOf } from './callCardViews';

/* 🧭 펼친 콜 카드(`PinnedRouteCard`)의 상 · 하차 줄.
   이 파일은 위(`PinnedRouteCard`)를 가져오지 않는다 — 방향: PinnedRouteCard → StopDetailBlock → callCardViews.
   바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 줄의 값은 `stopDetailRowsOf` 가 내고, 여기는 그리기만 한다. */

/**
 * 🧭 **펼친 카드의 상·하차 줄 — 타이틀이 못 하는 말만 한다**
 *    (기사님: *"목업에서 열리면 보이는 컨텐츠 상하차 부분은
 *    가지고 가서 기존 거에 더하고 싶어"*).
 *
 * 🔴 **약속·차이만 적는 줄(`PromiseLines`)은 두지 않는다** — 그것은 *"타이틀과 중복"* 이다 (기사님).
 *    이 줄은 그와 달라 철거 대상이 아니다 — **타이틀에 없는 둘**을 든다:
 *      · **구간 거리·분** — 그 정거장으로 들어오는 구간 (내 위치→상차 · 상차→하차)
 *      · **밀린 분** — 접힌 줄은 `▲▼` **기호로만** 말한다 (안 C). 몇 분인지는 여기에만 있다
 *    `timeDisplay.test.ts` 가 그 둘을 «자격»으로 묻는다 — 그 둘 없이 약속·차이만 적으면 빨간불이다.
 *
 * ⚠️ **원인별 내역**(`└ 합짐2 경유 +7분`)은 이 줄에 아직 없다 — `shared` 의 `impactOfStop` 을
 *    이 줄은 아직 부르지 않는다.
 */
export default function StopDetailBlock({ route, timeline, visitOrder, timing, etas }: {
    route: SecuredOrder;
    timeline?: RouteTimelineEntry[];
    visitOrder?: { pickupIdx: number; dropoffIdx: number };
    timing: CallTiming;
    /** 🕐 타임라인이 없을 때의 도착 예정 — 타이틀이 쓰는 그 값(`etaMap` · 장부 폴백) */
    etas: { pickupEta?: string; dropoffEta?: string };
}) {
    const rows = stopDetailRowsOf({ route, timeline, visitOrder, timing, etas });

    return (
        <div className="flex flex-col gap-0.5 text-[11px] tabular-nums mb-2 px-0.5">
            {rows.map(r => {
                return (
                    <div key={r.stopType} className="flex flex-col">
                        <div className="flex justify-between gap-1 font-bold">
                            <span className="min-w-0 truncate">
                                {r.seq ?? '?'} {r.kind} · {r.name}
                                <span className="font-normal text-text-muted">
                                    {' '}{r.legKm != null ? `${Number(r.legKm).toFixed(1)}km` : '--km'}
                                    ·{r.legMin != null ? `${r.legMin}분` : '--분'}
                                </span>
                            </span>
                            <span className="shrink-0">
                                <span className={r.promiseConfirmed ? 'text-accent-alt' : 'text-text-muted'}>
                                    {r.promisedText}
                                </span>
                                <span className="text-text-muted"> → </span>
                                <b className={r.late > 0 ? 'text-warning' : 'text-success'}>{r.real ?? '--:--'}</b>
                                {r.arrived && <span className="text-success text-[9.5px]"> 통과</span>}
                                {r.late > 0 && <b className="text-warning"> ⚠️{r.late}분</b>}
                            </span>
                        </div>
                        {r.shiftMin !== 0 && (
                            <div className="pl-2 flex justify-between gap-1 text-[10px] text-text-muted">
                                <span>└ 앞 정거장이 예측과 달라</span>
                                <span className={r.shiftMin > 0 ? 'text-warning' : 'text-success'}>
                                    {r.shiftMin > 0 ? `+${r.shiftMin}분 밀림` : `${r.shiftMin}분 당겨짐`}
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
