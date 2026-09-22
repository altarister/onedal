import { useEffect, useLayoutEffect, useRef } from 'react';
import { STAGE_MAX_OCCLUDE_RATIO, STAGE_MAX_OCCLUDE_CSS, occludedPx } from '../../lib/stageLayout';

/**
 * 🪟 **3단 스냅 시트 — 그릇** (기사님 확정).
 *
 * 웹 자작(OS·RN 아님) — 지도 위에 떠서 `peek` / `list` / `full` 세 높이로 스냅.
 * 내용물은 모른다 — children 을 담을 뿐. 드래그가 곧 사용자 의사 표현이라
 * 별도 내비 버튼이 없다 (기사님 확정). 자동(주행/정차)은 snap 프롭으로 밖에서 바꾼다.
 */
/**
 * 🪟 **세 단 — 기사님 정의.**
 *
 * | 가 `peek` | 시트 상태바만 |
 * | 나 `list` | 상태바 + **아코디언 타이틀 전부** (+ 판정 영역이 있으면 그만큼) |
 * | 다 `full` | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
 *
 * 🔴 **「나」는 고정 숫자가 아니라 내용만큼 서는 것이 이 정의의 핵심이다.**
 *    콜이 하나면 낮고 셋이면 높다 — 남는 자리는 전부 지도다.
 *    *"콜을 적게 가질수록 지도가 넓은 영역을 가지게 되는 거지"* (기사님).
 * 🔴 **손으로 끌어도 딱 이 셋뿐이다** — 중간 높이가 없다 (기사님 확정).
 */
export type SheetSnap = 'peek' | 'list' | 'full';

/**
 * 🪟 **시트가 차지하는 높이 — 이 표가 원천이다** (규칙 ③).
 * 지도 위에 얹는 버튼도 이 값을 봐야 시트에 안 가린다
 * (기사님: *"하단 버튼이 하나도 안 보여 가려져 있나 봐"*).
 */
export const SHEET_HEIGHT: Record<SheetSnap, string> = {
    peek: '72px',
    /** 🔴 **숫자가 아니라 «내용만큼»이다** — 타이틀 전부 + 판정. 넘치면 `full` 에서 멈춘다 */
    list: 'auto',
    full: '100%',
};

/**
 * 🗺️ **시트가 무대를 덮을 수 있는 최대** — 지도가 볼 자리를 남긴다 (기사님 확정).
 *
 * 🔴 *"판정 시트나 시트 아래 나타날 때 시트는 「나」 위치로 가기 때문에 **모두 보여야
 *    한다**"* — 판정이 보이는 것만으로 모자란다. **후보 경로를 지도에서 보는 것이
 *    판정의 재료**다.
 * 🔴 「나」는 «내용만큼» 서므로, 상한이 없으면 **콜이 많을 때 화면을 다 덮는다.**
 *    여기 하나에서 값이 나온다 — 가림 계산(`sheetOccludedPx`)과 **같은 값**이라야
 *    «시트가 덮는 높이»와 «지도가 비켜 주는 높이»가 안 갈라진다 (규칙 ③).
 * ⚠️ 「다」는 «다 쓴다»가 정의라 100% 그대로다 — 상한은 「나」에만 건다.
 */
export const SHEET_MAX_RATIO = STAGE_MAX_OCCLUDE_RATIO;
export const SHEET_LIST_MAX = STAGE_MAX_OCCLUDE_CSS;

/** 📏 `list` 는 내용에서 나오므로 미리 셀 수 없다 — 잴 수 있는 것만 여기서 답한다 */
export const SHEET_FIXED_HEIGHT: Partial<Record<SheetSnap, string>> = {
    peek: '72px',
    full: '100%',
};

/**
 * 🗺️ **시트가 무대 아래쪽을 몇 px 덮는가** — 지도가 «보이는 자리»에 경로를 맞추려면 필요하다
 * (기사님 요청: *"반쯤 열리면 같이 볼 수 있을 것 같은데."*).
 *
 * 🔴 **높이의 원천은 위의 `SHEET_FIXED_HEIGHT` 하나다.** 지도가 «58%» 를 따로 적으면 시트 높이를
 *    고칠 때 한쪽만 고쳐진다 (규칙 ③ — 이 레포가 반복해 당한 형태다).
 *
 * 🔴 **`full` 은 잰 값이 없으면 `peek` 높이로 답한다.** 잰 값이 있어도 가림은
 *    무대의 `STAGE_MAX_OCCLUDE_RATIO` 를 넘지 않는다 (`occludedPx`). 시트가 무대를 다 덮으면
 *    지도는 어차피 안 보이므로 «정확한 가림 높이»가 아무 뜻이 없고, 그 값을 그대로 쓰면
 *    보이는 자리가 0이 되어 지도가 무너진다.
 */
export function sheetOccludedPx(snap: SheetSnap, stageHeight: number, measuredPx?: number): number {
    /* 📏 셈은 `lib/stageLayout` 하나에 있다 — 지도도 **거기를** 본다 (규칙 ③) */
    const raw = SHEET_FIXED_HEIGHT[snap === 'full' ? 'peek' : snap] ?? SHEET_LIST_MAX;
    const n = parseFloat(raw);
    const fallback = raw.endsWith('%') ? stageHeight * n / 100 : n;
    return occludedPx(stageHeight, measuredPx, fallback);
}

interface Props {
    snap: SheetSnap;
    onSnapChange: (s: SheetSnap) => void;
    /**
     * 🎬 **시트 상태바** — 시트가 내려가 있어도 늘 보이는 맨 윗줄 (용어집 확정).
     * «지금 상태 · 다음 갈 곳 · 어느 콜의 무슨 단계»를 말한다.
     * 그 안에서 **누르는 부분**은 «시트 상태바의 버튼» — 바는 그릇, 버튼은 그 안의 것이다.
     * «자막»이라 부르지 않는다 — «무대» 비유에서 나온 말이라 한 번에 안 읽힌다.
     */
    peekBar?: React.ReactNode;
    /**
     * 🪧 **시트 맨 아래 붙박이** — 판정이 여기 산다 (기사님 안).
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
     * 🔴 `aboveSheet()` 는 «snap 이 정한 높이»를 답한다. `list` 는 «내용만큼»(auto) 서므로
     *    그 값과 실제가 갈라지고, 그 값을 믿으면 지도 버튼들이 엉뚱한 자리에 뜬다.
     *    재서 알리는 것이 유일한 원천이다 (규칙 ③).
     */
    onHeightChange?: (px: number) => void;
    /**
     * 🪧 **판정 중 잠금** (기사님 · #144) — *"뭔가 잘못눌러 취소나 킵을 못하면 안되니까"*.
     *    손잡이 · 상태바 · 콜 목록을 딤드하고 못 누르게 한다. 맨 아래 판정 영역(`bottomBox`)만 살아 있다.
     */
    locked?: boolean;
    children: React.ReactNode;
}

export default function StageSheet({ snap, onSnapChange, peekBar, bottomBox, onHeightChange, locked = false, children }: Props) {
    const startY = useRef<number | null>(null);
    const startSnap = useRef<SheetSnap>(snap);
    const dragged = useRef(false);   // 드래그로 한 단 움직였으면 이어지는 click 을 무시 (되튐 버그)

    const order: SheetSnap[] = ['peek', 'list', 'full'];
    const move = (dir: 1 | -1) => {
        const i = order.indexOf(startSnap.current) + dir;
        const next = order[Math.max(0, Math.min(2, i))];
        startSnap.current = next;   // 한 제스처로 여러 단 — 기준점을 딛고 계속 끈다
        // 손이 이긴다는 유예는 규칙(stageStep)이 `drag` 사건에서 건다 — 여기서 또 알리지 않는다
        if (next !== snap && !locked) onSnapChange(next);   // 🪧 판정 중에는 손이 높이를 못 바꾼다 (#144)
    };

    /**
     * 🪧 **붙박이는 시트 안 맨 아래에 `shrink-0` 으로 선다** (기사님 안) — 목록 스크롤러가 그만큼 줄어든다.
     *
     * 🔴 **자리 계산은 이 안에 갇힌다.** 바깥은 «얹을 것»만 넘기고 높이를 모른다 (규칙 ③) —
     *    바깥이 «심사석은 158px» 같은 숫자를 알면 심사석 모양을 고칠 때 한쪽만 고쳐진다.
     * 🔴 시트가 붙박이를 덮으면 **자리 고정이라는 값어치가 통째로 사라진다** —
     *    그래서 붙박이는 스크롤러 밖에 둔다.
     */
    /* 📏 자기 높이를 재서 알린다 — 지도 위 버튼들이 이 값을 보고 시트를 피한다 */
    const selfRef = useRef<HTMLDivElement>(null);

    /**
     * 🏃 **단이 바뀔 때 높이를 전환하지 않는다 — 옮기기만 전환한다** (기사님 지시 · 폰에서 끊겨 보인다).
     *
     * 높이를 전환(`transition: height`)하면 브라우저가 **0.25초 내내 매 프레임**
     * 레이아웃을 다시 잡고, 시트 안 목록·판정까지 통째로 다시 선다 — 폰에서 끊긴다.
     *
     * 그래서 이렇게 한다 — 레이아웃은 **한 번만** 다시 잡히고, 나머지는 GPU 합성이 맡는다:
     *   ① 높이는 즉시 새 값이 된다 (전환 없음)
     *   ② 같은 프레임에 `translateY(옛높이 − 새높이)` 를 줘서 **눈에는 옛 자리**로 둔다
     *   ③ 다음 프레임에 `translateY(0)` 로 0.25초 전환 → 미끄러져 제자리로
     *
     * 🔴 **안쪽 구조는 하나도 안 건드린다** — 「나」의 «내용만큼» · 스크롤러 flex · 맨 아래 붙박이가
     *    그대로다. 시트를 무대 높이로 고정하는 길은 붙박이(판정)가 화면 밖으로 나가서 못 쓴다.
     * 🔴 되돌리려면 이 훅 하나만 빼면 된다.
     */
    const prevHeight = useRef<number | null>(null);
    useLayoutEffect(() => {
        const el = selfRef.current;
        if (!el) return;
        const now = el.offsetHeight;
        const before = prevHeight.current;
        prevHeight.current = now;
        if (before == null || before === now) return;   // 첫 그림 · 높이 그대로면 애니메이션할 것이 없다
        el.style.transition = 'none';
        el.style.transform = `translateY(${now - before}px)`;
        /* 다음 프레임에 제자리로 — 한 프레임 미뤄야 브라우저가 «시작 자리»를 인식한다 */
        const id = requestAnimationFrame(() => {
            el.style.transition = 'transform .25s ease';
            el.style.transform = 'translateY(0)';
        });
        return () => cancelAnimationFrame(id);
    }, [snap]);
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
                    /* 🗺️ **지도가 볼 자리를 남긴다** — 넘치면 목록이 안에서 스크롤한다 */
                    ? { height: 'auto', maxHeight: SHEET_LIST_MAX }
                    : { height: SHEET_HEIGHT[snap] }),
                background: 'var(--color-surface)',
                borderColor: 'color-mix(in srgb, var(--color-border-card) 60%, #4f8df9)',
                boxShadow: '0 -10px 30px rgba(0,0,0,.45)',
                /* 🏃 높이는 즉시 바뀌고, 미끄러지는 것은 `transform` 이 맡는다 (위 `useLayoutEffect`) */
                willChange: 'transform',
            }}
        >
            {/* 손잡이 — 40px 끌 때마다 한 단씩. touch-action:none 이 없으면 폰에서
                브라우저가 스크롤 제스처로 가로채 드래그가 죽는다 (시트가 내려지지 않는다).
                ✋ **손잡이는 언제나 있다** (기사님 확정) — 콜이 없어도 올라간다.
                막아 두면 끌었는데 아무 일이 없어 고장처럼 보인다. 관행(iOS·안드로이드 기본
                시트)도 단은 내용과 무관하게 늘 있고, 안에 «아직 없습니다»를 보여 준다 */}
            {/**
              * ✋ **잡는 자리는 손잡이 + 상태바 줄이다** (기사님: *"영역이 어디까지인지 몰라서
              *    부정확하게 터치하는 경향"*). 44×5 막대 둘레(높이 약 32px)만 잡는 자리면
              *    그 밖을 잡았을 때 아무 일도 안 나 «안 먹힌다»로 느껴진다. 상태바까지 묶으면 70px 이 된다.
              *
              * 🏃 **40px 을 넘길 때마다 한 단씩 옮긴다** — 끄는 동안 손을 따라오지는 않는다(아래 까닭).
              */}
            <div
                /* 📸 화면을 찍어 대조할 때 이 손잡이를 눌러 단을 올린다 (`scripts/shot.mjs`) */
                data-sheet-handle
                className={`shrink-0 ${locked ? 'opacity-30 pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                    startY.current = e.clientY; startSnap.current = snap; dragged.current = false;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                /**
                 * 🔴 **끄는 동안 시트를 «따라 움직이게» 하지 않는다** — 단만 옮긴다.
                 *
                 * 시트는 화면 **바닥에 붙어 높이만 변하는** 구조다. 끄는 동안 `translateY` 로 위로
                 * 들어 올리면 **바닥과의 사이가 벌어져 아래에 지도가 드러난다**.
                 * 위로 끌 때는 시트가 «올라가는» 것이 아니라 «커져야» 맞는데 `transform` 으로는
                 * 그것을 표현할 수 없다. 시트를 화면 높이로 고정하는 길도 막혀 있다 —
                 * 그러면 맨 아래 붙박이(판정)가 화면 밖으로 나간다.
                 * 그래서 **40px 을 넘기면 한 단**만 옮기고, 부드러움은 단이 바뀔 때 도는 FLIP 이 맡는다.
                 */
                onPointerMove={(e) => {
                    if (startY.current == null || locked) return;
                    const dy = startY.current - e.clientY;
                    if (Math.abs(dy) > 40) { dragged.current = true; move(dy > 0 ? 1 : -1); startY.current = e.clientY; }
                }}
                onPointerUp={() => { startY.current = null; }}
                onPointerCancel={() => { startY.current = null; }}
                onClick={() => { if (dragged.current) { dragged.current = false; return; }   // 드래그 직후 click 무시
                    startSnap.current = snap; move(snap === 'full' ? -1 : 1); }}
            >
                <div className="py-3">
                    <div className="mx-auto rounded-full"
                         style={{ width: 44, height: 5, background: 'var(--color-border-hover, #3a4358)' }} />
                </div>
                {peekBar && (
                    /* 🔴 **높이가 늘 같다** (기사님: *"상태바의 높이도 항상 일정했으면"*).
                       내용에 따라 줄이 커졌다 작아졌다 하면, 늘 같은 자리에서 같은 것을 읽던
                       눈이 매번 다시 맞춰야 한다 — 달리면서 1~2초에 읽는 줄이다.
                       ✋ 이 줄도 «잡는 자리»다 — 위 묶음 안에 있어 손잡이와 함께 끌린다. */
                    <div className={`flex items-center px-4 pb-2 text-[13px] font-bold tabular-nums truncate${locked ? ' opacity-40' : ''}`}
                         style={{ color: 'var(--color-text-primary, #dfe5ef)', height: 38, boxSizing: 'content-box' }}>{peekBar}</div>
                )}
            </div>
            {/**
              * 📏 **「나」에서는 내용만큼 선다** — `flex-1`(= `flex: 1 1 0%`)은 남는 공간이
              *    없으면 **높이 0 으로 찌부러진다.** 시트가 «내용만큼» 서면 남는 공간이라는
              *    것이 없으니, 그대로 두면 목록이 사라지고 아래 판정이 제자리를 잃는다
              *    (기사님: *"그 상태에서 화면 밖에다 판정을 그린다"*).
              */}
            {/**
              * 📏 **스크롤러를 flex 상자로 둔다** (기사님: *"아코디언 타이틀이
              *    화면 밖으로 나간다"*).
              *
              * 🔴 그냥 스크롤 상자면 자식이 «상자만큼»(100%) 서려 해도
              *    **백분율 높이는 부모의 `height` 가 auto 면 auto 로 풀린다** —
              *    flex 아이템은 계산된 높이만 있고 `height` 는 auto 라 그 조건에 안 맞는다.
              *    그러면 자식이 상자보다 크게 내용대로 자라
              *    **콜 줄이 위로 밀려 화면 밖으로 나간다.**
              * 🟢 상자를 `flex flex-col` 로 두면 자식이 `flex-1` 로 **상자에 맞춰 선다** —
              *    백분율이 아니라 flex 라 부모의 `height` 를 안 따진다.
              * ⚠️ 스크롤은 그대로 남는다 — 자식이 스스로 늘어나면 여기서 스크롤한다.
              */}
            <div data-sheet-scroll
                 className={`${snap === 'list' ? 'flex-auto' : 'flex-1'} overflow-y-auto min-h-0 flex flex-col${locked ? ' opacity-40 pointer-events-none' : ''}`}>{children}</div>
            {/* 🪧 맨 아래 붙박이 — 목록이 아무리 길어도 여기는 안 밀린다 */}
            {bottomBox && <div className="shrink-0">{bottomBox}</div>}
        </div>
    );
}

/**
 * 🔼 **시트 바로 위에 무엇을 놓을 때의 `bottom` 값**.
 *
 * 지도 아래 모서리의 «콜» 버튼들이 시트에 가려지던 것을 막는다.
 * 🔴 시트 높이를 손으로 또 적지 않는다 — `SHEET_HEIGHT` 가 바뀌면 여기도 따라온다 (규칙 ③).
 *    (실물의 「🚀 지금 출발」이 `bottom-20`(80px)이라는 **손으로 적은 숫자**를 쓰고 있다.
 *     그건 엿보기(72px)에만 맞는 값이라, 반쯤 열면 가려진다 — 나중에 이걸로 옮길 것)
 */
export function aboveSheet(snap: SheetSnap, gapPx = 12): string {
    return `calc(${SHEET_HEIGHT[snap]} + ${gapPx}px)`;
}
