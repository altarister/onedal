import { normalizeVehicleType } from '@onedal/shared';

/**
 * 🚚 **차종 줄임말 · «트럭-» 글자의 답을 묶는다** — 맞추는 길을 정의 표 낱말 하나로 옮겨도 답이 그대로인가.
 *
 * 줄임말(«오» · «다» · «1.4» …)과 인성 확정 뒤 상세 «차량 : 트럭-1t» 는 판정 · 적재 · 차종 거르기가 같은 함수로 읽는다.
 * 사전에 없는 톤수(«트럭-14t» · «트럭-1.5t»)는 가까운 차종으로 때우지 않고 null 이다 (규칙 ④).
 */
describe('🚚 차종 줄임말 · «트럭-» 글자 → 우리 차종', () => {
    it.each([
        ['오', '오토바이'], ['바이크', '오토바이'], ['오토', '오토바이'],
        ['다', '다마스'], ['라', '라보'], ['승', '승용차'],
        ['1.4', '1.4t'], ['2.5', '2.5t'], ['3.5', '3.5t'],
    ])('줄임말 %s → %s', (raw, vehicle) => {
        expect(normalizeVehicleType(raw)).toBe(vehicle);
    });

    it.each([
        ['트럭-1t', '1t'], ['트럭-1.4t', '1.4t'], ['트럭-2.5t', '2.5t'], ['트럭-3.5t', '3.5t'],
        ['트럭-5t', '5t'], ['트럭-11t', '11t'], ['트럭-25t', '25t'],
    ])('인성 상세 %s → %s', (raw, vehicle) => {
        expect(normalizeVehicleType(raw)).toBe(vehicle);
    });

    it.each(['트럭-14t', '트럭-18t', '트럭-1.5t', '트럭-'])('사전에 없는 톤수 %s → null', raw => {
        expect(normalizeVehicleType(raw)).toBeNull();
    });
});
