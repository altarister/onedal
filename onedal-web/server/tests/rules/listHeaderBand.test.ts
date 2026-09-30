// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { touchDeviceSession } from '../../src/routes/devices';

/**
 * 🔔 **목록이 내려가 앱이 못 열 때 — 관제웹 띠가 그렇게 말한다** (04 «목록 내려감» 1단계 · onedal-1f «가»).
 *
 * 원달앱은 목록 보고에만 `listHeaderHidden`(픽커 «리스트 설정» 머리가 안 보임 = 목록이 내려감)을 싣는다. 없으면 모름.
 * 알람 모드에서 통과 콜이 있고 참이면 filter-pass-alarm 에 싣고, 관제웹 띠가 «목록이 내려가 앱이 못 엽니다 …»로 바뀐다.
 */
const U = 'test-list-header';
const DEV = 'dev-list-header-1';
const tally = { seen: 3, passed: 1, vehicle: 0, region: 0 } as any;
const alarmsOf = () => {
    const sent: any[] = [];
    const io = { to: () => ({ emit: (ev: string, p: any) => { if (ev === 'filter-pass-alarm') sent.push(p); } }) };
    return { io, sent };
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'listheader@test', '목록내려감검사');
});
afterAll(() => { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); });

describe('🔔 목록 내려감 — 알림에 싣는다', () => {
    it('🔴 알람 모드 · 통과 1 · listHeaderHidden 참 → 알림에 참', () => {
        const { io, sent } = alarmsOf();
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker', { effectiveMode: 'ALARM', listHeaderHidden: true });
        expect(sent[0]?.listHeaderHidden).toBe(true);
    });

    it('🔴 칸이 없으면(모름) 거짓 — 지금 문구', () => {
        const { io, sent } = alarmsOf();
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker', { effectiveMode: 'ALARM' });
        expect(sent[0]?.listHeaderHidden).toBe(false);
    });
});

describe('🔔 칸 이름 짝', () => {
    it('🔴 앱 보고(scrap)가 읽는 칸 = 원달앱 ScrapPayload 칸 · 덤 칸으로 기기 보고에 넘긴다', () => {
        const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
        expect(scrap).toContain("listHeaderHidden: typeof (req.body as any).listHeaderHidden === 'boolean' ? (req.body as any).listHeaderHidden : undefined,");
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt'), 'utf8');
        const i = kt.indexOf('data class ScrapPayload');
        expect(i).toBeGreaterThan(-1);
        expect(kt.slice(i, kt.indexOf('\n)', i))).toMatch(/val listHeaderHidden: Boolean\? = null/);
    });
});
