/**
 * 🚚 **단독 배송 주행 실측 — A단계** (기사님 확정 2026-09-01)
 *
 * 기사님: *"KEEP 직후 그 콜의 단독 배송주행을 카카오로 한 번 재서 저장 후 각 콜마다
 * 디스플레이한다."*
 *
 * 하차 마감은 `상차 완료 + 단독 배송주행 × 150%` 다. 그런데 합짐 콜은 병합 경로만 재느라
 * 그 주행을 **구조적으로 가질 수 없었고**, 매번 «배송주행 추정(일반값)» 딱지가 붙었다.
 * 이 함수가 그 구멍 하나만 메운다 — 그 이상을 만지면 병합 경로가 무너진다.
 */
jest.mock('../../src/services/kakaoService', () => ({
    calculateSoloRoute: jest.fn(),
    calculateDetourRoute: jest.fn(),
}));
import { measureSoloDelivery } from '../../src/services/routeComposer';
import { calculateSoloRoute } from '../../src/services/kakaoService';

const mockedSolo = calculateSoloRoute as jest.Mock;

/** 상차지 → 하차지 33.5km · 42분 */
const KAKAO_OK = { distance: 33_500, duration: 2_520, approachDistance: 0, approachDuration: 0 };

const call = (over: object = {}) => ({
    id: 'order-5aa140',
    pickupX: 127.31, pickupY: 37.36,
    dropoffX: 127.38, dropoffY: 37.29,
    ...over,
}) as any;

describe('measureSoloDelivery', () => {
    beforeEach(() => mockedSolo.mockReset());

    it('상차지 → 하차지를 재서 km·분을 낸다', async () => {
        mockedSolo.mockResolvedValue(KAKAO_OK);
        expect(await measureSoloDelivery(call())).toEqual({ km: 33.5, minutes: 42 });
    });

    it('🔴 기점은 현위치가 아니라 상차지다 — 차가 움직여도 마감이 안 흔들려야 한다', async () => {
        mockedSolo.mockResolvedValue(KAKAO_OK);
        await measureSoloDelivery(call());
        const [px, py, dx, dy, driverLoc] = mockedSolo.mock.calls[0];
        expect([px, py, dx, dy]).toEqual([127.31, 37.36, 127.38, 37.29]);
        expect(driverLoc).toBeNull();   // 넘기면 카카오가 접근 구간을 섞는다
    });

    it('🔴 이미 잰 콜은 카카오를 부르지 않는다 — 한 콜에 한 번', async () => {
        expect(await measureSoloDelivery(call({ kakaoSoloDurationMin: 42 }))).toBeNull();
        expect(mockedSolo).not.toHaveBeenCalled();
    });

    it('좌표를 모르면 재지 않는다 — 없는 값을 지어내지 않는다 (규칙 ④)', async () => {
        expect(await measureSoloDelivery(call({ dropoffX: null }))).toBeNull();
        expect(mockedSolo).not.toHaveBeenCalled();
    });

    it('카카오가 실패하면 null — 추정(거리 환산)이 그대로 일한다', async () => {
        mockedSolo.mockRejectedValue(new Error('카카오에러: 경로 없음'));
        expect(await measureSoloDelivery(call())).toBeNull();
    });

    it('0분짜리 배송은 없다 — 값으로 받지 않는다', async () => {
        mockedSolo.mockResolvedValue({ ...KAKAO_OK, duration: 20 });   // 20초 → 0분
        expect(await measureSoloDelivery(call())).toBeNull();
    });

    it('🔴 콜 객체를 건드리지 않는다 — 부르는 쪽이 어디에 적을지 정한다', async () => {
        mockedSolo.mockResolvedValue(KAKAO_OK);
        const c = call({ routePolyline: [[1, 2]], sectionDriveMin: [10, 20], totalDistanceKm: 99 });
        const before = JSON.stringify(c);
        await measureSoloDelivery(c);
        expect(JSON.stringify(c)).toBe(before);
    });
});

/**
 * 🔒 **`applySoloRoute` 로 대신하지 않는다** — 그것은 폴리라인·구간 주행분·닻까지 덮어쓴다.
 * 합짐 홀더에 대고 부르면 **지금 그리고 있는 병합 경로가 단독 경로로 바뀐다.**
 * 이 레포가 이미 여러 번 당한 형태라(«값이 남의 이름에 붙었다» · 버그 대장 #60) 자리로 막는다.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
describe('규칙: KEEP 직후 실측은 좁은 함수로만 한다', () => {
    it('🔴 KEEP 처리에서 applySoloRoute 를 부르지 않는다', () => {
        const src = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8');
        const keep = src.slice(src.indexOf('const isKeep ='), src.indexOf('// ✅ 콜 배정이 끝난 뒤'));
        expect(keep).toContain('measureSoloDelivery(');
        expect(keep).not.toContain('applySoloRoute(');
    });
});
