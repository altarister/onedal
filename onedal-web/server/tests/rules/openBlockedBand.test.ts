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

    it('🔴 소리 알림은 통과 수(passed)와 새로 통과 수(passedNew)를 따로 싣는다 — 띠의 N 은 목록에 보이는 통과 수', () => {
        const { io, sent } = alarmsOf();
        touchDeviceSession('dev-ob-count', U, 0, 'LIST', io, false, undefined, undefined, undefined, true,
            { seen: 5, passed: 3, passedNew: 1, vehicle: 0, region: 0 }, 'kakaopicker', { effectiveMode: 'ALARM' });
        expect(sent[0]).toMatchObject({ passed: 3, passedNew: 1 });
        expect(sent[0].silent).toBeUndefined();
    });
});

describe('🚧 띠는 소리와 따로 — 까닭이 «손 필요»로 새로 바뀌면 소리 없이 띠만', () => {
    const quiet = { seen: 4, passed: 2, passedNew: 0, vehicle: 0, region: 0 } as any;
    const at = (io: any, openBlocked?: string) => touchDeviceSession('dev-ob-band', U, 0, 'LIST', io, false, undefined, undefined, undefined, true,
        quiet, 'kakaopicker', { effectiveMode: 'ALARM', ...(openBlocked ? { openBlocked } : {}) });

    it('🔴 곧 풀리는 까닭 → 띠 없음 · 손 필요로 바뀜 → 소리 없는 띠 한 번 · 같은 열쇠 → 다시 안 보냄 · 다른 손 필요 열쇠 → 한 번 더', () => {
        const { io, sent } = alarmsOf();
        at(io, 'listMoving');
        expect(sent).toHaveLength(0);
        at(io, 'tabBar');
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ silent: true, passed: 2, passedNew: 0, openBlocked: 'tabBar' });
        at(io, 'tabBar');
        expect(sent).toHaveLength(1);
        at(io, 'scrolledOff');
        expect(sent).toHaveLength(2);
        at(io);                 // 앱이 열었다 — 까닭이 사라짐
        at(io, 'scrolledOff');  // 다시 손 필요 → 한 번 더
        expect(sent).toHaveLength(3);
    });
});

describe('🚧 옛 원달앱 — listHeaderHidden 은 scrolledOff 로 받고 한 번 알린다', () => {
    it('🔴 listHeaderHidden 참 → openBlocked scrolledOff · «옛 원달앱» 경고는 기기마다 한 번', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const { io, sent } = alarmsOf();
        const t = { seen: 3, passed: 1, vehicle: 0, region: 0 } as any;
        touchDeviceSession('dev-ob-old', U, 0, 'LIST', io, false, undefined, undefined, undefined, true, t, 'kakaopicker', { effectiveMode: 'ALARM', listHeaderHidden: true });
        touchDeviceSession('dev-ob-old', U, 0, 'LIST', io, false, undefined, undefined, undefined, true, t, 'kakaopicker', { effectiveMode: 'ALARM', listHeaderHidden: false });
        expect(sent[0]?.openBlocked).toBe('scrolledOff');
        expect(log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('옛 원달앱'))).toHaveLength(1);
        log.mockRestore();
    });
});

describe('🚧 칸 이름 짝', () => {
    it('🔴 앱 보고(scrap)가 읽는 칸 = 원달앱 ScrapPayload 칸 · 짧은 영문 열쇠만 받는다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toMatch(/openBlocked: openBlockedOf\(\(req\.body as any\)\.openBlocked\)/);
        // 옛 원달앱의 칸은 넘기기만 한다 — 뜻은 기기 보고(devices)가 scrolledOff 로 옮긴다
        expect(scrap).toContain("listHeaderHidden: typeof (req.body as any).listHeaderHidden === 'boolean' ? (req.body as any).listHeaderHidden : undefined,");
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt'), 'utf8');
        const i = kt.indexOf('data class ScrapPayload');
        expect(i).toBeGreaterThan(-1);
        expect(kt.slice(i, kt.indexOf('\n)', i))).toMatch(/val openBlocked: String\? = null/);
    });
});
