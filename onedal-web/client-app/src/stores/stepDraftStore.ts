import { create } from 'zustand';

/**
 * ✍️ **적던 것 보관 — 단계 시트가 저장 없이 내려가도 이어서 고친다** (기사님 «가»).
 * 수정 팝업은 새 콜 심사 · 도착 감지가 오면 저장 없이 닫힌다 — 그때 시트가 들고 있던 입력을 여기에 둔다.
 * - 열쇠 «콜:단계» · 값 = 시트 입력 묶음 + 그때 칸의 사실(`stepFactOf` — 상태 · 일어난 시각)
 * - 사실이 같으면 적던 것을 쓰고, 바뀌면(저장됨 · 남이 저장 · 되돌림) 버린다 — 서버 값이 이긴다
 *   ⚠️ `recorded_at` 은 쓰지 않는다 — 단계 마감은 그것을 안 바꾸고, 정차 배지는 바꾼다(배지가 적던 것을 지우면 안 된다)
 * - 서버 값과 같으면 적던 것이 아니다 — 열어 보기만 해서는 «적다 만 것»이 안 생긴다
 * 🔴 관제웹 메모리에만 둔다 — 다시 켜면 사라진다(DB 칸을 만들지 않는다).
 */
export interface StepDraft { fact: string; values: Record<string, unknown> }

/** 칸의 사실 — 상태 · 일어난 시각. 저장 · 남의 저장 · 되돌리기는 바꾸고, 정차 배지 · 착불은 안 바꾼다 */
export const stepFactOf = (row: Record<string, any>) => `${row.status ?? ''}|${row.occurred_at ?? ''}`;

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

/** 이 칸의 사실에 맞는 적던 것 — 사실이 바뀌었으면 버리고 null */
export function draftFor(key: string, fact: string): Record<string, unknown> | null {
    const d = useStepDraftStore.getState().drafts[key];
    if (!d) return null;
    if (d.fact !== fact) { drop(key); return null; }
    return d.values;
}

/** 시트 입력이 바뀔 때마다 — 서버 값과 다르면 적던 것으로 두고, 같으면 지운다 */
export function syncDraft(key: string, fact: string, rowValues: Record<string, unknown>, values: Record<string, unknown>) {
    if (same(rowValues, values)) { drop(key); return; }
    useStepDraftStore.setState(s => ({ drafts: { ...s.drafts, [key]: { fact, values } } }));
}

/** 콜이 운행 목록에서 빠지면 그 콜의 적던 것을 모두 버린다 */
export function dropDraftsOf(orderId: string) {
    useStepDraftStore.setState(s => ({
        drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => !k.startsWith(`${orderId}:`))),
    }));
}
