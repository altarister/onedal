import { readFileSync } from 'fs';
import { join } from 'path';
import { capacityFullHold } from '../../src/core/helpers';

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
