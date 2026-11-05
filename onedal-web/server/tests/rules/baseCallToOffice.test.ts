import { readFileSync } from 'fs';
import { join } from 'path';
import { mergeBaseCall, mergeEvidence, officeOrderOf } from '@onedal/shared';
import type { BaseCall } from '@onedal/shared';

/**
 * 🔁 **BaseCall → 옛 콜 — 비교 기준의 지금 값이 그대로 나온다** (계획서 B4).
 * 플러그인이 채울 모양을 손으로 적어 넣고, 문제지(callSnapshotCases)에 고정한 값과 견준다.
 * 🔴 ts-jest 가 타입까지 본다. 실제 플러그인이 채운 값은 C 묶음이 본다.
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../../../shared/src/network/callSnapshotCases.json'), 'utf8'));
const empty = (over: Partial<BaseCall> = {}): BaseCall => ({
    id: 'c1', targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines: [] }, load: {}, time: {}, job: {}, ...over,
});
/** 문제지 앱 칸 — 파서 칸만 견준다 (type 은 보고 봉투) */
const fromSheet = (index: number, call: BaseCall) => {
    const { type, ...expected } = SHEET.app[index].expect;
    const { id, targetApp, ...got } = officeOrderOf(call);
    return { got, expected, type };
};

describe('🔁 문제지의 지금 값이 그대로 나온다', () => {
    it('인성 — 왕복 줄 (하차는 앞글자를 뗀 동)', () => {
        const { got, expected } = fromSheet(1, empty({
            route: { listRegion: { pickup: '용인모현면', dropoff: '송파' }, pickup: {}, dropoff: {}, pickupDistance: 38.7, deliveryDistance: 10 },
            money: { lines: [{ kind: 'income', won: 57700 }] },
            load: { vehicleType: '라' },
            time: { pickup: { text: '@밤9시', reserved: true, day: 0, at: '21:00' } },
        }));
        expect(got).toEqual(expected);
    });
    it('화물24시 — 목록 요금 · 꼬리표 · 예약 표시', () => {
        const e = SHEET.app[4].expect;
        const { got, expected } = fromSheet(4, empty({
            targetApp: 'hwamul24',
            route: { listRegion: { pickup: e.pickup, dropoff: e.dropoff }, pickup: {}, dropoff: {}, pickupDistance: e.pickupDistance },
            money: { lines: [{ kind: 'total', won: e.fare }, { kind: 'freight', won: e.fare }] },
            load: { vehicleType: e.vehicleType },
            time: { pickup: { reserved: e.reserved, day: e.reservedDay }, postTime: e.postTime },
            job: { tagsText: e.tagsText },
        }));
        expect(got).toEqual(expected);
    });
    it('픽커 — 수입 · 크기 · 꼬리표', () => {
        const e = SHEET.app[6].expect;
        const { got, expected } = fromSheet(6, empty({
            targetApp: 'kakaopicker',
            route: { listRegion: { pickup: e.pickup, dropoff: e.dropoff }, pickup: {}, dropoff: {}, pickupDistance: e.pickupDistance },
            money: { lines: [{ kind: 'income', won: e.fare }, { kind: 'deliveryFee', won: 2000 }] },
            load: { itemSize: e.itemSize },
            time: { pickup: { reserved: e.reserved } },
            job: { tagsText: e.tagsText },
        }));
        expect(got).toEqual(expected);
    });
});

describe('🔁 칸 규칙', () => {
    it('찾은 칸만 싣는다 — 빈 칸을 실으면 앞 기억을 지운다', () => {
        expect(officeOrderOf(empty())).toEqual({ id: 'c1', targetApp: 'insung' });
    });
    it('요금 — 목록 요금 · 수입 · 운송료 차례, 정수로', () => {
        expect(officeOrderOf(empty({ money: { lines: [{ kind: 'income', won: 34650.4 }, { kind: 'total', won: 45000 }] } })).fare).toBe(45000);
        expect(officeOrderOf(empty({ money: { lines: [{ kind: 'freight', won: 60000 }, { kind: 'income', won: 34650.4 }] } })).fare).toBe(34650);
        expect(officeOrderOf(empty({ money: { lines: [{ kind: 'freight', won: 60000 }] } })).fare).toBe(60000);
    });
    it('상세 주소가 있으면 상세 주소, 없으면 목록 동', () => {
        const call = empty({ route: { listRegion: { pickup: '경안동' }, pickup: { addressDetail: '경기 광주시 경안동 1-2' }, dropoff: {} } });
        expect(officeOrderOf(call).pickup).toBe('경기 광주시 경안동 1-2');
        expect(officeOrderOf({ ...call, route: { ...call.route, pickup: {} } }).pickup).toBe('경안동');
    });
    it('🔴 옛 목록에 없는 결제 값은 안 넘긴다 — 화면이 안 바뀐다', () => {
        expect(officeOrderOf(empty({ money: { lines: [], paymentType: '선/착불' } })).paymentType).toBeUndefined();
        expect(officeOrderOf(empty({ money: { lines: [], paymentType: '착불' } })).paymentType).toBe('착불');
    });
    it('상하차 방법은 옛 연락처 칸에 안 섞는다', () => {
        const got = officeOrderOf(empty({ route: { pickup: { loadingMethod: '지' }, dropoff: { phone1: '010', loadingMethod: '수' } } }));
        expect(got.pickupDetails).toBeUndefined();
        expect(got.dropoffDetails).toEqual([{ phone1: '010' }]);
    });
});

describe('🔁 합치기', () => {
    it('칸별로 합친다 — 뒤 보고에 없는 칸은 남는다', () => {
        const list = empty({ route: { listRegion: { pickup: '경안동' }, pickup: {}, dropoff: {}, pickupDistance: 3 }, load: { vehicleType: '다' } });
        const detail = empty({ route: { pickup: { addressDetail: '경기 광주시 경안동 1-2', phone1: '010' }, dropoff: {} }, job: { detailMemo: '적요' } });
        const got = mergeBaseCall(list, detail);
        expect(got.route.pickupDistance).toBe(3);
        expect(got.route.pickup.addressDetail).toBe('경기 광주시 경안동 1-2');
        expect(got.load.vehicleType).toBe('다');
        expect(got.job.detailMemo).toBe('적요');
    });
    it('목록 동은 처음 값을 지킨다', () => {
        const got = mergeBaseCall(
            empty({ route: { listRegion: { pickup: '경안동' }, pickup: {}, dropoff: {} } }),
            empty({ route: { listRegion: { pickup: '다른동', dropoff: '한남동' }, pickup: {}, dropoff: {} } }),
        );
        expect(got.route.listRegion).toEqual({ pickup: '경안동', dropoff: '한남동' });
    });
    it('금액은 종류별로 합친다 — 같은 종류는 나중 값', () => {
        const got = mergeBaseCall(
            empty({ money: { lines: [{ kind: 'income', won: 1000 }, { kind: 'fee', rate: '23%' }] } }),
            empty({ money: { lines: [{ kind: 'income', won: 2000 }] } }),
        );
        expect(got.money.lines).toEqual([{ kind: 'fee', rate: '23%' }, { kind: 'income', won: 2000 }]);
    });
    it('🔴 모르는 금액 종류는 unknown 으로 — 요금으로 안 읽는다', () => {
        const got = mergeBaseCall(undefined, empty({ money: { lines: [{ kind: '거리료' as 'unknown', won: 5000 }] } }));
        expect(got.money.lines).toEqual([{ kind: 'unknown', won: 5000, label: '거리료' }]);
        expect(officeOrderOf(got).fare).toBeUndefined();
    });
    it('기록은 덮지 않고 더한다', () => {
        const got = mergeEvidence({ seen: [{ at: '1', screen: 'newList', rawText: '왕복/낼7시/송파' }] }, { seen: [{ at: '2', screen: 'newCall' }] });
        expect(got.seen.map((line) => line.at)).toEqual(['1', '2']);
        expect(mergeEvidence(undefined, { seen: [{ at: '1' }] }).seen.length).toBe(1);
    });
});
