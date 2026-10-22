import type { SecuredOrder, RouteTimelineEntry, CallTiming, StepViewRow } from '@onedal/shared';
import { stopBlocksOf } from './callCardViews';
import { telHref } from '../../lib/routeUtils';
import { callNow } from '../../lib/phoneCall';

/* 🧭 펼친 콜 카드(`PinnedRouteCard`)의 상 · 하차 덩어리.
   이 파일은 위(`PinnedRouteCard`)를 가져오지 않는다 — 방향: PinnedRouteCard → StopDetailBlock → callCardViews.
   바깥 일: 전화 걸기(`callNow`) 하나 — 덩어리의 값은 `stopBlocksOf` 가 내고, 여기는 그리기만 한다. */

/**
 * 🧭 **정거장 덩어리 — 누르면 그곳에 전화** (기사님: *"전화 모양의 버튼을 지워 버리고, 상차 덩어리,
 *    하차 덩어리를 클릭하면 전화 할수 있도록"*).
 *
 * 🔴 **약속·차이만 적는 줄(`PromiseLines`)은 두지 않는다** — 그것은 *"타이틀과 중복"* 이라 철거했다 (기사님).
 *    이 덩어리는 타이틀에 없는 것을 든다: 이름 · 전체 주소 · 여유(약속 − 예상) · 하차 마감 · 전화.
 *    구간 km · 분과 밀린 분은 여기 없다 — 덱 요약 줄과 단계 서랍 칩이 말한다.
 * 🔴 약속이 통화로 안 굳었으면 «~»(통화 전 추정 — 버퍼 칩과 같은 표시) · 번호가 없으면 단추가 아니다(«번호 없음»).
 *    지난 정거장도 전화는 걸린다(되묻는 전화) — 흐리게만 한다. 걸기는 손을 뗄 때(onClick) 하나다.
 */
export default function StopDetailBlock({ route, timeline, visitOrder, timing, etas, seededSteps }: {
    route: SecuredOrder;
    timeline?: RouteTimelineEntry[];
    visitOrder?: { pickupIdx: number; dropoffIdx: number };
    timing: CallTiming;
    /** 🕐 타임라인이 없을 때의 도착 예정 — 타이틀이 쓰는 그 값(`etaMap` · 장부 폴백) */
    etas: { pickupEta?: string; dropoffEta?: string };
    /** 통화 칸이 굳었나(약속의 «~») — 단계 행이 아직 안 왔으면 null */
    seededSteps: StepViewRow[] | null;
}) {
    const blocks = stopBlocksOf({ route, timeline, visitOrder, timing, etas, seededSteps });

    return (
        <div className="rounded-lg border border-border-card px-2.5 tabular-nums">
            {blocks.map(b => {
                const body = (
                    <>
                        <div className="flex items-center gap-1.5 text-[15px] font-black">
                            <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black text-white ${b.stopType === 'pickup' ? 'bg-danger' : 'bg-info'}`}>{b.seq ?? '?'}</span>
                            <span className="min-w-0 truncate">{b.kind} · {b.name}</span>
                            {b.arrived && <span className="ml-auto shrink-0 text-[11px] font-bold text-success">통과</span>}
                            {!b.arrived && b.late > 0 && <span className="ml-auto shrink-0 text-[11px] font-bold text-warning">⚠️{b.late}분 늦음</span>}
                        </div>
                        <div className="text-[12.5px] text-text-primary/85 break-keep leading-snug">{b.address}</div>
                        <div className="text-[12.5px] text-text-muted">
                            약속 {b.promiseFirm ? '' : '~'}{b.promisedText}
                            {b.etaText && <> · 예상 <b className={b.late > 0 ? 'text-warning' : 'text-success'}>{b.etaText}</b></>}
                            {b.slackMin != null && (
                                <span className={b.slackMin >= 0 ? 'text-success' : 'text-danger'}>
                                    {' '}({b.slackMin >= 0 ? `${b.slackMin}분 여유` : `${-b.slackMin}분 늦음`})
                                </span>
                            )}
                            {b.deadlineText && <> · 마감 <span className="text-danger">{b.deadlineText}</span></>}
                            {!b.phone && <> · 번호 없음</>}
                        </div>
                    </>
                );
                const box = `w-full text-left flex flex-col gap-0.5 py-2 border-b border-border/60 last:border-0 ${b.arrived ? 'opacity-60' : ''}`;
                return b.phone ? (
                    <a key={b.stopType} href={telHref(b.phone)} aria-label={`${b.kind} ${b.name} 전화`}
                        onClick={e => { e.stopPropagation(); e.preventDefault(); callNow(b.phone!); }}
                        className={`${box} rounded-md active:bg-success/10`}>{body}</a>
                ) : (
                    <div key={b.stopType} className={box}>{body}</div>
                );
            })}
        </div>
    );
}
