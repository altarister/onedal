import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕐 **서버는 한국 시간으로 돈다** (기사님: «저장 시간도 한국 시간으로 해»).
 *
 * 실서버(EC2)는 Etc/UTC 였다 — 날 경계(businessDayKey · 영업일 전환)가 한국 09시에 바뀌고, 17시 일과 종료가 한국 02시로 돌았다.
 * 서버가 켜질 때 스스로 TZ 를 정한다(`config/timezone.ts` — 배포 설정이 빠지거나 pm2 가 옛 env 를 쥐어도).
 * 배포 설정(ecosystem TZ · reload --update-env)은 두 번째 겹이다.
 */
const WEB = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');

describe('🕐 서버 시간대', () => {
    it('🔴 기계가 UTC 여도 한국 00:30 의 날 키는 한국 날이다', () => {
        const before = process.env.TZ;
        process.env.TZ = 'UTC';
        try {
            jest.isolateModules(() => {
                require('../../src/config/timezone');
                const { businessDayKey } = require('@onedal/shared');
                expect(businessDayKey(Date.parse('2026-10-01T00:30:00+09:00'))).toBe('2026-10-01');
            });
        } finally {
            if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
        }
    });

    it('날 계산·로그보다 먼저 — 서버 입구의 첫 import', () => {
        const index = read('server/src/index.ts');
        const firstImport = index.split('\n').find(l => l.startsWith('import '));
        expect(firstImport).toBe('import "./config/timezone";');
    });

    it('배포 두 겹 — ecosystem 의 두 env 에 TZ · reload 가 새 env 를 먹는다', () => {
        const eco = read('ecosystem.config.cjs');
        expect(eco.match(/TZ: 'Asia\/Seoul'/g)?.length).toBe(2);
        const deploy = readFileSync(join(WEB, '../.github/workflows/deploy.yml'), 'utf8');
        expect(deploy).toContain('pm2 reload ecosystem.config.cjs --env production --update-env');
    });

    it('부팅 한 줄 — 배포 뒤 서버 로그로 확인한다', () => {
        const index = read('server/src/index.ts');
        expect(index).toContain("slog('부팅', `🕐 [시간대] ${serverTimeZone()}`)");
    });
});
