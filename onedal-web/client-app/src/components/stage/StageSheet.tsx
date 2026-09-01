import { useRef } from 'react';

/**
 * 🪟 **3단 스냅 시트 — 그릇** (화면개편 2단계 · v23 Ⅱ · 기사님 확정 2026-08-31).
 *
 * 웹 자작(OS·RN 아님) — 지도 위에 떠서 엿보기(peek)/반(half)/전체(full) 세 높이로 스냅.
 * 내용물은 모른다 — children 을 담을 뿐. 드래그가 곧 사용자 의사 표현이라
 * 별도 내비 버튼이 없다 (v21 확정). 자동(주행/정차)은 snap 프롭으로 밖에서 바꾼다.
 */
export type SheetSnap = 'peek' | 'half' | 'full';

const HEIGHT: Record<SheetSnap, string> = {
    peek: '72px',
    half: '58%',
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
export function sheetOccludedPx(snap: SheetSnap, stageHeight: number): number {
    const raw = HEIGHT[snap === 'full' ? 'half' : snap];
    const n = parseFloat(raw);
    return raw.endsWith('%') ? stageHeight * n / 100 : n;
}

interface Props {
    snap: SheetSnap;
    onSnapChange: (s: SheetSnap) => void;
    /** 🎬 자막 줄 — 시트가 내려가 있어도 이 한 줄이 무대의 상태를 말한다 (v23 엿보기 줄) */
    peekBar?: React.ReactNode;
    children: React.ReactNode;
}

export default function StageSheet({ snap, onSnapChange, peekBar, children }: Props) {
    const startY = useRef<number | null>(null);
    const startSnap = useRef<SheetSnap>(snap);
    const dragged = useRef(false);   // 드래그로 한 단 움직였으면 이어지는 click 을 무시 (되튐 버그)

    const order: SheetSnap[] = ['peek', 'half', 'full'];
    const move = (dir: 1 | -1) => {
        const i = order.indexOf(startSnap.current) + dir;
        const next = order[Math.max(0, Math.min(2, i))];
        startSnap.current = next;   // 한 제스처로 여러 단 — 기준점을 딛고 계속 끈다
        // 손이 이긴다는 유예는 규칙(stageStep)이 `drag` 사건에서 건다 — 여기서 또 알리지 않는다
        if (next !== snap) onSnapChange(next);
    };

    return (
        <div
            className="absolute left-0 right-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t"
            style={{
                height: HEIGHT[snap],
                background: 'var(--color-surface)',
                borderColor: 'color-mix(in srgb, var(--color-border-card) 60%, #4f8df9)',
                boxShadow: '0 -10px 30px rgba(0,0,0,.45)',
                transition: 'height .25s ease',
            }}
        >
            {/* 손잡이 — 40px 끌 때마다 한 단씩. touch-action:none 이 없으면 폰에서
                브라우저가 스크롤 제스처로 가로채 드래그가 죽는다 (기사님 실측 0831: 내려지지 않음) */}
            <div
                className="shrink-0 cursor-grab active:cursor-grabbing py-3"
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
                <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: 'var(--color-border-hover, #3a4358)' }} />
            </div>
            {peekBar && (
                <div className="shrink-0 px-4 pb-2 text-[13px] font-bold tabular-nums truncate"
                     style={{ color: 'var(--color-text-primary, #dfe5ef)' }}>{peekBar}</div>
            )}
            <div data-sheet-scroll className="flex-1 overflow-y-auto min-h-0">{children}</div>
        </div>
    );
}
