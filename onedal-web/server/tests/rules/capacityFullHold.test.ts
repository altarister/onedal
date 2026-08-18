import { readFileSync } from 'fs';
import { join } from 'path';
import { capacityFullHold } from '../../src/core/helpers';

/**
 * ⛔ **만석이면 콜 잡기를 멈춘다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"콜 잡는 걸 멈춰야 할 것 같아. 그리고 그 콜을 잡으면 안 될 것 같아.
 * 지금 1톤 화물 두 개가 잡힌 것 같은데, 어찌 보면 사고다."*
 *
 * 실측: 상차 신고(파레트 2 = 100박스)로 적재가 100/100 이 되자 서버가
 * "실을 수 있는 차종 없음"의 뜻으로 `allowedVehicleTypes: []` 를 내려보냈다.
 * 그런데 앱 파서 둘 다 빈 배열을 **"전체 허용"**(서버 미응답 대비 오프라인
 * 안전망)으로 읽는다 — 한 신호에 뜻이 둘이라 정반대로 해석됐다.
 * 만석인데 모든 차종을 잡으러 드는 사고다.
 *
 * → 만석은 빈 배열이 아니라 **isActive=false 로 명시**해 멈춘다 (빈 필터는
 *   "제한 없음"이 아니라 "고장"이다 — 규칙 ④). 하차로 공간이 생기면
 *   재계산이 차종 목록을 되살리므로 자동 복귀한다. 직접콜(MANUAL)은 필터를
 *   타지 않으므로 기사님이 잡는 것은 막히지 않는다.
 */
describe('capacityFullHold — 실을 수 있는 차종이 없으면 멈춘다', () => {
    it('🔴 합짐 중 허용 차종이 비면 홀드', () => {
        expect(capacityFullHold({ dispatchPhase: 'GATHERING', allowedVehicleTypes: [] })).toBe(true);
    });

    it('차종이 남아 있으면 정상', () => {
        expect(capacityFullHold({ dispatchPhase: 'GATHERING', allowedVehicleTypes: ['오토바이', '승용차'] })).toBe(false);
    });

    it('첫짐(STANDBY)에서 비어 있어도 홀드 — 빈 필터는 고장이다, 열어 두지 않는다', () => {
        expect(capacityFullHold({ dispatchPhase: 'STANDBY', allowedVehicleTypes: [] })).toBe(true);
    });

    it('목록 자체가 없으면(옛 필터) 홀드하지 않는다 — 없음과 빈 것은 다르다', () => {
        expect(capacityFullHold({ dispatchPhase: 'GATHERING' })).toBe(false);
    });
});

describe('연결 — 앱 응답과 리허설이 같은 규칙을 탄다', () => {
    it('🔴 scrap 응답이 만석 홀드를 거친다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain('capacityFullHold');
    });

    it('🔴 리허설 사전검사가 차종·요금 필터도 본다 — 경로 순서만 보지 않는다', () => {
        const rehearsal = readFileSync(join(__dirname, '../../../scripts/rehearsal.mjs'), 'utf8');
        expect(rehearsal).toContain('allowedVehicleTypes');
        expect(rehearsal).toContain('minFare');
    });
});
