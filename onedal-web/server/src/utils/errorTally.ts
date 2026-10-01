import { kstDateText } from "@onedal/shared";

/**
 * 🧯 **서버 오늘 오류 수 — 쓰는 순간 센다** (reviews/33 · onedal-69 «가» · ERR 만).
 *    fileLogger 가 ERR 줄(console.error)을 파일에 쓸 때 noteError 를 부른다 — 로그 파일을 통째로 읽지 않는다.
 *    메모리라 한국 날이 바뀌면 0 · 서버를 다시 띄워도 0 이다(화면은 «부팅 뒤 · 오늘»). 운영센터 점검 · 홈이 errorsToday 로 읽는다.
 * 🔴 «같은 모양» 규칙은 pnpm log(scripts/log.mjs 의 UUID · shapeOf)와 글자까지 같다 — mjs 가 TS 를 못 불러 두 곳에 두고 검사 errorTally 가 묶는다.
 * ⚠️ pnpm log 와 숫자를 견줄 때: 여기는 파일 줄의 «#태그» · «@기사»를 붙이기 전 글로 센다 — 같은 오류가 기사 둘에게 나면 pnpm log 는 두 모양 · 여기는 한 가지다.
 *    또 pnpm log 의 «수상한 줄»은 WRN · 이모지 줄까지 섞어 세니 ERR 줄끼리만 견준다.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
export const errorShapeOf = (msg: string): string => msg.replace(UUID, '<id>').replace(/\b[0-9a-f]{6,8}\b/g, '<id>').replace(/\d+/g, 'N');

/** 하루에 모양이 이만큼 넘으면 가짓수는 더 늘리지 않는다(메모리 상한) — 숫자는 계속 센다 */
const MAX_KINDS = 2000;
let tally = { day: '', count: 0, shapes: new Set<string>() };

export function noteError(msg: string, now: number = Date.now()): void {
    const day = kstDateText(now) ?? '';
    if (tally.day !== day) tally = { day, count: 0, shapes: new Set() };
    tally.count++;
    if (tally.shapes.size < MAX_KINDS) tally.shapes.add(errorShapeOf(msg));
}

export function errorsToday(now: number = Date.now()): { count: number; kinds: number } {
    return tally.day === (kstDateText(now) ?? '') ? { count: tally.count, kinds: tally.shapes.size } : { count: 0, kinds: 0 };
}
