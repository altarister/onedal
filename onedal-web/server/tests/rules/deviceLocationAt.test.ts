// @ts-nocheck
import db from '../../src/db';
import { touchDeviceSession, getActiveDevicesSnapshot } from '../../src/routes/devices';

/**
 * 📍 **폰 보고에 위치가 실린 마지막 시각** (onedal-69 «나» · 운영센터 홈 «기사 이상»).
 * 운전석 GPS 는 관제웹 소켓만 적어(session.lastFixAt), 배차망 앱을 앞에 띄우고 관제웹이 뒤로 가면 원달앱이 위치를 보내도 «GPS 안 옴»이 울렸다.
 * 기기 세션에 «위치가 실린 보고를 받은 서버 시각»을 메모리로 둔다 — 위치 없는 보고(하트비트 · 상세)는 그 시각을 안 민다.
 */
const U = 'test-device-location-at';
const DEV = 'dev-location-at-1';
const io = { to: () => ({ emit: () => {} }) };
const snap = () => getActiveDevicesSnapshot().find((d: any) => d.deviceId === DEV);

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
});
afterAll(() => db.prepare(`DELETE FROM users WHERE id = ?`).run(U));

describe('📍 위치가 실린 마지막 보고 시각', () => {
    it('🔴 첫 보고에 위치가 실리면 그때 · 위치 없는 보고는 그대로 · 다시 실리면 갱신', () => {
        const t0 = Date.now();
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, 37.5, 127.0);
        const first = snap().lastLocationAt;
        expect(first).toBeGreaterThanOrEqual(t0);

        touchDeviceSession(DEV, U, 0, 'LIST', io, false);
        expect(snap().lastLocationAt).toBe(first);

        const later = jest.spyOn(Date, 'now').mockReturnValue(first + 5000);
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, 37.6, 127.1);
        later.mockRestore();
        expect(snap().lastLocationAt).toBe(first + 5000);
    });

    it('🔴 위치 없이 시작한 세션은 칸이 없다(모른다)', () => {
        const D2 = 'dev-location-at-2';
        touchDeviceSession(D2, U, 0, 'LIST', io, false);
        expect(getActiveDevicesSnapshot().find((d: any) => d.deviceId === D2).lastLocationAt).toBeUndefined();
    });
});
