import { useEffect, useRef } from 'react';

/**
 * 🪟 **3단 스냅 시트 — 그릇** (화면개편 2단계 · v23 Ⅱ · 기사님 확정 2026-08-31).
 *
 * 웹 자작(OS·RN 아님) — 지도 위에 떠서 엿보기(peek)/반(half)/전체(full) 세 높이로 스냅.
 * 내용물은 모른다 — children 을 담을 뿐. 드래그가 곧 사용자 의사 표현이라
 * 별도 내비 버튼이 없다 (v21 확정). 자동(주행/정차)은 snap 프롭으로 밖에서 바꾼다.
 */
/**
 * 🪟 **세 단 — 기사님이 2026-09-05 에 다시 정의하셨다.**
 *
 * | 가 `peek` | 시트 상태바만 |
 * | 나 `list` | 상태바 + **아코디언 타이틀 전부** (+ 판정 영역이 있으면 그만큼) |
 * | 다 `full` | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
 *
 * 🔴 **「반 58%」라는 고정 숫자가 사라진 것이 이 정의의 핵심이다.**
 *    콜이 하나면 낮고 셋이면 높다 — 남는 자리는 전부 지도다.
 *    *"콜을 적게 가질수록 지도가 넓은 영역을 가지게 되는 거지"* (기사님).
 * 🔴 **손으로 끌어도 딱 이 셋뿐이다** — 중간 높이가 없다 (기사님 확정).
 */
export type SheetSnap = 'peek' | 'list' | 'full';

/**
 * 🪟 **시트가 차지하는 높이 — 이 표가 원천이다** (규칙 ③).
 * 지도 위에 얹는 버튼도 이 값을 봐야 시트에 안 가린다
 * (기사님 2026-09-04: *"하단 버튼이 하나도 안 보여 가려져 있나 봐"*).
 */
export const SHEET_HEIGHT: Record<SheetSnap, string> = {
    peek: '72px',
    /** 🔴 **숫자가 아니라 «내용만큼»이다** — 타이틀 전부 + 판정. 넘치면 `full` 에서 멈춘다 */
    list: 'auto',
    full: '100%',
};

/** 📏 `list` 는 내용에서 나오므로 미리 셀 수 없다 — 잴 수 있는 것만 여기서 답한다 */
export const SHEET_FIXED_HEIGHT: Partial<Record<SheetSnap, string>> = {
    peek: '72px',
    full: '100%',
};

/**
 * 🗺️ **시트가 무대 아래쪽을 몇 px 덮는가** — 지도가 «보이는 자리»에 경로를 맞추려면 필요하다
 * (기사님 요청 2026-09-01: *"반쯤 열리면 같이 볼 수 있을 것 같은데."*).
 *
 * 🔴 **높이의 원천은 위의 `HEIGHT` 하나다.** 지도가 «58%» 를 따로 적으면 시트 높이를
 *    고칠 때 한쪽만 고쳐진다 (규칙 ③ — 이 레포가 반복해 당한 형태다).
 *
 * 🔴 **`full` 은 `half` 와 같은 값으로 답한다.** 시트가 무대를 다 덮으면 지도는 어차피
 *    안 보이므로 «정확한 가림 높이»가 아무 뜻이 없고, 그 값을 그대로 쓰면 보이는 자리가
 *    0이 되어 지도가 무너진다. 같은 값을 두면 **full → half 로 내려올 때 지도가 이미
 *    제자리에 있어 튀지 않는다** — 내려오는 순간이 기사님이 지도를 다시 보는 순간이다.
 */
export function sheetOccludedPx(snap: SheetSnap, stageHeight: number, measuredPx?: number): number {
    /* 📏 **잰 값이 있으면 그것이 이긴다** — `list` 는 내용에서 나와 미리 셀 수 없다 (2026-09-05) */
    if (measuredPx != null && measuredPx > 0) return Math.min(measuredPx, stageHeight * 0.58);
    const raw = SHEET_FIXED_HEIGHT[snap === 'full' ? 'peek' : snap] ?? '58%';
    const n = parseFloat(raw);
    return raw.endsWith('%') ? stageHeight * n / 100 : n;
}

interface Props {
    snap: SheetSnap;
    onSnapChange: (s: SheetSnap) => void;
    /**
     * 🎬 **시트 상태바** — 시트가 내려가 있어도 늘 보이는 맨 윗줄 (용어집 확정 2026-09-04).
     * «지금 상태 · 다음 갈 곳 · 어느 콜의 무슨 단계»를 말한다.
     * 그 안에서 **누르는 부분**은 «시트 상태바의 버튼» — 바는 그릇, 버튼은 그 안의 것이다.
     * ~~«자막»~~ 은 «무대» 비유가 낳은 말이라 버렸다.
     */
    peekBar?: React.ReactNode;
    /**
     * 🪧 **시트 맨 아래 붙박이** — 판정이 여기 산다 (기사님 안 2026-09-05).
     *
     * 🔴 **엄지에 가장 가까운 자리다.** 그리고 «심사는 언제나 화면 맨 아래 거기»라
     *    찾는 시간이 0이 된다 (규칙 ⑤-3).
     * 🔴 위(`topBox`)가 아니라 **아래**인 것이 기사님 안의 핵심이다 —
     *    콜 목록 바로 밑에 붙어, KEEP 하면 **바로 위 목록으로 올라가는 것**이 보인다.
     */
    bottomBox?: React.ReactNode;
    /**
     * 📏 **시트가 실제로 몇 px 을 차지하는가** — 지도 위 버튼들이 이걸 봐야 안 가린다.
     *
     * 🔴 `aboveSheet()` 는 «snap 이 정한 높이»를 답한다. `fitContent` 로 시트가
     *    «내용만큼» 서기 시작한 순간 **그 값과 실제가 갈라졌고**, 지도 버튼들이
     *    엉뚱한 자리에 떴다 (기사님 2026-09-05). 재서 알리는 것이 유일한 원천이다 (규칙 ③).
     */
    onHeightChange?: (px: number) => void;
    children: React.ReactNode;
}

export default function StageSheet({ snap, onSnapChange, peekBar, bottomBox, onHeightChange, children }: Props) {
    const startY = useRef<number | null>(null);
    const startSnap = useRef<SheetSnap>(snap);
    const dragged = useRef(false);   // 드래그로 한 단 움직였으면 이어지는 click 을 무시 (되튐 버그)

    const order: SheetSnap[] = ['peek', 'list', 'full'];
    const move = (dir: 1 | -1) => {
        const i = order.indexOf(startSnap.current) + dir;
        const next = order[Math.max(0, Math.min(2, i))];
        startSnap.current = next;   // 한 제스처로 여러 단 — 기준점을 딛고 계속 끈다
        // 손이 이긴다는 유예는 규칙(stageStep)이 `drag` 사건에서 건다 — 여기서 또 알리지 않는다
        if (next !== snap) onSnapChange(next);
    };

    /**
     * 🪧 **붙박이가 있으면 시트가 그만큼 낮게 선다** (기사님 안 2026-09-05).
     *
     * 🔴 **계산은 여기 갇힌다.** 바깥은 «얹을 것»만 넘기고 높이를 모른다 (규칙 ③) —
     *    바깥이 «심사석은 158px» 같은 숫자를 알면 심사석 모양을 고칠 때 한쪽만 고쳐진다.
     * 🔴 시트가 붙박이를 덮으면 **자리 고정이라는 값어치가 통째로 사라진다** —
     *    그러라고 있는 것이라 이 뺄셈이 이 안의 전부다.
     */
    /* 📏 자기 높이를 재서 알린다 — 지도 위 버튼들이 이 값을 보고 시트를 피한다 */
    const selfRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = selfRef.current;
        if (!el || !onHeightChange) return;
        const tell = () => onHeightChange(el.offsetHeight);
        const ro = new ResizeObserver(tell);
        ro.observe(el);
        tell();
        return () => ro.disconnect();
    }, [onHeightChange, snap]);

    return (
        <div
            ref={selfRef}
            className="absolute left-0 right-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t"
            style={{
                /* 📏 `list` 는 **내용만큼** 서고 `full` 을 넘지 않는다.
                   `peek`(상태바만)·`full`(다 쓴다)은 고정값이다. */
                ...(snap === 'list'
                    ? { height: 'auto', maxHeight: '100%' }
                    : { height: SHEET_HEIGHT[snap] }),
                background: 'var(--color-surface)',
                borderColor: 'color-mix(in srgb, var(--color-border-card) 60%, #4f8df9)',
                boxShadow: '0 -10px 30px rgba(0,0,0,.45)',
                transition: 'height .25s ease',
            }}
        >
            {/* 손잡이 — 40px 끌 때마다 한 단씩. touch-action:none 이 없으면 폰에서
                브라우저가 스크롤 제스처로 가로채 드래그가 죽는다 (기사님 실측 0831: 내려지지 않음).
                ✋ **손잡이는 언제나 있다** (기사님 확정 2026-09-05) — 콜이 없어도 올라간다.
                막아 두면 끌었는데 아무 일이 없어 고장처럼 보인다. 관행(iOS·안드로이드 기본
                시트)도 단은 내용과 무관하게 늘 있고, 안에 «아직 없습니다»를 보여 준다 */}
            <div
                className="shrink-0 py-3 cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => { startY.current = e.clientY; startSnap.current = snap; dragged.current = false; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => {
                    if (startY.current == null) return;
                    const dy = startY.current - e.clientY;
                    if (Math.abs(dy) > 40) { dragged.current = true; move(dy > 0 ? 1 : -1); startY.current = e.clientY; }
                }}
                onPointerUp={() => { startY.current = null; }}
                onClick={() => { if (dragged.current) { dragged.current = false; return; }   // 드래그 직후 click 무시
                    startSnap.current = snap; move(snap === 'full' ? -1 : 1); }}
            >
                <div className="mx-auto rounded-full"
                     style={{ width: 44, height: 5, background: 'var(--color-border-hover, #3a4358)' }} />
            </div>
            {peekBar && (
                /* 🔴 **높이가 늘 같다** (기사님 2026-09-05: *"상태바의 높이도 항상 일정했으면"*).
                   내용에 따라 줄이 커졌다 작아졌다 하면, 늘 같은 자리에서 같은 것을 읽던
                   눈이 매번 다시 맞춰야 한다 — 달리면서 1~2초에 읽는 줄이다. */
                <div className="shrink-0 flex items-center px-4 pb-2 text-[13px] font-bold tabular-nums truncate"
                     style={{ color: 'var(--color-text-primary, #dfe5ef)', height: 38, boxSizing: 'content-box' }}>{peekBar}</div>
            )}
            {/**
              * 📏 **「나」에서는 내용만큼 선다** — `flex-1`(= `flex: 1 1 0%`)은 남는 공간이
              *    없으면 **높이 0 으로 찌부러진다.** 시트가 «내용만큼» 서면 남는 공간이라는
              *    것이 없으니, 그대로 두면 목록이 사라지고 아래 판정이 제자리를 잃는다
              *    (기사님 2026-09-05: *"그 상태에서 화면 밖에다 판정을 그린다"*).
              */}
            <div data-sheet-scroll
                 className={`${snap === 'list' ? 'flex-auto' : 'flex-1'} overflow-y-auto min-h-0`}>{children}</div>
            {/* 🪧 맨 아래 붙박이 — 목록이 아무리 길어도 여기는 안 밀린다 */}
            {bottomBox && <div className="shrink-0">{bottomBox}</div>}
        </div>
    );
}

/**
 * 🔼 **시트 바로 위에 무엇을 놓을 때의 `bottom` 값** (2026-09-04 신설).
 *
 * 지도 아래 모서리의 «콜» 버튼들이 시트에 가려지던 것을 막는다.
 * 🔴 시트 높이를 손으로 또 적지 않는다 — `SHEET_HEIGHT` 가 바뀌면 여기도 따라온다 (규칙 ③).
 *    (실물의 「🚀 지금 출발」이 `bottom-20`(80px)이라는 **손으로 적은 숫자**를 쓰고 있다.
 *     그건 엿보기(72px)에만 맞는 값이라, 반쯤 열면 가려진다 — 나중에 이걸로 옮길 것)
 */
export function aboveSheet(snap: SheetSnap, gapPx = 12): string {
    return `calc(${SHEET_HEIGHT[snap]} + ${gapPx}px)`;
}
