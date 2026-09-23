/**
 * 🎛️ **누르면 펼쳐지는 고르기 칸** — 목업(지도 실험실)이 기사님과 맞춰 온 부품이다.
 *
 * 🔴 **한 벌이다.** `MapMockup` 과 실물 필터(`OrderFilterModal` · `KnobGrid`)가 같이 부른다 —
 *    실물 필터의 제외 지역도 같은 손맛이어야 하고, 두 벌이면 한쪽만 고쳐진다
 *    (`JudgmentSeat` 을 목업이 **부르는** 것과 같은 이유).
 *
 * 🔴 숫자 입력칸은 폰에서 나쁘다 (기사님: *"커서 확인하고 숫자 지우고 입력하고
 *    힘들어"*). 손가락으로 눌러 고른다.
 * 🔴 **펼쳐도 아래가 안 밀린다** — 묶음 위에 겹쳐 뜬다. 아래로 밀면 폰에서 보던 자리가 사라진다.
 *    그래서 부모에 `relative` 가 있어야 한다.
 */
import { useEffect, type ReactNode } from 'react';

export function useCloseOnOutside(open: boolean, close: () => void) {
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            const t = e.target as HTMLElement | null;
            if (t?.closest('[data-pick]')) return;                 // 칸·레이어 안이면 그대로 둔다
            // 🔴 지도 위였으면 **닫기만** 하고 삼킨다 — 닫으려다 콜이 찍히면 안 된다
            if (t?.closest('canvas')) { e.preventDefault(); e.stopPropagation(); }
            close();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey); };
    }, [open, close]);
}

export function PickLayer({ label, value, options, open, onToggle, onPick, selected, keepOpen, tone, foot, mark, optionLabel }: {
    label: string; value: string; options: string[];
    open: boolean; onToggle: () => void; onPick: (v: string) => void;
    /** 지금 켜져 있는 것들 — **색만** 칠한다 */
    selected?: string[];
    /**
     * 🔴 **여럿 고르는 칸인가** — 켜면 고른 뒤에도 레이어가 안 닫힌다.
     *
     * `selected` 는 색만 칠하고 여닫이는 이 값만 정한다. `selected` 로 여닫이를 정하면
     * «어느 시·군·구를 볼까»처럼 **하나만 고르는데 색은 여럿 칠하는** 칸이 눌러도 안 닫혀
     * 오작동으로 보인다.
     */
    keepOpen?: boolean;
    tone?: 'info' | 'warning' | 'danger';
    /** 레이어 아래에 덧붙일 것 (예: 할인율의 차종별 단가표) */
    foot?: ReactNode;
    /**
     * 🏷️ **옵션 옆에 붙일 표시** — 예: 받을 짐에서 «지금 적재로 못 받는 것»에 `✕`.
     *
     * 🔴 **옵션 문자열 자체에 붙이면 안 된다** — `${v} ✕` 처럼 붙이면 `selected.includes(v)` 가
     *    꾸민 글자와 비교해 **막힌 차종은 골라도 강조가 안 켜진다.** 원문은 그대로 두고 표시만 따로 그린다.
     */
    mark?: Record<string, string>;
    /**
     * 🏷️ **보이는 이름만 바꾼다** — 값은 그대로다 (예: 목적지 시·군·구는 이미 고른
     *    시·도 이름을 떼고 «강남구»로 보인다. 저장·검색은 «서울 강남구» 그대로다).
     *
     * 🔴 **`options` 를 꾸며서 넘기면 안 된다** — 그러면 고른 값이 꾸민 글자로 저장되어
     *    콜 검색이 지도에서 그 이름을 못 찾는다. `mark` 와 같은 까닭이다.
     */
    optionLabel?: (v: string) => string;
}) {
    useCloseOnOutside(open, onToggle);
    return (
        <>
            <button type="button" data-pick onClick={onToggle}
                className={`flex flex-col items-start gap-0 px-1.5 py-1 rounded-lg border text-left min-w-0 ${
                    open ? 'border-info/55 bg-info/10' : 'border-border-card bg-background hover:border-border-hover'}`}>
                <span className="text-[9.5px] font-bold text-text-muted leading-tight">{label}</span>
                <span className="w-full truncate text-[13px] font-black text-text-primary leading-tight">{value}</span>
            </button>
            {/* 🔴 아래 레이어는 **z-30 이다** — `relative z-20` 인 제외지역 블록과 같은 층이면
                **뒤에 오는 그쪽이 이긴다.** 그러면 「받을 짐」 레이어 안 하한표가
                제외지역 칸에 가린다 (콜할인율 레이어도 같은 자리다). */}
            {open && (
                <div data-pick className="absolute left-0 right-0 top-0 z-30 rounded-xl border border-info/55 bg-surface shadow-lg p-1.5">
                    <div className="flex items-center justify-between px-0.5 pb-1">
                        <span className="text-[10px] font-black text-text-muted">{label}</span>
                        <button type="button" onClick={onToggle} className="text-[10px] font-black text-text-muted px-1">✕</button>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[190px] overflow-y-auto">
                        {options.map(v => {
                            const on = selected ? selected.includes(v) : v === value;
                            return (
                                <button key={v} type="button" onClick={() => { onPick(v); if (!keepOpen) onToggle(); }}
                                    className={`px-1.5 py-1 rounded-md border text-[11px] font-black ${on
                                        ? (tone === 'warning' ? 'bg-warning/15 border-warning/55 text-warning'
                                            : tone === 'danger' ? 'bg-danger/15 border-danger/55 text-danger'
                                                : 'bg-info/15 border-info/55 text-info')
                                        : 'border-border-card bg-background text-text-muted hover:border-border-hover'}`}>
                                    {optionLabel ? optionLabel(v) : v}{mark?.[v] && <span className="ml-0.5 opacity-70">{mark[v]}</span>}
                                </button>
                            );
                        })}
                    </div>
                    {foot && <div className="mt-1.5 border-t border-border-card pt-1.5">{foot}</div>}
                    {/**
                      * ✅ **여럿 고르는 칸에는 끝내는 버튼을 둔다** (기사님:
                      * *"뭔가 선택 버튼이 필요할 것 같은데"*). 하나만 고르는 칸은 누르면 바로 닫히니
                      * 필요 없고, **여럿 고르는 칸은 «다 골랐다»를 사람이 말해야** 끝난다.
                      * 위의 «✕»는 작아서 운전 중에 못 누른다.
                      */}
                    {keepOpen && (
                        <button type="button" onClick={onToggle}
                            className="mt-1.5 w-full px-2 py-1.5 rounded-lg border border-info/55 bg-info/15 text-info text-[12px] font-black">
                            ✅ 선택 완료
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
