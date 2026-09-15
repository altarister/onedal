/**
 * 🗺️ **픽커의 «지도 위 시트»** — 수락 전 상세(실물 10-1~10-3) · 픽업 이동(16~18) · 배송 중(21~22)이 같은 구조다
 *
 * 맨 아래 지도가 화면 전체에 깔리고, 그 위에 손잡이 달린 시트가 올라온다. 이 파일은 둘이 함께 쓰는 두 조각만 둔다:
 * - `usePickerSheetDrag` — 손잡이 끌기 (위로 끌면 한 칸 올리고 아래로 끌면 한 칸 내린다)
 * - `PickerMapBackdrop` — 지도 자리 (핀 · 경로 · 내 위치)
 * 시트가 몇 칸인지 · 칸마다 무엇을 그리는지는 각 화면이 정한다 (상세는 하·중·상 · 운행은 중·상).
 * 🔴 지도에 글자를 두지 않는다 — 실물 지도의 지명 · «픽업»/«배송» 핀 글자는 원달앱·서버 글자인식이 주소로 잘못 집는다
 */
import { useEffect, useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';

/** 이만큼 끌면 한 칸 옮긴다 (CSS px) */
const DRAG_PX = 40;

/**
 * 손잡이 끌기 — `dragHandlers` 를 손잡이에 펴 넣고, 손잡이 누르기는 `onTap` 으로 감싼다.
 * 🔴 끈 뒤 손을 떼면 «누르기»가 따라온다 — 그 누르기로 한 칸 더 옮기지 않게 한 박자 동안 누르기를 버린다.
 */
export function usePickerSheetDrag(onDrag: (dir: 1 | -1) => void) {
  const startY = useRef<number | null>(null);
  const dragged = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const dragHandlers = {
    'data-sheet-drag': true,
    onPointerDown: (e: PointerEvent) => {
      startY.current = e.clientY;
      // 🔴 손가락이 손잡이 밖에서 떼어져도 뗌 신호가 이리 오게 묶는다 — 안 묶으면 브라우저에서 끌기가 안 먹는다
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerUp: (e: PointerEvent) => {
      const dy = startY.current == null ? 0 : e.clientY - startY.current;
      startY.current = null;
      if (Math.abs(dy) < DRAG_PX) return;
      onDrag(dy < 0 ? 1 : -1);
      dragged.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { dragged.current = false; }, 0);
    },
  };
  const onTap = (fn: () => void) => () => { if (!dragged.current) fn(); };
  return { dragHandlers, onTap };
}

/** 지도 자리 — 화면 전체에 깔린다. 지도 위 버튼(뒤로가기 · 배정 취소 · 안내 띠)은 화면이 `children` 으로 얹는다 */
export const PickerMapBackdrop = ({ children }: { children?: ReactNode }) => (
  <div data-map className="absolute inset-0 bg-[#e9efe7]">
    <div className="absolute left-[22%] top-[14%] w-[26px] h-[26px] rounded-full rounded-br-none rotate-45 bg-[#7646d6]" />
    <div className="absolute left-[46%] top-[19%] w-[26px] h-[26px] rounded-full rounded-br-none rotate-45 bg-[#4a74db]" />
    <div className="absolute left-[25%] top-[18%] w-[55%] h-[6px] rounded-full bg-[#4a74db]/40 rotate-[14deg] origin-left" />
    <div className="absolute left-[78%] top-[28%] w-[14px] h-[14px] rounded-full bg-[#e53935] border-2 border-white" />
    {children}
  </div>
);
