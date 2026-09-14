import { describe, expect, it } from 'vitest';
import { preflightRows, SIM_DEFAULT_START } from '../src/pages/preflightRows';
import type { PreflightState, PhoneCheckRow } from '../src/pages/preflightRows';
import { SIM_NETS } from '@altari/ui-simulators';

/**
 * 🧪 **테스트 시작 전 점검 줄** (기사님 지시 2026-09-14 — «먼발치에서 근본 원인을 찾아 고친다»)
 *
 * 그날 콜이 안 잡힌 두 번은 조건이 틀어져 있었는데 점검은 초록이었다 — 점검이 «서버가 정한 값»만 봤다.
 *   14:41  폰이 옛 필터 · 직접 모드로 돌았다
 *   14:54  실제 상차 반경 4.55km(자동) · 시뮬레이터가 첫 문제를 기본 위치(경기 광주시)에서 냈다(7.2km)
 * 이 검사는 «폰·시뮬레이터가 실제로 쓰는 값»을 비교하는 줄이 빨간불을 켜는지 본다.
 */

const HOME = { x: 127.29444030053442, y: 37.376686997522675, isFallback: true };
const okPhone: PhoneCheckRow = {
    name: '1234', appVersion: '2.9.4-radiusdouble',
    mode: { want: 'AUTO', got: 'AUTO', ok: true },
    filter: { state: 'same', ok: true, ageSec: 0 },
    contact: { ageSec: 3, ok: true },
};
const state = (over: Partial<PreflightState> = {}): PreflightState => ({
    destinationCity: '이천시', destinationRadiusKm: 10, homeAddress: '경기도 광주 초월 동광뷰엘',
    isSharedMode: false, activeCalls: 0, bootedAt: '2026-09-14T05:30:00.000Z',
    phones: [okPhone], pickupRadiusKmEffective: 10, radiusAuto: false, lastFix: HOME,
    ...over,
});
const req = SIM_NETS.insung.presetBook.requires['칠지점'];
const bad = (rows: ReturnType<typeof preflightRows>) => rows.filter(r => !r.ok).map(r => r.what);

describe('🧪 시작 전 점검 — 폰·시뮬레이터가 실제로 쓰는 값', () => {
    it('「7지점 한 바퀴」에 조건이 등록돼 있다 — 없으면 점검 줄이 아예 안 뜬다', () => {
        expect(req).toEqual({ destinationCity: '이천시', minPickupRadiusKm: 15, homeAddress: '경기도 광주 초월 동광뷰엘' });
    });

    it('🔴 폰이 옛 필터 · 다른 모드로 돌면 빨간불 (14:41)', () => {
        const rows = preflightRows(req, state({
            pickupRadiusKmEffective: 15,
            phones: [{ ...okPhone, mode: { want: 'AUTO', got: 'MANUAL', ok: false }, filter: { state: 'stale', ok: false, ageSec: 240 } }],
        }), SIM_DEFAULT_START);
        expect(bad(rows)).toEqual(expect.arrayContaining(['폰 모드', '폰 필터']));
    });

    it('🔴 실제로 적용된 상차 반경이 문제지가 필요로 하는 값보다 작으면 빨간불 (14:54 · 4.55km)', () => {
        const rows = preflightRows(req, state({ pickupRadiusKmEffective: 4.554354460578365, radiusAuto: true }), { lon: HOME.x, lat: HOME.y, name: '집' });
        const row = rows.find(r => r.what === '상차 반경')!;
        expect(row.ok).toBe(false);
        expect(row.got).toBe('4.6km (자동)');
    });

    it('🔴 시뮬레이터가 첫 문제를 낼 위치가 서버의 내 위치와 1km 넘게 떨어지면 빨간불 (14:54 · 7km)', () => {
        const rows = preflightRows(req, state({ pickupRadiusKmEffective: 15 }), SIM_DEFAULT_START);
        const row = rows.find(r => r.what === '시작 위치')!;
        expect(row.ok).toBe(false);
    });

    it('조건이 다 맞으면 빨간불이 없다', () => {
        const rows = preflightRows(req, state({ pickupRadiusKmEffective: 15 }), { lon: HOME.x, lat: HOME.y, name: '집' });
        expect(bad(rows)).toEqual([]);
    });

    it('조건이 등록 안 된 문제지도 폰 줄은 뜬다 — 폰 상태는 어느 문제지에나 필요하다', () => {
        const rows = preflightRows(undefined, state({ phones: [{ ...okPhone, contact: { ageSec: 120, ok: false } }] }), SIM_DEFAULT_START);
        expect(bad(rows)).toEqual(['폰 연락']);
    });

    it('연결된 폰이 없으면 빨간불', () => {
        expect(bad(preflightRows(undefined, state({ phones: [] }), SIM_DEFAULT_START))).toEqual(['폰']);
    });
});
