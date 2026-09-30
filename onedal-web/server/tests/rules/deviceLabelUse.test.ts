// @ts-nocheck
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { authDevice } from '../../src/core/deviceAuth';

/**
 * 📱 **로그 · 화면은 폰 id 가 아니라 표시 이름으로** (reviews/29 1단계 K · 04 · onedal-1f «가»).
 * 폰 id 가 d-UUID 가 되는 날 id 조각을 찍던 로그·화면은 어느 폰인지 읽을 수 없다. 서버 로그는 deviceLabelOf, 관제웹은 shared deviceLabel.
 * 예외: 연결 안 된 폰을 다루는 core/deviceAuth.ts — 이름이 없는 폰이라 id 원문이 곧 단서다.
 */
const SRC = join(__dirname, '../../src');
const WEB = join(__dirname, '../../../client-app/src');
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []);

describe('📱 서버 로그', () => {
    it('🔴 로그 줄이 폰 id 를 바로 찍지 않는다(deviceAuth 만 예외)', () => {
        const bad: string[] = [];
        for (const f of walk(SRC)) {
            const rel = f.slice(SRC.length + 1);
            if (rel === 'core/deviceAuth.ts') continue;
            readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
                if (/(slog|console\.(log|warn|error)|logRoadmapEvent)\(/.test(l) && /\$\{(deviceId|session\.deviceId|payload\.deviceId|d\.deviceId)\}/.test(l)) bad.push(`${rel}:${i + 1}`);
            });
        }
        expect(bad).toEqual([]);
    });
});

describe('📱 관제웹', () => {
    it('🔴 폰 이름 자리가 id 앞 조각을 이름처럼 보이지 않는다 — shared deviceLabel (id 뒤 4자 작은 글은 된다)', () => {
        for (const f of ['statusboard/StatusBoard.tsx', 'components/dashboard/DeviceControlPanel.tsx', 'components/dashboard/settings/DeviceSettingsTab.tsx']) {
            const src = readFileSync(join(WEB, f), 'utf8');
            expect([f, /(deviceName|device_name) \|\| (\w+\.)?(deviceId|device_id)\.slice\(/.test(src)]).toEqual([f, false]);
            expect([f, /deviceLabel\(/.test(src)]).toEqual([f, true]);
        }
    });
});

describe('🔑 토큰 확인됨', () => {
    it('🔴 맞는 토큰이 오면 폰마다 한 번 «🔑 [토큰 확인됨]» — 강제로 바꾸기 전 두 폰의 증거', async () => {
        const { createHash } = await import('crypto');
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES ('test-tokok', 'g-tokok', 'tk@test', '토큰확인')`).run();
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name, token_hash) VALUES ('test-tokok', 'd-tokok', '시험폰', ?)`).run(createHash('sha256').update('tok').digest('hex'));
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        authDevice('d-tokok', 'tok');
        authDevice('d-tokok', 'tok');
        const lines = log.mock.calls.map(c => c.join(' ')).filter(l => l.includes('토큰 확인됨'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('시험폰');
        log.mockRestore();
    });
});
