import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔴 **스키마 진화는 테이블이 만들어진 «뒤에» 돌아야 한다**
 *
 * `ensureColumns` 는 **테이블이 없으면 조용히 return** 한다. 그래서 `ensureColumns('intel', { targetApp: 'TEXT' })` 가
 * `CREATE TABLE IF NOT EXISTS intel (…)` 보다 먼저 돌면, 빈 DB 로 처음 부팅할 때 `intel.targetApp` 이
 * **안 붙고** `CREATE` 문에도 그 칸이 없다. 그 상태에서 `scrap.ts` 가 `INSERT INTO intel (…, targetApp)` 을 쏘면
 * **런타임 `no such column`**. 재부팅하면 그때는 표가 있으니 저절로 붙어서, 증상이
 * «첫 부팅 세션에만» 나타난다 — 가장 찾기 어려운 모양이다.
 *
 * 🔴 서버 CLAUDE.md 의 규칙 —
 *    *"`CREATE TABLE IF NOT EXISTS` 는 기존 테이블에 컬럼을 추가하지 않는다. 칸 추가는 `ensureColumns()` 로 한다"*.
 *    그 `ensureColumns` 가 **호출 순서 때문에** 무력화되지 않게 검사로 못박는다.
 *
 * 검사 방식: `db.ts` 를 텍스트로 읽어 **호출 순서**를 본다. 부팅을 실제로 시켜서
 * 잡으려면 «빈 DB» 를 만들어야 하는데, 그건 이미 부팅된 검사 환경에서는 재현이 안 된다
 * (표가 이미 있으므로 조용히 통과한다) — 그 통과가 이 버그를 숨긴다.
 */
const SRC = readFileSync(join(__dirname, '../../src/db.ts'), 'utf8');

/** `ensureColumns('t', …)` 가 몇 번째 글자에서 불리는가 (없으면 -1) */
const ensureAt = (table: string) => SRC.search(new RegExp(`ensureColumns\\(\\s*['"]${table}['"]`));
/** `CREATE TABLE IF NOT EXISTS t` 가 몇 번째 글자인가 (없으면 -1) */
const createAt = (table: string) => SRC.search(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\b`));

/** ensureColumns 가 손대는 표 전부 — 목록을 손으로 적지 않는다 (규칙 ③) */
const ENSURED_TABLES = [...SRC.matchAll(/ensureColumns\(\s*['"](\w+)['"]/g)].map(m => m[1]);

describe('스키마 진화 순서 — 만든 뒤에 컬럼을 붙인다', () => {
    it('검사가 db.ts 를 실제로 읽고 있다', () => {
        expect(ENSURED_TABLES.length).toBeGreaterThan(3);
    });

    it('🔴 ensureColumns 는 그 표의 CREATE 보다 «뒤»에 있어야 한다 — 앞이면 조용히 건너뛴다', () => {
        const wrong = ENSURED_TABLES
            .filter(t => createAt(t) >= 0)                    // db.ts 안에서 만드는 표만
            .filter(t => ensureAt(t) < createAt(t))
            .map(t => `${t} (ensureColumns 가 CREATE 보다 앞)`);
        expect(wrong).toEqual([]);
    });

    /**
     * 위 검사가 «순서»만 보므로, 정작 그 칸을 **쓰는 쪽**이 있는지는 따로 못박는다.
     * intel.targetApp 은 scrap.ts 가 매 수집마다 INSERT 하는 칸이다.
     */
    it('🔴 intel 은 targetApp 을 CREATE 에 담거나 뒤에서 붙여야 한다 (scrap.ts 가 INSERT 한다)', () => {
        const createStmt = SRC.slice(createAt('intel'), createAt('intel') + 500);
        const hasInCreate = /targetApp/.test(createStmt);
        const hasAfter = ensureAt('intel') > createAt('intel');
        expect(hasInCreate || hasAfter).toBe(true);
    });
});
