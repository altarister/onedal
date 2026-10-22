import { useState } from 'react';
import { createPortal } from 'react-dom';
import { hhmmText } from '@onedal/shared';
import type { SecuredOrder, StepViewRow, RouteTimelineEntry } from '@onedal/shared';
import StepSummary from './StepSummary';
import StepEditPopup from './StepEditPopup';
import StepSwipeTrack from './StepSwipeTrack';
import { stepDoneOf, stepViewOf, stepPaneOf } from './callCardViews';
import { logRoadmapEvent } from '../../lib/roadmapLogger';

/**
 * 🌱 **6단계 트랙** — 펼친 콜 카드(`PinnedRouteCard`)의 «스텝 영역»: 머리(단계명 · 점 · n/6) · 상태 줄 · 한 장씩 넘기는 장.
 * 카드 장은 **보기만**(`StepSummary` — 글자 · 바로 저장 단추) · 고치기는 «통화 · 이슈 · 수정»이 여는 **수정 팝업**(`StepEditPopup` — 시트 그대로).
 * 이 파일은 위(`PinnedRouteCard`)를 가져오지 않는다 — 방향: PinnedRouteCard → CallStepTrack → callCardViews · StepSheetMock.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 단계 행(`steps-synced`) · 보여 줄 단계는 카드가 쥐고 넘기며,
 *    단계를 넘기는 손은 `onNav` 로 카드에 돌려준다(카드가 «누가 열었나»를 로그에 적는다). 저장은 카드 장 · 팝업 시트가 같은 보내기(`send…` — StepSheetMock)로 보낸다.
 */
export default function CallStepTrack({ route, timeline, seededSteps, shownStepIdx, stepCurIdx, stepNav, onNav }: {
    route: SecuredOrder;
    timeline?: RouteTimelineEntry[];
    seededSteps: StepViewRow[] | null;
    shownStepIdx: number;
    stepCurIdx: number;
    stepNav: number | null;
    onNav: (idx: number | null, by: '손으로 넘긴 것' | '되돌린 것') => void;
}) {
    /** ✏️ 수정 팝업을 연 칸 — 없으면 닫힘 */
    const [editIdx, setEditIdx] = useState<number | null>(null);
    /* 📏 사슬 — 여기가 auto 면 아래 트랙이 내용대로 자란다 */
    /* 📏 **여기가 스텝 영역이다** — 남는 자리를 먹되 **220px 은 지킨다**
        (목업). 자리가 모자라면 위 덩어리가 스크롤하고, 스텝은 제 몫을 지킨다 */
    return (
        <div className={`mt-1 mb-2 flex-1 min-h-[220px] flex flex-col`}>
            {/* KEEP 이 만든다 (기사님) — 여기는 보기만. 이 기능 전에 잡은 콜은 행이 없다 */}
            {!seededSteps && (
                <div className="text-[10px] text-text-muted">아직 없습니다 — KEEP 하면 만들어집니다</div>
            )}
            {/* 🌱 **네비게이션 모양** (기사님: *"새로 영역이 길어지면 스크롤 해야
                하니 처음 UI 가 더 좋다"*) — 아코디언을 접고, 기존 카드와 **같은 문법**으로:
                진행 막대(누르면 그 단계) + 시트는 **한 번에 하나**. 시퀀스가 데려간다. */}
            {seededSteps && (() => {
                /* 🔴 위에서 만든 값을 그대로 쓴다 — 두 벌이면 로그와 화면이 다른 말을 한다 (규칙 ③) */
                const shownIdx = shownStepIdx;
                const sv = seededSteps[shownIdx];
                if (!sv) return null;
                const r = sv.row || {};
                const born = sv.born !== false;
                const allDone = seededSteps.every(stepDoneOf);
                return (
                    <div className={`mt-1 flex-1 min-h-0 flex flex-col`}
                         onClick={e => e.stopPropagation()}>
                        {/**
                          * 🌱 **머리 — 단계명 · 가운데 점 · n/6**.
                          * 🔴 **점은 가운데 고정** (기사님: *"단어에 따라
                          *    스와이프 네비게이션이 덜컹거려"*). 단계 이름 길이가 달라
                          *    («상차지 통화» ↔ «상차 완료») 점이 좌우로 밀린다 —
                          *    양옆을 `1fr` 로 같게 잡으면 제자리다.
                          * 🔴 «몇 번째»를 **숫자로도** 적는다 — 점만으로는 세어야 한다.
                          */}
                        {/* 🌱 **머리 한 줄** — 점 막대 · «n/6 단계명» · 상태 꼬리표(지금 할 것 · 마쳤습니다 · 건너뜀 · 아직).
                            점은 누르면 그 단계로 넘어간다 · 점의 aria 이름은 폰 시험이 찾는 자리다 */}
                        <div className="flex items-center gap-2 py-1">
                            <span className="flex gap-1 shrink-0">
                                {seededSteps.map((x, i) => (
                                    <button key={x.step} type="button" title={x.label} aria-label={x.label}
                                        onClick={() => onNav(i === stepCurIdx ? null : i, '손으로 넘긴 것')}
                                        className={`w-4 h-2 rounded-full transition-colors ${
                                            i === shownIdx ? 'bg-info'
                                            : x.row?.status === 'SKIPPED' ? 'bg-warning/70'
                                            : stepDoneOf(x) ? 'bg-success'
                                            : i < stepCurIdx ? 'bg-warning/40'   /* 지나쳤는데 안 함 — 빠뜨림이 보인다 */
                                            : 'bg-surface-hover'
                                        }`} />
                                ))}
                            </span>
                            <span className="min-w-0 truncate text-[14px] font-black text-text-primary tabular-nums">{shownIdx + 1}/{seededSteps.length} {sv.label}</span>
                            <em className={`ml-auto shrink-0 not-italic px-1.5 py-0.5 rounded-[5px] text-[11px] font-black border ${
                                !born ? 'border-border-card text-text-muted'
                                : r.status === 'DONE' ? 'bg-success/12 border-success/40 text-success'
                                : r.status === 'SKIPPED' ? 'bg-warning/12 border-warning/40 text-warning'
                                : shownIdx === stepCurIdx ? 'bg-info/15 border-info/50 text-info'
                                : 'border-border-card text-text-muted'
                            }`}>
                                {!born ? '아직' : r.status === 'DONE' ? `마쳤습니다${r.occurred_at ? ` ${hhmmText(r.occurred_at)}` : ''}` : r.status === 'SKIPPED' ? '건너뜀' : shownIdx === stepCurIdx ? '지금 할 것' : '아직'}
                            </em>
                        </div>
                        {(allDone || (stepNav !== null && stepNav !== stepCurIdx)) && (
                            <div className="flex items-center gap-2 text-[11px] pb-1">
                                {stepNav !== null && stepNav !== stepCurIdx && (
                                    <button type="button" onClick={() => onNav(null, '되돌린 것')}
                                        className="text-text-muted underline underline-offset-2 text-[11px]">
                                        되돌아보는 중 · 현재 단계로</button>
                                )}
                                {allDone && <span className="text-success text-[11px] font-bold">운행 완료 · 6단계를 모두 마쳤습니다</span>}
                            </div>
                        )}
                        {/**
                          * 🌱 **가로 트랙 — 한 장씩 넘긴다.**
                          * ⚠️ «한 번에 하나»(기사님 확정)는 그대로다 — 스와이프로도 넘긴다.
                          */}
                        <StepSwipeTrack
                            count={seededSteps.length}
                            shownIdx={shownIdx}
                            onShow={k => onNav(k === stepCurIdx ? null : k, '손으로 넘긴 것')}
                            renderPane={(k) => {
                                const x = seededSteps[k];
                                /* 헤더·문장 재료 — 행에 없는 값(장소·전화·구간 주행)은 경로·타임라인이 준다 (`stepPaneOf`) */
                                const pane = stepPaneOf({ route, step: x, seededSteps, timeline });
                                return (
                                    <section key={x.step} aria-label={x.label}
                                        className="shrink-0 w-full min-w-0 snap-center overflow-y-auto pr-0.5">
                                        <StepSummary key={pane.key} orderId={route.id}
                                            codAmount={pane.codAmount}
                                            view={stepViewOf(x, seededSteps)}
                                            hideButtons={editIdx !== null}
                                            onOpen={() => { logRoadmapEvent('화면', '웹', `✏️ [단계 수정 팝업 열림] ${route.id.slice(-6)} ${x.label}`); setEditIdx(k); }} />
                                    </section>
                                );
                            }} />
                        {/* ✏️ 수정 팝업 — 시트 서랍(움직이는 층) 밖, 문서 맨 위층에 그린다(덮는 창이 서랍 안에 갇히지 않게) */}
                        {editIdx !== null && createPortal(
                            <StepEditPopup route={route} seededSteps={seededSteps} timeline={timeline} startIdx={editIdx}
                                onClose={(why) => { logRoadmapEvent('화면', '웹', `✏️ [단계 수정 팝업 닫힘] ${route.id.slice(-6)} ${seededSteps[editIdx]?.label ?? ''} — ${why}`); setEditIdx(null); }} />,
                            document.body)}
                    </div>
                );
            })()}
        </div>
    );
}
