import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/socket', () => ({ socket: { on: () => {}, off: () => {} } }));
vi.mock('../../api/apiClient', () => ({ apiClient: { get: () => Promise.resolve({ data: {} }) } }));

import { followVehicleType } from './VehicleStatusPanel';

/** 듣는 손을 이름별로 모아 두는 가짜 소켓 */
const fakeSocket = () => {
    const hands = new Set<(s: { vehicleType?: string }) => void>();
    return {
        on: (_: 'settings-updated', h: (s: { vehicleType?: string }) => void) => { hands.add(h); },
        off: (_: 'settings-updated', h: (s: { vehicleType?: string }) => void) => { hands.delete(h); },
        send: (s: { vehicleType?: string }) => hands.forEach(h => h(s)),
        get count() { return hands.size; },
    };
};

/**
 * 🚚 **머리줄 차종은 설정 바뀜 신호를 따른다** — 차종을 바꿔도 새로고침 전까지 옛 차종이 남던 것.
 */
describe('followVehicleType', () => {
    it('신호 전에는 옛 값 · 차종이 실린 신호를 받으면 새 차종', () => {
        const s = fakeSocket();
        let vehicle = '1t';
        followVehicleType(s, v => { vehicle = v; });
        expect(vehicle).toBe('1t');
        s.send({ vehicleType: '라보' });
        expect(vehicle).toBe('라보');
    });

    it('차종이 없는 저장은 그대로 둔다', () => {
        const s = fakeSocket();
        let vehicle = '1t';
        followVehicleType(s, v => { vehicle = v; });
        s.send({});
        expect(vehicle).toBe('1t');
    });

    it('끊으면 더 안 듣는다 — 머리줄이 사라진 뒤 손이 남지 않는다', () => {
        const s = fakeSocket();
        let vehicle = '1t';
        const stop = followVehicleType(s, v => { vehicle = v; });
        stop();
        expect(s.count).toBe(0);
        s.send({ vehicleType: '라보' });
        expect(vehicle).toBe('1t');
    });
});
