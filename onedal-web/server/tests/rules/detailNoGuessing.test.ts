import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔎 **서버는 상세 원문에서 칸을 짐작하지 않는다** (reviews/34 3단계 · 기사님 «가»).
 *    원달앱이 실어 보낸 칸을 쓰고, 없는 칸은 shared 배차망 정의 표(NETWORK_PAGES)의 읽는 법으로만 읽는다.
 *    짐작은 원문 아무 자리의 «다» 한 글자 · «1t» 를 차종으로 잡아 «차종 불일치»로 좋은 콜을 떨궜다.
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('🔎 상세 원문 짐작 없음', () => {
    it('🔴 차종 — 상세 길이 원문에서 차종을 짐작하지 않는다(목록 차종 · 원달앱 값만)', () => {
        expect(read('routes/detail.ts')).not.toMatch(/parseMockupVehicleType/);
        expect(read('utils/parser.ts')).not.toMatch(/parseMockupVehicleType/);
    });
});
