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
    peek: '64px',
    half: '58%',
    full: '100%',
};

interface Props {
    snap: SheetSnap;
    onSnapChange: (s: SheetSnap) => void;
    /** 사용자가 드래그로 바꿨다 — 자동 전환 유예의 신호 (v22 규칙: 손이 이긴다) */
    onUserDrag?: () => void;
    children: React.ReactNode;
}

export default function StageSheet({ snap, onSnapChange, onUserDrag, children }: Props) {
    const startY = useRef<number | null>(null);
    const startSnap = useRef<SheetSnap>(snap);

    const order: SheetSnap[] = ['peek', 'half', 'full'];
    const move = (dir: 1 | -1) => {
        const i = order.indexOf(startSnap.current) + dir;
        const next = order[Math.max(0, Math.min(2, i))];
        if (next !== snap) { onUserDrag?.(); onSnapChange(next); }
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
            {/* 손잡이 — 터치 시작점 대비 60px 이상 끌면 한 단 이동 */}
            <div
                className="shrink-0 cursor-grab active:cursor-grabbing py-2"
                onPointerDown={(e) => { startY.current = e.clientY; startSnap.current = snap; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => {
                    if (startY.current == null) return;
                    const dy = startY.current - e.clientY;
                    if (Math.abs(dy) > 60) { move(dy > 0 ? 1 : -1); startY.current = null; }
                }}
                onPointerUp={() => { startY.current = null; }}
                onClick={() => { /* 탭 = 한 단 올리기 (peek→half→full), full 이면 half 로 */
                    startSnap.current = snap; move(snap === 'full' ? -1 : 1); }}
            >
                <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: 'var(--color-border-hover, #3a4358)' }} />
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        </div>
    );
}
