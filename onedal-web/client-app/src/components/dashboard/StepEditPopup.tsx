import { useEffect, useRef, useState } from 'react';
import { manwonText } from '@onedal/shared';
import type { SecuredOrder, StepViewRow, RouteTimelineEntry } from '@onedal/shared';
import StepSheetMock from './StepSheetMock';
import StepSwipeTrack from './StepSwipeTrack';
import { stepViewOf, stepPaneOf, popupCloseReasonOf, type StepPopupWatch } from './callCardViews';
import { useStepDraftStore } from '../../stores/stepDraftStore';
import { useGpsFocusStore } from '../../stores/gpsFocusStore';

/**
 * ✏️ **단계 수정 팝업 — 카드에서 «통화 · 이슈 · 수정»을 누르면 화면을 덮는다** (기사님 «가»).
 * 안은 카드에 있던 단계 시트(`StepSheetMock`)를 그대로 — 누른 칸에서 열리고 좌우로 넘겨 다른 칸도 고친다.
 * 닫힘: ✕ · 팝업 안 저장(그 콜 칸의 상태 · 일어난 시각이 바뀜) · 새 콜 심사 · 도착 감지(`popupCloseReasonOf`).
 * 저장 없이 닫혀도 적던 것은 `stepDraftStore` 에 남아, 다시 열면 이어서 고친다.
 * 바깥 일: 없음 — 저장은 시트가 소켓으로 보내고, 닫힘 신호는 저장소 둘을 읽기만 한다.
 */
export default function StepEditPopup({ route, seededSteps, timeline, startIdx, onClose }: {
    route: SecuredOrder;
    seededSteps: StepViewRow[];
    timeline?: RouteTimelineEntry[];
    startIdx: number;
    onClose: (why: string) => void;
}) {
    const [idx, setIdx] = useState(startIdx);
    const interrupt = useStepDraftStore(s => s.interruptTick);
    const arrivalTick = useGpsFocusStore(s => s.arrival?.tick ?? null);
    /* 여섯 칸의 상태 · 일어난 시각 — 팝업 안 어느 칸에서 저장해도 닫힌다(정차 배지 · 착불은 이 둘을 안 바꾼다) */
    const watchNow: StepPopupWatch = {
        interrupt, arrivalTick,
        status: seededSteps.map(x => x.row?.status ?? '').join(','),
        occurredAt: seededSteps.map(x => x.row?.occurred_at ?? '').join(','),
    };
    const atOpen = useRef(watchNow);
    useEffect(() => {
        const why = popupCloseReasonOf(atOpen.current, watchNow);
        if (why) onClose(why);
    }, [watchNow.interrupt, watchNow.arrivalTick, watchNow.status, watchNow.occurredAt]);

    const x = seededSteps[idx];
    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-background text-text-primary" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-surface">
                <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-black truncate">{route.pickup} → {route.dropoff}</div>
                    <div className="text-[12px] text-text-muted">{idx + 1}/{seededSteps.length} · {x?.label}</div>
                </div>
                {route.fare != null && <div className="text-[16px] font-black text-success">{manwonText(route.fare)}</div>}
                <button type="button" aria-label="닫기" onClick={() => onClose('닫기')}
                    className="shrink-0 w-10 h-10 rounded-full border border-border text-[18px] font-black text-text-muted">✕</button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col px-3 py-2">
                <StepSwipeTrack
                    count={seededSteps.length}
                    shownIdx={idx}
                    onShow={setIdx}
                    renderPane={(k) => {
                        const s = seededSteps[k];
                        const pane = stepPaneOf({ route, step: s, seededSteps, timeline });
                        return (
                            <section key={s.step} aria-label={s.label} className="shrink-0 w-full min-w-0 snap-center overflow-y-auto pr-0.5">
                                <h3 className="mb-1.5 text-[15px] font-black">{k + 1}. {s.label}</h3>
                                <StepSheetMock key={pane.key} orderId={route.id}
                                    codAmount={pane.codAmount}
                                    place={pane.place}
                                    prevName={pane.prevName}
                                    leadMinutes={pane.leadMinutes}
                                    departPrevMs={pane.departPrevMs}
                                    segmentDriveMinutes={pane.segmentDriveMinutes}
                                    view={stepViewOf(s, seededSteps)} />
                            </section>
                        );
                    }} />
            </div>
        </div>
    );
}
