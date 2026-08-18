import { defaultCargoByVehicle, cargoPoints, VEHICLE_CAPACITY } from '@onedal/shared';

/**
 * 🚚 **차종이 곧 기본 짐** — 통화 전 미리 눌러 둘 단위·수량 (기사님 확정 2026-08-18)
 *
 * 기사님 (2026-08-12에도 같은 말씀): *"1톤 화물이면 **파레트**가 기본적일 거고
 * 그렇지 않다면 **라면박스 몇 개** 이렇게 표시할 수 있을 듯."*
 *
 * 서버는 이미 신고가 없으면 `VEHICLE_CAPACITY[차종]` 을 적재로 잡는다
 * (`computeLoadedPoints`). 통화 시트만 빈칸이라 **화면과 서버가 다른 값을 보고 있었다.**
 * 이 함수가 그 둘을 같은 값으로 맞춘다.
 */
describe('defaultCargoByVehicle — 차종 정원을 기본 짐으로', () => {
    it('소형은 라면박스 + 수작업, 수량은 그 차 한 대 분량', () => {
        expect(defaultCargoByVehicle('오토바이')).toEqual({ unit: '라면박스', quantity: 1, handling: '수작업' });
        expect(defaultCargoByVehicle('승용차')).toEqual({ unit: '라면박스', quantity: 5, handling: '수작업' });
        expect(defaultCargoByVehicle('다마스')).toEqual({ unit: '라면박스', quantity: 30, handling: '수작업' });
        expect(defaultCargoByVehicle('라보')).toEqual({ unit: '라면박스', quantity: 40, handling: '수작업' });
    });

    /** 기사님 2026-08-18: *"파레트를 사람 손으로 내리기는 너무 어려우니까."* */
    it('🔴 1t 은 파레트 2개 + **지게차** — 파레트를 손으로 내리지 않는다', () => {
        expect(defaultCargoByVehicle('1t')).toEqual({ unit: '파레트', quantity: 2, handling: '지게차' });
    });

    /**
     * 🔴 이게 이 함수의 존재 이유다 — 화면이 눌러 둔 값과 서버가 추정하는 적재가
     *    **같은 숫자**여야 한다. 어긋나면 화면이 조용히 거짓말한다.
     */
    it('🔴 눌러 둔 값의 박스 환산 = 서버가 잡는 적재(VEHICLE_CAPACITY)', () => {
        for (const v of ['오토바이', '승용차', '다마스', '라보', '1t']) {
            const d = defaultCargoByVehicle(v)!;
            expect(cargoPoints({ unit: d.unit, quantity: d.quantity } as any)).toBe(VEHICLE_CAPACITY[v]);
        }
    });

    it('모르는 차종이면 null — 지어내지 않는다 (규칙 ④)', () => {
        expect(defaultCargoByVehicle('')).toBeNull();
        expect(defaultCargoByVehicle(null)).toBeNull();
        expect(defaultCargoByVehicle('경운기')).toBeNull();
    });
});

/**
 * 순서: **저장값 > 적요 > 차종 기본값** — 통화 시트가 지켜야 하는 규칙.
 * 적요는 이 콜의 실제 정보이고, 차종은 "그 차 한 대 분량"이라는 짐작이라 뒤에 온다.
 */
describe('통화 시트 — 미리 채움의 순서', () => {
    const sheet = () => require('fs').readFileSync(
        require('path').join(__dirname, '../../../client-app/src/components/dashboard/StopCallSheet.tsx'), 'utf8');

    it('차종 기본값은 적요 힌트가 없을 때만 누른다', () => {
        expect(sheet()).toMatch(/!hasCargoHints\(h\)\s*\n?\s*\?\s*defaultCargoByVehicle/);
    });

    it('눌러 둔 근거를 화면에 남긴다 (어디서 온 값인지)', () => {
        expect(sheet()).toMatch(/차종 기본값/);
    });
});
