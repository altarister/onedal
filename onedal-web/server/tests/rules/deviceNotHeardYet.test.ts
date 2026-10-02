// @ts-nocheck
import db from '../../src/db';
import { touchDeviceSession, getUserDevicesSnapshot } from '../../src/routes/devices';

/**
 * ⏳ **서버가 뜬 뒤 아직 못 들은 폰은 «끊김»이 아니라 «로딩 중»** (기사님 «통신이 되지 않았으면 버튼에 로딩 중이 나와야 하는데 · 통신 끊김이라고 거짓말한 거야»).
 * 서버 메모리는 다시 뜨면 비어 있다 — 그 사이의 침묵은 폰이 끊긴 것이 아니라 서버가 아직 못 들은 것이다. 첫 보고가 오면 지금처럼 ONLINE.
 * 한 번 들은 뒤 오래 말이 없어 메모리에서 치운 폰은 진짜 끊김(통신 두절)이다.
 */
const U = 'test-device-not-heard';
const DEV = 'dev-not-heard-1';
const io = { to: () => ({ emit: () => {} }) };
const row = () => getUserDevicesSnapshot(U, io).find((d: any) => d.deviceId === DEV);

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, ?, ?)`).run(U, DEV, '시험폰');
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('⏳ 서버가 뜬 뒤 아직 못 들은 폰', () => {
    it('🔴 등록만 되고 보고가 없으면 «아직 못 들음»(NOT_HEARD_YET) — 끊김 까닭이 아니다', () => {
        expect(row().status).toBe('OFFLINE');
        expect(row().offlineReason).toBe('NOT_HEARD_YET');
    });
    it('🔴 첫 보고가 오면 지금처럼 ONLINE', () => {
        touchDeviceSession(DEV, U, 0, 'LIST', io, false);
        expect(row().status).toBe('ONLINE');
        expect(row().offlineReason).toBeUndefined();
    });
    it('🔴 한 번 들은 폰이 오래 말이 없어 메모리에서 치워지면 진짜 끊김(통신 두절)', () => {
        const later = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
        const r = row();
        later.mockRestore();
        expect(r.status).toBe('OFFLINE');
        expect(r.offlineReason).toBe('NO_CONTACT');
    });
});
