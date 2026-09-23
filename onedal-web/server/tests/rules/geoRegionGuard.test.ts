import { readFileSync } from 'fs';
import { join } from 'path';
import { sidoOfPlaceName } from '@onedal/shared';

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const kakao = () => codeOnly(readFileSync(join(__dirname, '../../src/services/kakaoService.ts'), 'utf8'));

/**
 * 🗺️ **지역 불일치 방어는 지도에 묻는다 — 손으로 적은 시도 목록을 두지 않는다**
 *
 * 방어 자체는 필요하다. 카카오가 「광주 …」에 광주광역시를 주면 300km 어긋난 좌표가 콜에 박힌다.
 * 다만 «기대지역»을 **쿼리 첫 낱말**로 추측하면 틀린다.
 *
 * | 쿼리 | 첫 낱말로 재면 | 실제 |
 * |---|---|---|
 * | `이천 신둔면` | 표에 없다 → **방어가 안 돈다** | 경기 이천시 |
 * | `광주 초월읍` | 광주광역시 → **정답을 버린다** | 경기 광주시 |
 *
 * 무엇을 막나
 * - 시도 이름표를 코드에 손으로 적는 것 (`cityAliases` 도 같은 까닭으로 지도에서 센다 — «판단은 지도에서 센다»)
 * - 경기 광주시 콜이 광주광역시로 지오코딩되는 것 (원래 보호는 그대로여야 한다)
 */
describe('🗺️ 기대지역은 지도가 답한다', () => {

    it('🔴 그날 그 콜을 이제 찾는다 — 「광주 초월읍」은 경기다', () => {
        expect(sidoOfPlaceName('광주 초월읍')).toBe('경기');
    });

    it('🔴 원래 보호는 그대로다 — 광주광역시 결과는 여전히 버려야 한다', () => {
        // 기대는 경기인데 카카오가 광주광역시(시도 «광주»)를 주면 다르다
        expect(sidoOfPlaceName('광주 초월읍')).not.toBe('광주');
    });

    it('🔴 그동안 방어가 안 돌던 자리에서도 돈다 — 「이천 신둔면」', () => {
        expect(sidoOfPlaceName('이천 신둔면')).toBe('경기');
    });

    it('🔴 손으로 적은 시도 목록이 없다', () => {
        const src = kakao();
        expect(src).not.toMatch(/REGION_MAP/);
        expect(src).not.toMatch(/"광주광역시"/);
        expect(src).not.toMatch(/'광주광역시'/);
    });

    it('🔴 기대지역을 지도에서 읽는다', () => {
        expect(kakao()).toMatch(/sidoOfPlaceName\(/);
    });

    it('🔴 방어 자체는 남아 있다 — 기대와 다른 결과는 버린다', () => {
        expect(kakao()).toMatch(/expectedRegion/);
        expect(kakao()).toMatch(/continue;/);
    });
});

/**
 * 🏙️ **필터 「어디로」의 두 칸 — 시·도 · 시·군·구**
 *
 * 기사님 지적 (2026-09-23): *"필터 어디로 도로 표시 하고 있는데 의미가 도 + 특·광·특별자치시
 * 여야 할꺼 같고, 특·광·특별자치시를 선택하면 시 군 구에 구가 표현 되어야 할꺼 같아."*
 *
 * 그전에는 «서울·인천만 광역시»를 코드에 적어 두어 **대전이 경기도의 시처럼 줄에 섰고**,
 * 서울을 골라도 시·군·구 칸에 `서울` 하나뿐이라 **구를 고를 수 없었다.**
 */
describe('🏙️ 고를 수 있는 시·도 · 시·군·구는 지도가 답한다', () => {
    const geo = codeOnly(readFileSync(join(__dirname, '../../src/services/geoService.ts'), 'utf8'));

    it('🔴 «어느 것이 광역시인가»를 손으로 적지 않는다 — 동 사전(sidoOf)이 답한다', () => {
        expect(geo).not.toMatch(/head === '서울'/);
        expect(geo).not.toMatch(/isMetro/);
        expect(geo).toMatch(/sidoOf\(parent\)/);
    });

    it('🔴 특별시 · 광역시는 구를 펼치고 맨 앞에 시 전체를 둔다', () => {
        /* 시 전체를 빼면 서울 25개 구 중 하나만 고르게 되어 나머지 24개 구 콜이 통째로 막힌다 */
        expect(geo).toMatch(/\[sido, \.\.\.cities\]/);
    });

    it('🔴 화면 라벨이 칸의 내용과 같다 — 도만 있는 칸이 아니다', () => {
        const modal = codeOnly(readFileSync(
            join(__dirname, '../../../client-app/src/components/dashboard/OrderFilterModal.tsx'), 'utf8'));
        expect(modal).toMatch(/<PickLayer label="🎯 시·도"/);
        expect(modal).not.toMatch(/<PickLayer label="🎯 도"/);
    });
});
