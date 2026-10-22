import type { StepViewRow } from '@onedal/shared';
import { stepSummaryOf, type StepCardButton } from './callCardViews';
import { sendCallSave, sendArrive, sendSkip, sendDone, sendCod, actualCargoOf, cargoOfRow } from './StepSheetMock';
import { useStepDraftStore, draftKeyOf, draftFor, stepFactOf } from '../../stores/stepDraftStore';
import { useDerivation } from '../../stores/judgmentStore';

/**
 * 🪪 **카드 안 단계 한 장 — 보기만 한다** (기사님 «가»).
 * 칸의 값은 글자로, 단추는 «바로 저장»(스킵 · 도착 · 상차 완료 · 하차 완료 · 받았음 · 못 받음)과
 * «팝업 열기»(통화 · 이슈 · 수정)뿐이다. 칩 · 입력으로 고치는 일은 수정 팝업(`StepEditPopup`)의 시트가 한다.
 * 🔴 바로 저장은 팝업 시트와 **같은 보내기**(`send…` — StepSheetMock)를 쓴다 — 넣는 값은 «적던 것이 있으면 그것, 없으면 서버 값».
 * 바깥 일: 소켓 보내기(`send…` — StepSheetMock) — 저장의 답은 `steps-synced` 로 카드가 받는다.
 */
export default function StepSummary({ orderId, view, codAmount, hideButtons, onOpen }: {
    orderId: string;
    /** `stepViewOf` 로 짐을 빌려 입힌 단계 한 줄 */
    view: StepViewRow;
    codAmount?: number | null;
    /** 수정 팝업이 열려 있으면 카드 단추를 안 그린다 — 같은 글자 단추가 둘이면 덮인 쪽을 누를 수 있다 */
    hideButtons?: boolean;
    onOpen: () => void;
}) {
    const r: Record<string, any> = view.row ?? {};
    const key = draftKeyOf(orderId, view.step);
    const draft = useStepDraftStore(s => s.drafts[key]?.fact === stepFactOf(r));   // 사실이 바뀐 옛 초안은 «적다 만 것»이 아니다
    const { unk } = useDerivation();
    const s = stepSummaryOf(view, { codAmount, draft, unk });
    const born = view.born !== false;

    const press = (b: StepCardButton) => {
        if (b.popup) { onOpen(); return; }
        const d = draftFor(key, stepFactOf(r)) as Record<string, any> | null;
        const milestoneOf: Record<string, string> = { ARRIVE_PICKUP: 'ARRIVED_PICKUP', ARRIVE_DROPOFF: 'ARRIVED_DROPOFF', LOADED: 'PICKED_UP' };
        switch (b.kind) {
            case 'skip':
                if (view.step.startsWith('CALL_')) sendCallSave(orderId, view.step === 'CALL_PICKUP', 'SKIPPED',
                    { cargo: cargoOfRow(r), memo: r.memo ?? '', pick: { touched: false } });
                else sendSkip(orderId, milestoneOf[view.step]);
                return;
            case 'arrive':
                sendArrive(orderId, view.step, r, { reasons: d?.reasons ?? [], reasonMemo: d?.reasonMemo ?? '' });
                return;
            case 'loaded':
            case 'delivered':
                sendDone(orderId, view.step, r,
                    { cargo: d?.cargo ?? actualCargoOf(r), reasons: d?.reasons ?? [], reasonMemo: d?.reasonMemo ?? '' });
                return;
            case 'codYes': sendCod(orderId, true); return;
            case 'codNo': sendCod(orderId, false); return;
        }
    };

    const tone = (b: StepCardButton) =>
        b.kind === 'skip' ? 'border border-border bg-surface-alt/50 text-text-primary'
        : b.kind === 'codYes' ? 'border border-success/45 bg-success/12 text-success'
        : b.kind === 'codNo' ? 'border border-danger/40 bg-danger/10 text-danger'
        : b.popup ? 'border border-info/50 bg-info/10 text-info'
        : 'bg-info text-white';

    return (
        <div className={`flex flex-col gap-2 rounded-lg border border-border-card bg-surface-alt/20 p-2.5 ${born ? '' : 'opacity-45'}`}>
            {s.doneText && <div className="text-[13px] font-black text-success">{s.doneText}</div>}
            {/* 🏷️ 고른 값 — 시트 칩과 같은 낱말 · 분까지 */}
            {s.chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-[12.5px]">
                    {s.chips.map((c, i) => (
                        <span key={i} className="px-2 py-1 rounded-md bg-surface-alt/70 border border-border">
                            <span className="text-text-muted">{c.label}</span> <b className="text-text-primary">{c.value}</b>
                        </span>
                    ))}
                </div>
            )}
            {s.memo && <div className="text-[13px] text-text-primary break-keep">기타 : {s.memo}</div>}
            {(s.meta || s.source) && (
                <div className="flex items-center gap-2 text-[13.5px] text-text-primary">
                    {s.meta && <span className="tabular-nums">{s.meta}</span>}
                    {s.source && <span className="ml-auto text-[11px] text-text-muted">{s.source}</span>}
                </div>
            )}
            {!hideButtons && s.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {s.buttons.map(b => (
                        <button key={b.kind} type="button" onClick={e => { e.stopPropagation(); press(b); }}
                            className={`flex-1 min-w-[72px] py-2.5 rounded-md text-[14px] font-black ${tone(b)}`}>
                            {b.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
