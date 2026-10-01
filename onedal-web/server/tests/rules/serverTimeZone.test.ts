import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

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
    /**
     * 🔴 jest 안의 process.env 는 사본이라 TZ 를 바꿔도 날 계산에 안 닿는다 — 기계가 한국 시간이면 늘 초록인 빈 검사가 된다.
     *    그래서 자식 프로세스를 TZ=UTC 로 띄워, 서버 입구처럼 config/timezone 을 먼저 불러온 뒤 «기계 시간대를 따르는 계산»을 잰다.
     *    날 키(businessDayKey)는 이제 시간대를 안 따르니(oneDayKey), 재는 것은 되살리는 기간의 «오늘 0시»(restoreWindow) · 지역 시각이다.
     */
    it('🔴 기계가 UTC 여도 서버는 한국 시간으로 잰다 — 오늘 0시 · 지역 시각', () => {
        const script = `import './src/config/timezone';
import { serverTimeZone } from './src/config/timezone';
import { restoreWindow } from '@onedal/shared';
const ms = Date.parse('2026-10-01T00:30:00+09:00');
console.log(JSON.stringify({ tz: serverTimeZone(), date: new Date(ms).getDate(), hour: new Date(ms).getHours(), todayStart: restoreWindow(ms).todayStartIso }));`;
        const out = execFileSync(process.execPath, [require.resolve('tsx/cli'), '-e', script], { cwd: join(__dirname, '../..'), env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' });
        const got = JSON.parse(out.trim().split('\n').pop()!);
        expect(got).toEqual({ tz: 'Asia/Seoul', date: 1, hour: 0, todayStart: '2026-09-30T15:00:00.000Z' });
    }, 30_000);

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
