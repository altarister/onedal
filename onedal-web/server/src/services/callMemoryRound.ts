import { businessDayKey } from "@onedal/shared";

/**
 * 🧹 **폰 «본 콜» 기억 비우기 번호** — `/api/scrap` 응답 꼬리 `deviceControl.callMemoryRound` 에 싣는다.
 *
 * 원달앱은 번호가 바뀌면 `CallMemory` 를 비운다(처음 받은 번호는 기억만 — 이미 누른 콜을 다시 누르지 않게).
 * 번호 = 한국 영업일 번호(`businessDayKey` 의 날) + 시뮬 회차(개발일 때만 부르는 쪽이 넘긴다 · 운영은 null).
 * 둘 다 늘기만 하니 합이 바뀌면 곧 «영업일이 바뀜» 또는 «현황판에서 회차를 올림»이다.
 * 🔴 서버 상태가 없다 — 같은 날 몇 번 불러도 같은 번호, 서버를 다시 띄워도 같은 번호(재시작에 폰 기억을 날리지 않는다).
 */
export function callMemoryRoundOf(nowMs: number, simRound: number | null): number {
    const [y, m, d] = businessDayKey(nowMs).split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) + (simRound ?? 0);
}
