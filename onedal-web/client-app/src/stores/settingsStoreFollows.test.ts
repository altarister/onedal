import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 서버가 돌려줄 설정 — 검사마다 바꾼다 */
let served: Record<string, unknown> = {};
vi.mock('../api/apiClient', () => ({ apiClient: { get: vi.fn(async () => ({ data: served })) } }));
vi.mock('../lib/socket', () => ({ socket: { on: () => {}, off: () => {} } }));

import { useSettingsStore, loadScreenSettings, followSettingsUpdates } from './settingsStore';

/** 듣는 손을 모아 두는 가짜 소켓 */
const fakeSocket = () => {
    const hands = new Set<() => void>();
    return {
        on: (_: 'settings-updated', h: () => void) => { hands.add(h); },
        off: (_: 'settings-updated', h: () => void) => { hands.delete(h); },
        send: () => hands.forEach(h => h()),
        get count() { return hands.size; },
    };
};
const settle = () => new Promise(r => setTimeout(r, 0));

/**
 * ⚙️ **설정 저장소는 «설정 바뀜» 신호를 받으면 다시 읽는다** — 차종 · 집 주소 · 집 좌표가 함께 따른다
 *    (머리줄 차종 · 지도 출발점 · 필터창 «설정의 집 주소»가 이 저장소 하나를 본다).
 */
describe('설정 저장소 — 설정 바뀜을 따른다', () => {
    beforeEach(() => { useSettingsStore.setState({ loaded: false, vehicleType: null, homeX: null, homeY: null, homeAddress: null }); });

    it('신호 전에는 옛 값 · 신호를 받으면 서버 값으로 차종 · 집이 함께 바뀐다', async () => {
        served = { vehicleType: '1t', homeAddress: '경기 광주시 경안동', homeX: 127.25, homeY: 37.41 };
        await loadScreenSettings();
        const s = fakeSocket();
        followSettingsUpdates(s);
        served = { vehicleType: '라보', homeAddress: '경기 이천시 신둔면', homeX: 127.40, homeY: 37.30 };
        expect(useSettingsStore.getState().vehicleType).toBe('1t');
        s.send(); await settle();
        const st = useSettingsStore.getState();
        expect([st.vehicleType, st.homeAddress, st.homeX, st.homeY]).toEqual(['라보', '경기 이천시 신둔면', 127.40, 37.30]);
    });

    it('끊으면 더 안 듣는다', async () => {
        served = { vehicleType: '1t' };
        await loadScreenSettings();
        const s = fakeSocket();
        followSettingsUpdates(s)();
        expect(s.count).toBe(0);
        served = { vehicleType: '라보' };
        s.send(); await settle();
        expect(useSettingsStore.getState().vehicleType).toBe('1t');
    });
});
