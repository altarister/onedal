// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { touchDeviceSession } from '../../src/routes/devices';

/**
 * 🚧 **앱이 못 연 까닭을 알림에 싣는다** (원달앱 `OpenBlocked` · onedal-1f «가»).
 *
 * 원달앱은 통과 콜이 있는데 안 열었을 때만 목록 보고에 `openBlocked` 열쇠를 싣는다. 서버는 열쇠를 그대로 filter-pass-alarm 에 싣고,
 * 관제웹 띠가 shared 표(`openBlockedSayOf`)로 기사님 말로 바꾼다. 없으면 앱이 연 것이라 띠가 없다.
 */
const U = 'test-open-blocked';
const DEV = 'dev-open-blocked-1';
const tally = { seen: 3, passed: 1, vehicle: 0, region: 0 } as any;
const alarmsOf = () => {
    const sent: any[] = [];
    const io = { to: () => ({ emit: (ev: string, p: any) => { if (ev === 'filter-pass-alarm') sent.push(p); } }) };
    return { io, sent };
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'openblocked@test', '못연까닭검사');
});
afterAll(() => { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); });

describe('🚧 앱이 못 연 까닭 — 알림에 싣는다', () => {
    it('🔴 알람 모드 · 통과 1 · openBlocked 열쇠 → 알림에 그 열쇠', () => {
        const { io, sent } = alarmsOf();
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker', { effectiveMode: 'ALARM', openBlocked: 'acceptVisible' });
        expect(sent[0]?.openBlocked).toBe('acceptVisible');
    });

    it('🔴 열쇠가 없으면(앱이 열었다) 알림에도 없다', () => {
        const { io, sent } = alarmsOf();
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker', { effectiveMode: 'ALARM' });
        expect(sent[0]?.openBlocked).toBeUndefined();
        expect('listHeaderHidden' in sent[0]).toBe(false);
    });
});

describe('🚧 칸 이름 짝', () => {
    it('🔴 앱 보고(scrap)가 읽는 칸 = 원달앱 ScrapPayload 칸 · 짧은 영문 열쇠만 받는다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toMatch(/openBlocked: openBlockedOf\(\(req\.body as any\)\.openBlocked\)/);
        expect(scrap).not.toContain('listHeaderHidden');
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt'), 'utf8');
        const i = kt.indexOf('data class ScrapPayload');
        expect(i).toBeGreaterThan(-1);
        expect(kt.slice(i, kt.indexOf('\n)', i))).toMatch(/val openBlocked: String\? = null/);
    });
});
