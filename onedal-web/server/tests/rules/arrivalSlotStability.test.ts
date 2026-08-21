import { readFileSync } from 'fs';
import { join } from 'path';
import { buildArrivalSlots, slotBaseMs } from '@onedal/shared';

const sheet = () => readFileSync(join(__dirname,
    '../../../client-app/src/components/dashboard/StepSheetMock.tsx'), 'utf8');   // 🏗️ 옛 시트 철거(2026-08-21)

/**
 * 🕐 **도착시간 격자 — 흔들리지 않는 기준** (기사님 실측 2026-08-19~21)
 *
 * 옛 시트는 격자를 자기 시각(Date.now)으로 만들어 분 틱마다 칸이 밀렸고,
 * 저장 약속을 추천이 덮었다. 새 구조에서 그 사고들의 방어 자리가 바뀌었다:
 *   · 칸 생성 규칙 → shared `buildArrivalSlots` (순수 함수 — 아래에서 직접 검사)
 *   · 격자의 밑값(도착 예상·약속) → **저장된 행** — 시트는 계산하지 않는다 (규칙 ③)
 *   · 저장된 약속·"부터" → 격자가 읽어 불을 켠다 (추천이 덮을 손댐 개념 자체가 소멸)
 */
describe('격자 — 저장된 행이 밑값이다 (시트 계산 금지)', () => {
    it('🔴 격자 밑값이 저장된 행에서 온다 — Date.now 로 만들지 않는다', () => {
        expect(sheet()).toMatch(/밑값\(도착 예상\)은 \*\*저장된 행\*\*에서 온다/);
    });

    it('🔴 저장된 약속과 가장 가까운 칸에 불이 켜진다', () => {
        expect(sheet()).toMatch(/저장된 약속과 가장 가까운 칸/);
    });

    it('🔴 저장된 "부터"(기간)도 격자가 읽는다 — 양 끝이 다 보여야 한다', () => {
        expect(sheet()).toMatch(/promised_arrival_from_at/);
    });
});

describe('칸 생성 — buildArrivalSlots (순수 함수)', () => {
    const NOW = Date.parse('2026-08-21T04:00:00Z');

    it('🔴 도착 예상보다 이른 칸은 만들지 않는다 — 지킬 수 없는 약속', () => {
        const slots = buildArrivalSlots(NOW, 47);          // 도착까지 47분
        for (const s of slots) expect(Date.parse(s.iso)).toBeGreaterThanOrEqual(NOW + 47 * 60_000);
    });

    it('첫 칸 = 지킬 수 있는 가장 이른 시각, 이후 30분 간격 (여유가 늘 같다 — #23 되돌림)', () => {
        const slots = buildArrivalSlots(NOW, 10);
        expect(Date.parse(slots[0].iso)).toBe(NOW + 10 * 60_000);
        expect(Date.parse(slots[1].iso) - Date.parse(slots[0].iso)).toBe(30 * 60_000);
    });

    it('같은 입력이면 같은 칸이다 — 분 틱에 흔들리지 않는다', () => {
        expect(buildArrivalSlots(NOW, 20)).toEqual(buildArrivalSlots(NOW, 20));
    });
});

/**
 * 🔄 **재약속 모드 — 다섯 칸이 전부 과거일 때만 지금 기준으로 다시 편다** (2026-08-22 실측)
 *
 * 자정을 걸친 콜(문산읍 — 약속 22:20이 8시간 깨짐)의 격자가 22:20~00:20 전부
 * 취소선이라 **재약속을 잡을 칸이 없었다.** 통화로 확정하는 것이 이 제품의 순서인데
 * 통화의 도구가 죽어 있던 것.
 *
 * 🔴 안정성 규칙과의 경계: 격자가 **살아 있으면**(누를 칸이 하나라도 미래면)
 *    저장된 밑값 그대로다 — 분 틱에 흔들리지 않는다. 전부 과거가 된 격자만
 *    다시 편다 (그 격자에는 지킬 안정성이 남아 있지 않다).
 */
describe('slotBaseMs — 격자 밑값의 수명', () => {
    const NOW = Date.parse('2026-08-22T05:00:00+09:00');

    it('🔴 격자가 살아 있으면 저장된 밑값 그대로 — 분 틱에 흔들리지 않는다', () => {
        const pred = new Date(NOW - 60 * 60_000).toISOString();     // 1시간 전 — 뒤 칸들은 아직 미래
        expect(slotBaseMs(pred, NOW, 29)).toBe(Date.parse(pred));
    });

    it('🔴 다섯 칸 전부 과거(깨진 약속·자정 걸침)면 지금+남은 주행으로 다시 편다', () => {
        const pred = new Date(NOW - 7 * 3600_000).toISOString();    // 어제 저녁 — 전부 취소선이던 그 격자
        expect(slotBaseMs(pred, NOW, 29)).toBe(NOW + 29 * 60_000);
    });

    it('주행을 모르면 지금부터 — 없는 숫자를 지어내지 않는다 (규칙 ④)', () => {
        const pred = new Date(NOW - 7 * 3600_000).toISOString();
        expect(slotBaseMs(pred, NOW, null)).toBe(NOW);
    });
});
