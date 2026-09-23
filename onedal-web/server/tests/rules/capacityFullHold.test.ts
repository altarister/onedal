import { readFileSync } from 'fs';
import { join } from 'path';
import { capacityFullHold } from '../../src/core/helpers';
import { APP_FILTER_KEYS } from '@onedal/shared';

/**
 * ⛔ **만석이면 콜 잡기를 멈춘다** (기사님 확정)
 *
 * 기사님: *"콜 잡는 걸 멈춰야 할 것 같아. 그리고 그 콜을 잡으면 안 될 것 같아.
 * 지금 1톤 화물 두 개가 잡힌 것 같은데, 어찌 보면 사고다."*
 *
 * 앱 파서 둘 다 빈 `allowedVehicleTypes: []` 를 **"전체 허용"**(서버 미응답 대비 오프라인
 * 안전망)으로 읽는다. 만석(예: 파레트 2 = 100박스로 100/100)을 빈 배열로 알리면
 * 한 신호에 뜻이 둘이라 정반대로 해석돼, 만석인데 모든 차종을 잡으러 든다.
 *
 * → 만석은 빈 배열이 아니라 **isActive=false 로 명시**해 멈춘다 (빈 필터는
 *   "제한 없음"이 아니라 "고장"이다 — 규칙 ④). 하차로 공간이 생기면
 *   재계산이 차종 목록을 되살리므로 자동 복귀한다. 직접콜(MANUAL)은 필터를
 *   타지 않으므로 기사님이 잡는 것은 막히지 않는다.
 *
 * 🔴 **묻는 것이 하나다 — 차종 목록뿐이다.** 국면 이름을 함께 받으면 «어느 국면에서는 안 멈춘다»는
 *    칸이 생기는데, 만석은 국면과 상관없이 만석이다. 받을 수 없으면 가를 수도 없다.
 */
describe('capacityFullHold — 실을 수 있는 차종이 없으면 멈춘다', () => {
    it('🔴 허용 차종이 비면 홀드', () => {
        expect(capacityFullHold({ allowedVehicleTypes: [] })).toBe(true);
    });

    it('차종이 남아 있으면 정상', () => {
        expect(capacityFullHold({ allowedVehicleTypes: ['오토바이', '승용차'] })).toBe(false);
    });

    it('목록 자체가 없으면(옛 필터) 홀드하지 않는다 — 없음과 빈 것은 다르다', () => {
        expect(capacityFullHold({})).toBe(false);
    });

    /** 🔴 국면 이름으로 가르지 않는다 — 시그니처에 없어야 못 가른다 */
    it('🔴 국면 칸을 받지 않는다 — 차종 목록만 본다', () => {
        const src = readFileSync(join(__dirname, '../../src/core/helpers.ts'), 'utf8');
        const at = src.indexOf('export function capacityFullHold');
        expect(at).toBeGreaterThan(-1);
        expect(src.slice(at, src.indexOf('):', at))).not.toContain('dispatchPhase');
    });
});

describe('연결 — 앱 응답이 만석 홀드를 탄다', () => {
    it('🔴 scrap 응답이 만석 홀드를 거친다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain('capacityFullHold');
    });
});

/**
 * 🔒 **«잠김»의 까닭이 둘인데 신호가 하나다** (기사님 · 실주행 04:58 오송읍).
 *
 * 앱은 판정 첫 줄에서 `isActive` 하나만 본다 — 꺼져 있으면 «필터 잠김»으로 돌아선다
 * (`InsungParser.judge` 조건 0). 그런데 서버는 그 스위치를 **두 가지 뜻**으로 끈다.
 *
 *   ⓐ **만석** — 실을 수 있는 차종이 없다 (위 `capacityFullHold`). 하차해야 풀린다
 *   ⓑ **선점 중** — 지금 한 콜을 심사하고 있다 (`routes/orders.ts`). 몇 초면 풀린다
 *
 * ── 실측 ──
 * 오송읍에서 콜 셋이 나가던 04:58, 앱은 목록에서 넷을 **계속 보고 있었는데** 하나도 안 잡았다.
 *
 *   04:58:22  🔒 [평가 보류] 오송읍 → 성곡동 39000원 — 필터 잠김(선점 중·대기)
 *   04:58:32  🔒 (또)   04:58:42  🔒 (또)   04:58:52  🔒 (또)
 *
 * 앞 콜의 결재가 끝나야 잠금이 풀려, 오송읍 셋을 잡는 데 **3분 25초**가 걸렸다.
 * 실제 배차망이면 그 사이 다 뺏긴다.
 *
 * 🔴 **`isActive` 는 손대지 않는다** — 만석은 «`isActive=false` 로 명시»가 기사님 확정이다(위 묶음).
 *    대신 **선점 잠금을 따로 실어** 앱이 둘을 가리게 한다. 그러면 앱은 «심사 중»일 때
 *    판정까지 해 두고 **클릭만 미룬다** — 앞 콜이 결재되는 즉시 다음을 잡는다.
 */
describe('🔒 앱이 «선점 중»과 «만석»을 가릴 수 있다', () => {
    it('🔴 앱에 실리는 칸 목록에 선점 잠금이 있다 — 없으면 앱은 두 잠금이 같아 보인다', () => {
        expect(APP_FILTER_KEYS as readonly string[]).toContain('evaluatingNow');
    });

    it('🔴 서버가 그 값을 실제로 싣는다 — 목록에만 있고 안 담으면 늘 «없음»이다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain('evaluatingNow');
    });

    /** 🔴 만석 규칙은 그대로다 — 이 고침이 그것을 건드리면 1톤 두 개를 잡는 사고로 돌아간다 */
    it('만석은 여전히 isActive=false 로 멈춘다', () => {
        expect(capacityFullHold({ allowedVehicleTypes: [] })).toBe(true);
    });
});
