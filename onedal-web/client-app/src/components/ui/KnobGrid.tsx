/**
 * 🎚️ **값 여럿을 한 묶음으로 — 누르면 슬라이더가 «레이어»로 뜬다**
 *
 * 🔴 **한 벌이다** — 목업(`MapMockup`)과 실물 필터가 이 부품 하나를 쓴다.
 *    `PickLayer`·`JudgmentSeat` 과 같은 이유다. 손맛이 갈리면 기사님이 목업에서
 *    맞춰 두신 것이 실물에서 **다른 물건**이 된다 (규칙 ③).
 *
 * 기사님:
 *   · *"**클릭하면 슬라이더가 보이는 건 어때?**"*
 *   · *"**밀리는 것 없이 레이어로** 처리하는 것이 좋을 것 같아"*
 *   · *"한 줄에 3개도 넣을 수 있을 듯"*
 *
 * 🔴 숫자 입력칸은 폰에서 나쁘다 — *"커서 확인하고 숫자 지우고 입력하고 힘들어."*
 *    **손가락으로 끌어 크게 옮기고, ± 로 한 칸씩 다듬는다.** 숫자판을 안 띄운다.
 * 🔴 **조절하는 자리는 레이어 하나다** (기사님 2026-09-23 *"각 인풋에 값을 변경하는것이
 *    2개씩이 들어가 오작동을 한다"*). 칸은 값을 보여 주고 누르면 열릴 뿐이다 —
 *    칸에도 ± 를 두면 같은 일을 하는 장치가 둘이 되고, 레이어가 칸을 덮는 동안 그것은 눌리지도 않는다.
 * 🔴 **펼쳐도 아래가 안 밀린다** — 묶음 위에 겹쳐 뜬다. 아래로 밀면 폰에서 보던 자리가 사라진다.
 * 🔴 레이어는 **셀이 아니라 묶음 전체 폭**을 쓴다 — 셀(1/3) 안에 슬라이더를 넣으면 좁아서 못 끈다.
 *
 * 🖱️ **닫는 길 셋** (기사님 *"닫히는 것도 해줘"*): ① «✕» ② 바깥 ③ Esc.
 *    레이어가 값 버튼을 덮으므로 «같은 버튼 다시 누르기»만으로는 못 닫는다.
 *
 * 🔴 **온 화면 덮개(`fixed inset-0`)를 쓰지 않는다** (기사님 *"지금 오작동하는 거
 *    같아"*). 덮개가 있으면 레이어가 열린 동안 **다른 칸을 누른 클릭을 덮개가 삼킨다** —
 *    첫 누름은 닫기만 해서 두 번 눌러야 열린다. 열린 칸은 `open` **하나뿐**이라
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
     * 🔴 **손가락을 뗄 때 한 번** — 이때 서버로 보낸다.
     *
     * `input[type=range]` 의 `onChange` 는 **끄는 동안 픽셀마다** 발화한다.
     * 실물은 값이 바뀔 때마다 **서버가 경유 지역을 다시 그린다**(지리 연산 수 초) —
     * 목업은 로컬이라 괜찮지만 여기선 폭주한다.
     * `set` 은 화면만 움직이고, 서버로 가는 것은 이 한 번이다.
     *
     * 🔴 **값을 함께 넘긴다.** ± 는 `set` 과 **같은 클릭 안에서** 커밋하는데, 그때 리액트는
     *    아직 다시 그리지 않았다 — 인자 없이 부르면 받는 쪽이 **한 칸 뒤처진 값**을 읽는다.
     */
    onCommit?: (v: number) => void;
    /**
     * 🎚️ **끄는 동안 한 번씩 — 화면만 바꾼다**.
     *
     * 기사님: *"값을 조절할때 움직일때 **영역을 바꿔 주면 좋겠어**. 그래야 그걸 보고
     * **한번에 조절** 하니까."* — 끌면서 지도가 따라 움직여야 한 번에 맞출 수 있다.
     *
     * 🔴 `set` 과 무엇이 다른가: `set` 은 **이 칸의 숫자**만 바꾸고, 이쪽은 **그물까지**
     *    다시 그리게 한다. 소켓은 안 탄다 — 서버로 가는 것은 `onCommit` 뿐이다.
     */
    onPreview?: (v: number) => void;
    /** 지금 안 쓰이는 칸 — 감추지 않고 흐리게 둔다 (감추면 화면이 조용히 거짓말한다) */
    dim?: boolean;
    /**
     * 🔒 **지금은 이 값을 손으로 못 만진다** — 눌러도 레이어가 안 열린다.
     *
     * 🔴 **감추지 않는다** (기사님 *"모두 꺼내 두고"*) — 값은 그대로 보이고 흐릴 뿐이다.
     * 🔴 «흐리다»(`dim`)와 다른 질문이다: 흐린 것은 «지금 안 쓰인다», 잠긴 것은
     *    «다른 값이 이것을 정한다»다. 기준 반경일 때 반경 넷이 그렇다 — 기준거리 하나가 정한다.
     *    두 주인이 한 값을 잡으면 손과 화면이 싸운다 (기사님 실측 *"키우면 줄어들고 그랬어"*).
     */
    locked?: boolean;
};

export function KnobGrid({ knobs, open, onOpen, cols = 3, inline = false }: {
    knobs: KnobDef[];
    open: string | null;
    onOpen: (k: string | null) => void;
    cols?: number;
    /**
     * 🔴 **부모 격자 안에 그대로 선다** — 제 격자도, 제 `relative` 도 만들지 않는다.
     *
     * 기준거리 칸처럼 **다른 부품과 한 줄에 서는** 경우에 쓴다. 래퍼를 만들면 레이어가
     * 그 래퍼(1/3 칸) 폭으로 떠서 **좁아 못 끈다** — 레이어는 줄 전체를 써야 한다.
     * 이때 부모가 `relative` 여야 한다.
     */
    inline?: boolean;
}) {
    const cur = knobs.find(k => k.key === open) ?? null;
    useCloseOnOutside(!!cur, useCallback(() => onOpen(null), [onOpen]));
    /* 🔴 소수 칸(0.5km)이 `4.6 + 0.5 = 5.1000000001` 로 번지지 않게 둘째 자리에서 자른다 */
    const clamp = (k: KnobDef, v: number) => Math.round(Math.min(k.max, Math.max(k.min ?? 0, v)) * 100) / 100;
    const cells = knobs.map(k => (
                    /**
                     * 🎚️ **칸은 값을 보여 주고 누르면 열린다 — 그뿐이다**
                     *    (기사님 2026-09-23: *"각 인풋에 값을 변경하는것이 2개씩이 들어가 오작동을 한다."*).
                     *
                     * 🔴 **칸 안에 ± 를 두지 않는다.** 같은 일을 하는 장치가 칸과 레이어에 둘이면
                     *    어느 것이 듣는지 모르고, 레이어가 칸들을 덮는 동안 칸의 ± 는 눌리지도 않는다.
                     *    조절은 **레이어 한 곳**에서 한다 — 거기에 ± 와 끌기가 다 있다.
                     */
                    <button key={k.key} type="button" data-pick
                        title={k.locked ? '지금은 다른 값이 이것을 정합니다' : '눌러서 조절하기'}
                        onClick={() => { if (!k.locked) onOpen(open === k.key ? null : k.key); }}
                        className={`flex flex-col items-stretch gap-0 px-1 py-1 rounded-lg border text-left ${
                            k.dim || k.locked ? 'opacity-50' : ''} ${
                            open === k.key ? 'border-info/55 bg-info/10' : 'border-border-card bg-background'} ${
                            k.locked ? 'cursor-default' : 'hover:border-border-hover'}`}>
                        <span className="px-0.5 text-[9.5px] font-bold text-text-muted leading-tight">{k.label}</span>
                        <span className="w-full text-center text-[14px] font-black text-text-primary tabular-nums leading-tight whitespace-nowrap">
                            {k.value}<span className="text-[9.5px] font-bold text-text-muted">{k.unit}</span>
                        </span>
                    </button>
    ));
    /* 🔴 아래 레이어는 **z-30** — `PickLayer` 와 같은 층이다. 제외지역 블록이
       `relative z-20` 이라 같은 층이면 뒤에 오는 그쪽이 이긴다 */
    const layer = cur && (
                <div data-pick className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex items-center gap-1.5
                                rounded-xl border border-info/55 bg-surface shadow-lg px-1.5 py-2">
                    <button type="button" onClick={() => onOpen(null)}
                        className="shrink-0 text-[10px] font-black text-text-muted px-0.5">{cur.label} ✕</button>
                    {/* ± 는 한 칸씩이라 **누르는 즉시** 보내도 폭주가 없다 */}
                    <button type="button" onClick={() => { const v = clamp(cur, cur.value - (cur.step ?? 1)); cur.set(v); cur.onCommit?.(v); }}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">−</button>
                    {/* 🔴 끄는 동안은 화면만 · **뗄 때** 서버로 (`onPointerUp`) — 키보드도 같다
                        🎨 `accent-info` 는 hex 가 아니라 테마 토큰 — 라이트에서도 맞는다 (조사 ③) */}
                    <input type="range" min={cur.min ?? 0} max={cur.max} step={cur.step ?? 1} value={cur.value}
                        onChange={e => { const v = Number(e.target.value); cur.set(v); cur.onPreview?.(v); }}
                        onPointerUp={e => cur.onCommit?.(Number((e.target as HTMLInputElement).value))}
                        onKeyUp={e => cur.onCommit?.(Number((e.target as HTMLInputElement).value))}
                        className="flex-1 min-w-0 accent-info" />
                    <button type="button" onClick={() => { const v = clamp(cur, cur.value + (cur.step ?? 1)); cur.set(v); cur.onCommit?.(v); }}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">+</button>
                    <span className="shrink-0 w-[48px] text-right text-[14px] font-black text-info tabular-nums">
                        {cur.value}<span className="text-[9px] font-bold">{cur.unit}</span>
                    </span>
                </div>
    );
    if (inline) return <>{cells}{layer}</>;
    return (
        <div className="relative">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {cells}
            </div>
            {layer}
        </div>
    );
}
