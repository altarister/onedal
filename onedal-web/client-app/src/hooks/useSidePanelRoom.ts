import { useEffect, useState } from 'react';

/**
 * 🖥️ **곁 패널이 설 자리가 있나 — 화면 폭 하나로 답한다** (규칙 ③).
 *
 * 🔴 **숫자는 여기 한 곳이다.** 두 자리가 이 답을 쓴다 —
 *    ① 현황판을 곁에 붙일지 (`Dashboard`) ② 지도 위 «🚀 지금 출발»을 보일지 (`StageView`).
 *    두 곳에 폭을 적으면 좁은 화면에서 **한쪽만 사라진다.**
 * 🔴 좁은 화면(폰)에서 «지금 출발»을 지우는 까닭: 운전 중에는 누를 수 없고,
 *    주행이 감지되면 스스로 출발로 넘어간다 — 좁은 화면에서 지도를 덮을 값어치가 없다.
 */

/** 본문 붙박이 폭 — `Dashboard` 의 `w-[42rem]` */
const BODY_WIDTH_PX = 672;
/** 곁 패널이 설 수 있는 최소 폭 */
const PANEL_MIN_PX = 346;

export function hasSidePanelRoom(): boolean {
    return window.innerWidth - BODY_WIDTH_PX >= PANEL_MIN_PX;
}

export function useSidePanelRoom(): boolean {
    const [room, setRoom] = useState(hasSidePanelRoom);
    useEffect(() => {
        const onResize = () => setRoom(hasSidePanelRoom());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return room;
}
