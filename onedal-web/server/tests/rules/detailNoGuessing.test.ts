import { readFileSync } from 'fs';
import { join } from 'path';
import { pageFieldOf, pageFareOf, normalizeVehicleType } from '@onedal/shared';
import { applySoloRoute } from '../../src/services/routeComposer';

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

/**
 * 💰 **요금 — 원달앱과 같은 정의 표 · 같은 숫자 규칙** (3단계 1 · onedal-69 «가»).
 *    공통 문제지(shared/src/pageReadCases.json)를 서버도 풀어 원달앱 PageFieldReadTest 와 같은 답을 낸다.
 *    숫자 규칙은 원달앱 PageFieldRead.fareOf 와 같다 — 쉼표 떼고 정수 · 0 이하는 못 읽음(만 · 천 · 축약을 짐작하지 않는다).
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/pageReadCases.json'), 'utf8')) as
    { cases: Array<{ network: any; page: any; field: any; part?: string; texts: string[]; expect: string | null; fare?: number | null; why: string }> };

describe('💰 상세 요금 — 정의 표대로', () => {
    it('🔴 상세 길이 요금을 짐작 함수가 아니라 정의 표로 읽는다', () => {
        const detail = read('routes/detail.ts');
        expect(detail).not.toMatch(/parseMockupFare/);
        expect(detail).toMatch(/pageFareOf\(targetApp, 'detail', rawText\)/);
        expect(read('utils/parser.ts')).not.toMatch(/parseMockupFare/);
    });
    it.each(SHEET.cases.map(c => [`${c.network} ${c.page} ${c.field} — ${c.why}`, c] as const))('공통 문제지: %s', (_, c) => {
        expect(pageFieldOf(c.network, c.page, c.field, c.texts, c.part)).toBe(c.expect);   // 조각(part)이 있는 줄은 그 조각으로
        if (c.fare !== undefined) expect(pageFareOf(c.network, c.page, c.texts)).toBe(c.fare);   // 숫자로 바꾼 값도 원달앱 fareOf 와 같다
    });
    it('숫자 규칙 — 원달앱 fareOf 와 같다', () => {
        expect(pageFareOf('insung', 'detail', '요금 : 50,000(카드)')).toBe(50000);
        expect(pageFareOf('insung', 'detail', '상태 : 신규\n요금 : 150,000(카드)\n구분 : 편도')).toBe(150000);   // 인성 원문은 줄바꿈으로 온다
        expect(pageFareOf('hwamul24', 'detail', ['화물번호:3-9483-2159', '운송료', '60,000원', '수납금액', '65,144원'])).toBe(60000);
        expect(pageFareOf('insung', 'detail', '요금 : 4.5만')).toBeNull();   // 축약을 짐작하지 않는다 · «4» 로 틀리게 읽지도 않는다(읽는 법이 숫자 뒤 «.» 를 막음)
        expect(pageFareOf('insung', 'detail', '요금 : 0')).toBeNull();
        expect(pageFareOf('insung', 'detail', '차량 : 다마스')).toBeNull();
        expect(pageFareOf('kakaopicker', 'detail', '최종 수익 2,387')).toBeNull();   // 픽커 상세 요금은 읽는 법이 없다
    });
});

/**
 * 🚚 **차종 — 인성 상세 «차량 : 트럭-1t» 를 판정 차종 이름으로** (3단계 1 · onedal-f5 8df5a84f 리뷰).
 *    상세 길은 원달앱 값 · 목록 차종이 없을 때만 정의 표의 vehicleType 읽는 법으로 읽는다. «트럭-1t» 를 판정 차종 이름(1t)으로 못 바꾸면
 *    «차종 불일치»로 1t 콜을 떨군다.
 */
describe('🚚 상세 차종 — 정의 표대로', () => {
    it('🔴 «트럭-1t» → 1t · 사전에 없는 톤수는 null', () => {
        expect(normalizeVehicleType('트럭-1t')).toBe('1t');
        expect(normalizeVehicleType('트럭-2.5t')).toBe('2.5t');
        expect(normalizeVehicleType('트럭-1.5t')).toBeNull();
        expect(normalizeVehicleType('다마스')).toBe('다마스');
    });
    it('🔴 상세 길이 원달앱 · 목록 차종이 없을 때만 정의 표로 차종을 읽는다', () => {
        expect(read('routes/detail.ts')).toMatch(/if \(!pendingOrder\.vehicleType\) \{\s*pendingOrder\.vehicleType = pageFieldOf\(targetApp, 'detail', 'vehicleType', rawText\)/);
    });
});

/**
 * 📏 **거리 칸(distanceKm)은 카카오가 잰 배송 거리다** (reviews/34 3단계 2 · 기사님 «가» · onedal-69 «가»).
 *    원달앱은 거리를 안 싣고, 옛 짐작은 원문의 이름표 없는 소수 · 공백 사이 두 자리 숫자를 거리로 잡았다 — 관제웹 심사석 «Nkm»가 그 숫자였다.
 *    이제 단독 배송을 잰 자리(경로 짜기 · 확정 뒤 재기)에서 kakaoSoloDistanceKm 와 같은 값을 적는다. 못 재면 칸 없음.
 */
describe('📏 거리 칸 — 카카오 실측', () => {
    it('🔴 상세 길이 원문에서 거리를 짐작하지 않는다', () => {
        expect(read('routes/detail.ts')).not.toMatch(/parseMockupDistance/);
        expect(read('utils/parser.ts')).not.toMatch(/parseMockupDistance/);
    });
    it('🔴 단독 경로를 재면 거리 칸 = 카카오 배송 거리(접근 구간 뺀 값)', () => {
        const holder: any = { id: 'o-dist' };
        applySoloRoute(holder, { distance: 25000, duration: 1800, approachDistance: 5000, approachDuration: 300, polyline: [] } as any);
        expect(holder.kakaoSoloDistanceKm).toBe(20);
        expect(holder.distanceKm).toBe(holder.kakaoSoloDistanceKm);
    });
    it('🔴 확정 뒤 단독 배송을 다시 재는 자리도 거리 칸을 같이 적는다', () => {
        expect(read('services/dispatchEngine.ts')).toMatch(/o\.kakaoSoloDistanceKm = solo\.km;\s*o\.distanceKm = solo\.km;/);
    });
});
