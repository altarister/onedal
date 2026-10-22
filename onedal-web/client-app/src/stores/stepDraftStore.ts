import { create } from 'zustand';

/**
 * ✍️ **적던 것 보관 — 단계 시트가 저장 없이 내려가도 이어서 고친다** (기사님 «가»).
 * 수정 팝업은 새 콜 심사 · 도착 감지가 오면 저장 없이 닫힌다 — 그때 시트가 들고 있던 입력을 여기에 둔다.
 * - 열쇠 «콜:단계» · 값 = 시트 입력 묶음 + 그때 행의 `recorded_at`
 * - 같은 행이면 적던 것을 쓰고, 행이 바뀌면(저장됨 · 남이 고침) 버린다 — 서버 값이 이긴다
 * - 서버 값과 같으면 적던 것이 아니다 — 열어 보기만 해서는 «적다 만 것»이 안 생긴다
 * 🔴 관제웹 메모리에만 둔다 — 다시 켜면 사라진다(DB 칸을 만들지 않는다).
 */
export interface StepDraft { recordedAt: string | null; values: Record<string, unknown> }

export const useStepDraftStore = create<{
    drafts: Record<string, StepDraft>;
    /** 🔔 단계 팝업을 닫아야 하는 사건(새 콜 심사 시작)이 몇 번 왔나 — 판 화면이 올리고, 팝업은 «열린 뒤 바뀌었나»만 본다 */
    interruptTick: number;
}>(() => ({ drafts: {}, interruptTick: 0 }));

/** 🔔 새 콜 심사가 시작됐다 — 열린 단계 팝업은 저장 없이 닫힌다(적던 것은 남는다) */
export const interruptStepPopup = () => useStepDraftStore.setState(s => ({ interruptTick: s.interruptTick + 1 }));

export const draftKeyOf = (orderId: string, step: string) => `${orderId}:${step}`;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const drop = (key: string) => useStepDraftStore.setState(s => {
    if (!(key in s.drafts)) return s;
    const { [key]: _gone, ...rest } = s.drafts;
    return { drafts: rest };
});

/** 이 행(recorded_at)에 맞는 적던 것 — 행이 바뀌었으면 버리고 null */
export function draftFor(key: string, recordedAt: string | null | undefined): Record<string, unknown> | null {
    const d = useStepDraftStore.getState().drafts[key];
    if (!d) return null;
    if (d.recordedAt !== (recordedAt ?? null)) { drop(key); return null; }
    return d.values;
}

/** 시트 입력이 바뀔 때마다 — 서버 값과 다르면 적던 것으로 두고, 같으면 지운다 */
export function syncDraft(key: string, recordedAt: string | null | undefined, rowValues: Record<string, unknown>, values: Record<string, unknown>) {
    if (same(rowValues, values)) { drop(key); return; }
    useStepDraftStore.setState(s => ({ drafts: { ...s.drafts, [key]: { recordedAt: recordedAt ?? null, values } } }));
}

/** 콜이 운행 목록에서 빠지면 그 콜의 적던 것을 모두 버린다 */
export function dropDraftsOf(orderId: string) {
    useStepDraftStore.setState(s => ({
        drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => !k.startsWith(`${orderId}:`))),
    }));
}
