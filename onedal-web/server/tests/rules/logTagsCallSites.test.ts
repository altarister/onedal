import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 🏷️ **서버의 모든 일반 줄은 태그를 이고 나간다** (reviews/22 2단계 · 끝: `#없음` = 0).
 *
 * 일반 줄은 `slog(태그, …)` 로 찍는다 — `console.log` 를 직접 부르면 파일에 `#없음` 이 붙는다.
 * 경고·오류 줄(`console.warn/error`)은 로거가 `#경고` 를 붙이므로 그대로 둔다.
 * 로거 자신(`fileLogger` · `roadmapLogger`)만 `console.log` 를 부른다.
 * 관제웹이 보낸 줄을 받아 적는 `routes/logs.ts` 는 관제웹이 태그를 실어 보낼 때까지 `#없음` 이다 (3단계 몫).
 */

const SRC = join(__dirname, '../../src');
const LOGGERS = ['utils/fileLogger.ts', 'utils/roadmapLogger.ts', 'routes/logs.ts'];

function tsFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(f => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? tsFiles(p) : p.endsWith('.ts') ? [p] : [];
    });
}

describe('🏷️ 로그 호출 자리', () => {
    it('로거 밖에서 console.log 를 직접 부르지 않는다', () => {
        const offenders = tsFiles(SRC)
            .map(p => relative(SRC, p))
            .filter(r => !LOGGERS.includes(r))
            .flatMap(r => readFileSync(join(SRC, r), 'utf8').split('\n')
                .map((l, i) => ({ r, i: i + 1, l }))
                .filter(x => /console\.log\(/.test(x.l) && !/^\s*(\/\/|\*)/.test(x.l)))
            .map(x => `${x.r}:${x.i}`);
        expect(offenders).toEqual([]);
    });

    it('경고·오류 줄은 로거가 #경고 를 붙인다', () => {
        const logger = readFileSync(join(SRC, 'utils/fileLogger.ts'), 'utf8');
        expect(logger).toMatch(/level === '   ' \? NO_TAG : '경고'/);
    });

    it('로드맵 줄도 태그를 받는다 — 첫 인자가 태그', () => {
        const roadmap = readFileSync(join(SRC, 'utils/roadmapLogger.ts'), 'utf8');
        expect(roadmap).toMatch(/export function logRoadmapEvent\(tag: LogTag,/);
    });
});
