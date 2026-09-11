/**
 * 🎚️ **값 여럿을 한 묶음으로 — 누르면 슬라이더가 «레이어»로 뜬다**
 *
 * 🔴 **한 벌이다.** 2026-09-11 에 `MapMockup` 안에서 여기로 옮겼다 (이식 C4-1) —
 *    `PickLayer`(C2-2)·`JudgmentSeat` 과 같은 이유다. 손맛이 갈리면 기사님이 목업에서
 *    맞춰 두신 것이 실물에서 **다른 물건**이 된다 (규칙 ③).
 *
 * 기사님 2026-09-09:
 *   · *"**클릭하면 슬라이더가 보이는 건 어때?**"*
 *   · *"**밀리는 것 없이 레이어로** 처리하는 것이 좋을 것 같아"*
 *   · *"한 줄에 3개도 넣을 수 있을 듯"*
 *
 * 🔴 숫자 입력칸은 폰에서 나쁘다 — *"커서 확인하고 숫자 지우고 입력하고 힘들어."*
 *    **손가락으로 끌어 크게 옮기고, ± 로 한 칸씩 다듬는다.** 숫자판을 안 띄운다.
 * 🔴 **펼쳐도 아래가 안 밀린다** — 묶음 위에 겹쳐 뜬다. 아래로 밀면 폰에서 보던 자리가 사라진다.
 * 🔴 레이어는 **셀이 아니라 묶음 전체 폭**을 쓴다 — 셀(1/3) 안에 슬라이더를 넣으면 좁아서 못 끈다.
 *
 * 🖱️ **닫는 길 셋** (기사님 2026-09-09 *"닫히는 것도 해줘"*): ① «✕» ② 바깥 ③ Esc.
 *    레이어가 값 버튼을 덮으므로 «같은 버튼 다시 누르기»만으로는 못 닫는다.
 *
 * 🔴 **온 화면 덮개(`fixed inset-0`)를 쓰지 않는다** (기사님 2026-09-09 *"지금 오작동하는 거
 *    같아"*). 덮개가 있으면 레이어가 열린 동안 **다른 칸을 누른 클릭을 덮개가 삼킨다** —
 *    첫 누름은 닫기만 해서 두 번 눌러야 열렸다. 열린 칸은 `open` **하나뿐**이라
 *    다른 칸을 열면 이 칸은 저절로 닫힌다. 그러니 «칸이 아닌 곳»만 보면 된다 (`data-pick`).
 */
import { useCallback } from 'react';
import { useCloseOnOutside } from './PickLayer';

/** 🎚️ 값 하나의 정의 — 화면과 계산이 같은 목록을 읽는다 */
export type KnobDef = {
    key: string;
    label: string;
    unit: string;
    value: number;
    /** 표의 하한. 없으면 0 (규칙 ③ — 여기서 지어내지 않는다) */
    min?: number;
    max: number;
    /** 한 칸이 얼마인가. 각도는 10, km 는 1 — **표가 정한다** */
    step?: number;
    set: (v: number) => void;
    /**
     * 🔴 **손가락을 뗄 때 한 번** — 이때 서버로 보낸다 (이식 C4-10 · 2026-09-12).
     *
     * `input[type=range]` 의 `onChange` 는 **끄는 동안 픽셀마다** 발화한다.
     * 실물은 값이 바뀔 때마다 **서버가 경유 지역을 다시 그린다**(지리 연산 수 초) —
     * 목업은 로컬이라 괜찮았지만 여기선 폭주한다.
     * `set` 은 화면만 움직이고, 서버로 가는 것은 이 한 번이다.
     *
     * 🔴 **값을 함께 넘긴다.** ± 는 `set` 과 **같은 클릭 안에서** 커밋하는데, 그때 리액트는
     *    아직 다시 그리지 않았다 — 인자 없이 부르면 받는 쪽이 **한 칸 뒤처진 값**을 읽는다.
     */
    onCommit?: (v: number) => void;
    /** 지금 안 쓰이는 칸 — 감추지 않고 흐리게 둔다 (감추면 화면이 조용히 거짓말한다) */
    dim?: boolean;
};

export function KnobGrid({ knobs, open, onOpen, cols = 3 }: {
    knobs: KnobDef[];
    open: string | null;
    onOpen: (k: string | null) => void;
    cols?: number;
}) {
    const cur = knobs.find(k => k.key === open) ?? null;
    useCloseOnOutside(!!cur, useCallback(() => onOpen(null), [onOpen]));
    const clamp = (k: KnobDef, v: number) => Math.min(k.max, Math.max(k.min ?? 0, v));
    return (
        <div className="relative">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {knobs.map(k => (
                    <button key={k.key} type="button" data-pick onClick={() => onOpen(open === k.key ? null : k.key)}
                        className={`flex flex-col items-start gap-0 px-1.5 py-1 rounded-lg border text-left ${k.dim ? 'opacity-50' : ''} ${
                            open === k.key ? 'border-info/55 bg-info/10' : 'border-border-card bg-background hover:border-border-hover'}`}>
                        <span className="text-[9.5px] font-bold text-text-muted leading-tight">{k.label}</span>
                        <span className="text-[14px] font-black text-text-primary tabular-nums leading-tight">
                            {k.value}<span className="text-[9.5px] font-bold text-text-muted">{k.unit}</span>
                        </span>
                    </button>
                ))}
            </div>
            {cur && (
                <div data-pick className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5
                                rounded-xl border border-info/55 bg-surface shadow-lg px-1.5 py-2">
                    <button type="button" onClick={() => onOpen(null)}
                        className="shrink-0 text-[10px] font-black text-text-muted px-0.5">{cur.label} ✕</button>
                    {/* ± 는 한 칸씩이라 **누르는 즉시** 보내도 폭주가 없다 */}
                    <button type="button" onClick={() => { const v = clamp(cur, cur.value - (cur.step ?? 1)); cur.set(v); cur.onCommit?.(v); }}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">−</button>
                    {/* 🔴 끄는 동안은 화면만 · **뗄 때** 서버로 (`onPointerUp`) — 키보드도 같다 */}
                    <input type="range" min={cur.min ?? 0} max={cur.max} step={cur.step ?? 1} value={cur.value}
                        onChange={e => cur.set(Number(e.target.value))}
                        onPointerUp={e => cur.onCommit?.(Number((e.target as HTMLInputElement).value))}
                        onKeyUp={e => cur.onCommit?.(Number((e.target as HTMLInputElement).value))}
                        className="flex-1 min-w-0 accent-[#0284c7]" />
                    <button type="button" onClick={() => { const v = clamp(cur, cur.value + (cur.step ?? 1)); cur.set(v); cur.onCommit?.(v); }}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">+</button>
                    <span className="shrink-0 w-[48px] text-right text-[14px] font-black text-info tabular-nums">
                        {cur.value}<span className="text-[9px] font-bold">{cur.unit}</span>
                    </span>
                </div>
            )}
        </div>
    );
}
