import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 🏷️ **서버의 모든 일반 줄은 태그를 이고 나간다** (reviews/22 2단계 · 끝: `#없음` = 0).
 *
 * 일반 줄은 `slog(태그, …)` 로 찍는다 — `console.log` 를 직접 부르면 파일에 `#없음` 이 붙는다.
 * 경고·오류 줄(`console.warn/error`)은 로거가 `#경고` 를 붙이므로 그대로 둔다.
 * 로거 자신(`fileLogger` · `roadmapLogger`)만 `console.log` 를 부른다.
 * 관제웹·원달앱이 보낸 줄을 받아 적는 `routes/logs.ts` 는 줄 앞머리의 «#태그» 를 떼어 쓰고, 태그가 없으면 그대로(`#없음`) 찍는다.
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

    it('중계 줄은 보낸 쪽이 실어 온 «#태그» 를 떼어 서버 태그로 올린다', () => {
        const relay = readFileSync(join(SRC, 'routes/logs.ts'), 'utf8');
        expect(relay).toContain('if (tag) slog(tag, line);');
        const web = readFileSync(join(__dirname, '../../../client-app/src/lib/roadmapLogger.ts'), 'utf8');
        expect(web).toMatch(/msg: `#\$\{tag\} \$\{line\}`/);
        const app = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/core/AppTrace.kt'), 'utf8');
        expect(app.match(/push\(Line\(now, "#\$\{LogTag\./g)?.length).toBe(5);
    });

    it('관제웹 콘솔의 경고·오류 줄은 #경고 를 싣고 온다', () => {
        const web = readFileSync(join(__dirname, '../../../client-app/src/lib/roadmapLogger.ts'), 'utf8');
        expect(web).toContain("push(`${tag}${text}`, level === 'log' ? null : '경고');");
    });

    it('«경로 순서» 줄은 길이 어긋남이 있으면 경고 줄이다', () => {
        const helpers = readFileSync(join(SRC, 'core/helpers.ts'), 'utf8');
        expect(helpers).toMatch(/if \(mismatch\) console\.warn\(line\);\s*else slog\('판정', line\);/);
    });

    it('로드맵 줄도 태그를 받는다 — 첫 인자가 태그', () => {
        const roadmap = readFileSync(join(SRC, 'utils/roadmapLogger.ts'), 'utf8');
        expect(roadmap).toMatch(/export function logRoadmapEvent\(tag: LogTag,/);
    });
});
