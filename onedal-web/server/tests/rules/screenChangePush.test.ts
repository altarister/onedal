// @ts-nocheck
import db from '../../src/db';
import { touchDeviceSession } from '../../src/routes/devices';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🖥️ **화면이 바뀐 보고는 관제웹 폰 줄 배지로 곧바로 간다** — 1초 주기 방송을 기다리지 않는다.
 * 같은 화면 보고(하트비트 · 목록 다시 읽기)로는 보내지 않는다 — 1초 주기가 이미 싣는다.
 * 한 보고에 한 번만 보낸다.
 */
const U = 'test-screen-change-push';
const DEV = 'dev-screen-push-1';
const emitted: Array<[string, string, any]> = [];
const io = { to: (room: string) => ({ emit: (ev: string, body?: any) => { emitted.push([room, ev, body]); } }) };
const pushes = () => emitted.filter(([, ev]) => ev === 'telemetry-devices');
const report = (screen: string, page?: string, overlay?: string) =>
    touchDeviceSession(DEV, U, 0, screen, io, undefined, undefined, undefined, undefined, undefined, undefined, 'kakaopicker',
        { screenPage: page, screenOverlay: overlay });

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'screenpush@test', '화면바뀜방송검사');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
    report('LIST', '신규 리스트');
});
beforeEach(() => { emitted.length = 0; });
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('🖥️ 화면 바뀜 → 기기 상태 바로 한 번', () => {
    it('🔴 페이지가 바뀐 보고 뒤 그 회원 방으로 한 번 · 새 페이지 이름을 싣는다', () => {
        report('NETWORK_MENU', '메뉴');
        expect(pushes()).toHaveLength(1);
        const [room, , body] = pushes()[0];
        expect(room).toBe(U);
        expect(body.find((d: any) => d.deviceId === DEV)).toMatchObject({ screenContext: 'NETWORK_MENU', screenPage: '메뉴' });
    });
    it('🔴 같은 화면 보고는 안 보낸다', () => {
        report('NETWORK_MENU', '메뉴');
        report('NETWORK_MENU', '메뉴');
        expect(pushes()).toHaveLength(0);
    });
    it('🔴 화면 값이 같아도 덧칸이 바뀌면 보낸다', () => {
        report('NETWORK_MENU', '메뉴', '정렬 시트');
        expect(pushes()).toHaveLength(1);
    });
    it('🔴 화면 값이 없는 보고(하트비트)는 안 보낸다', () => {
        touchDeviceSession(DEV, U, 0, undefined, io);
        expect(pushes()).toHaveLength(0);
    });
});
