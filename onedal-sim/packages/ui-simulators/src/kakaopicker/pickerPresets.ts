/**
 * 🎯 **픽커 문제지 — «이천 방향» 일곱 지점을 그대로 쓴다** (기사님)
 *
 * 기사님: *"이천 방향 — 집에서 이천까지 일곱 지점, 이 문제로 계속 테스트 중이거든 이걸로 하자"*
 *        *"서버는 서버대로 문제는 문제대로 했을 때 정답이 계속 바뀌고 그 정답이 맞는가를 확인하면 어때?"*
 *
 * - **지점·순서는 인성 «칠지점» 한 곳에서 온다** (`core-simulator` 의 `presets.ts`) — 두 벌로 적지 않는다 (규칙 ③)
 * - **요금만 P 크기로** — 원 ÷ 5 를 10P 단위로 (5만 원 → 10,000P · 5천 원 → 1,000P). 픽커 요금 글자는 쉼표가 있어야 해서 1,000P 아래로 안 내린다
 * - 🔴 **정답(`expect`) · 차종 · 요구 조건을 싣지 않는다** — 서버 필터는 콜을 잡고 위치가 움직일 때마다 바뀐다.
 *   정답은 원달앱이 판정하는 **그 순간 폰이 가진 필터**로 채점기(`onedal-sim/scripts/pickerAlarmGrade.mjs`)가 다시 계산해 맞춰 본다.
 * - 인성 문제의 ⭕/✖ 표시는 **인성 콜 필터의 정답**이라 이름에서 뗀다 (픽커엔 차종 축이 없다)
 *
 * ⚠️ 알람 판정 세 축을 하나씩 시험하는 문제지는 두지 않는다 — 서버 값을 문제지에 맞춰야 해서다.
 * ⏳ 오더카드(원달앱이 누르지 않는가) 문제는 아직 없다.
 */
import type { PresetBook, PresetProblem } from '@altari/core-simulator';
import { SHARED_PRESET_BOOK } from '@altari/core-simulator';

const KEY = '칠지점';

/** 원 → P — ÷5 · 10P 단위 · 최소 1,000P (쉼표 든 요금 글자) */
const toPoints = (won?: number): number | undefined =>
    won == null ? undefined : Math.max(1000, Math.round(won / 5 / 10) * 10);

const SEVEN_POINTS: PresetProblem[] = (SHARED_PRESET_BOOK.problems[KEY] ?? []).map(p => ({
    ...p,
    label: p.label.replace(/\s*[⭕✖]\s*/g, ' ').replace(/\s+/g, ' ').trim(),
    fare: toPoints(p.fare),
    expect: undefined,
    vehicleType: undefined,
    why: '인성 «칠지점» 지점 그대로 · 정답은 판정 순간의 폰 필터로 채점한다',
}));

const PROBLEMS: Record<string, PresetProblem[]> = {
    [KEY]: SEVEN_POINTS,
};

export const PICKER_PRESET_BOOK: PresetBook = {
    problems: PROBLEMS,
    menu: [
        {
            key: KEY,
            title: '🚚 이천 방향 — 집에서 이천까지 일곱 지점 (픽커)',
            desc: '7문제 · **지점은 인성 «칠지점» 그대로**, 요금만 P(원 ÷ 5). ' +
                  '🔴 **정답을 싣지 않는다** — 서버 필터는 수시로 바뀌므로, 원달앱이 판정하는 순간 그 폰의 필터로 ' +
                  '`node onedal-sim/scripts/pickerAlarmGrade.mjs` 가 채점한다. 원달앱은 **울리고 상세까지만** 간다 — 「수락하기」는 기사님 손가락이다',
        },
    ],
    requires: {},
    keys: Object.keys(PROBLEMS),
    aliases: { seven: KEY, '7': KEY },
};
