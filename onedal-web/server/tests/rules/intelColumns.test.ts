import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📋 **앱이 올리는 칸은 하나도 안 버린다** (기사님 지시).
 *
 * 기사님: *"차종뿐 아니고 상차지거리와 배송거리도 보내고 있고 기타 급송인지도
 * 보내고 있는데.. 그걸 다 받아야 하는 거 아닌가?"*
 *
 * 🔴 **앱은 다 보낸다.** 인성 리스트 한 줄에서 여섯 칸을 읽어 그릇(`SimplifiedOfficeOrder`)에
 *    채워 올린다. **서버 INSERT 가 칸을 버리면**(차종·배송거리·급송표시·등록시각·원문·좌표 넷)
 *    현황판 검산이 「차종·배송거리」를 **«못 잰 축»** 으로 적고, 규칙대로
 *    걸러진 콜이 화면에 **«통과인데 안 잡음»** 으로 보인다.
 *
 * 🔴 **`appFilterKeys.test.ts` 의 거울이다** — 그쪽은 «내려가는 것»(서버 → 앱 필터),
 *    이쪽은 «올라오는 것»(앱 → 서버 원장). 두 방향을 다 잠근다.
 *
 * 🔴 **배차망마다 칸을 따로 파지 않는다** (기사님: *"나중에 24시 등 다른 배송망일 때도
 *    충돌 없이"*). 세 망이 **같은 그릇**을 채우고 채우는 칸만 다르다 — 빈 칸은
 *    «그 망이 안 주는 것»이고, 어느 망인지는 `targetApp` 열이 답한다.
 *    그래서 이 검사도 망을 나누지 않고 **그릇 하나**만 본다.
 */

const APP_MODELS = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt');
const SCRAP = join(__dirname, '../../src/routes/scrap.ts');
const DB = join(__dirname, '../../src/db.ts');
const read = (p: string) => readFileSync(p, 'utf8');

/**
 * 🔤 앱 이름 → 서버 칸 이름. **단위를 붙이는 것 말고는 바꾸지 않는다** —
 *    이름이 갈리면 «같은 값인가»를 사람이 외워야 한다.
 */
const COLUMN_OF: Record<string, string> = {
    pickupDistance: 'pickupDistanceKm',
    deliveryDistance: 'deliveryDistanceKm',
};

/**
 * 🚫 **서버가 안 담아도 되는 칸** — 이유가 있는 것만. 늘릴 때는 이유를 여기 적는다.
 *    · `id` 앱이 만든 UUID. 원장은 제 `AUTOINCREMENT` 를 쓴다 (두 계보를 안 섞는다)
 */
const NOT_STORED = new Set(['id', 'isSimulated']);

/** 📱 앱 그릇(`SimplifiedOfficeOrder`)이 나르는 칸 */
function appOrderFields(): string[] {
    const src = read(APP_MODELS);
    const start = src.indexOf('data class SimplifiedOfficeOrder');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n)', start));
    return [...body.matchAll(/val (\w+):/g)].map(m => m[1]);
}

/** 🗄️ 서버가 `intel` 에 담는 칸 (INSERT 문이 원천 — 표에 칸만 있고 안 담으면 그대로 버려진다) */
function insertColumns(): string[] {
    const m = read(SCRAP).match(/INSERT INTO intel \(([^)]*)\)/);
    expect(m).not.toBeNull();
    return m![1].split(',').map(c => c.trim());
}

describe('원장 수집 규격 — 앱이 올리는 것과 서버가 담는 것이 같다', () => {

    it('🔴 앱이 보내는 칸을 서버가 하나도 안 버린다', () => {
        const cols = new Set(insertColumns());
        const dropped = appOrderFields()
            .filter(f => !NOT_STORED.has(f))
            .filter(f => !cols.has(COLUMN_OF[f] ?? f));
        expect(dropped).toEqual([]);
    });

    it('🔴 INSERT 가 담는 칸은 표에 실제로 있다 — 없으면 실서버에서만 터진다', () => {
        /**
         * ⚠️ `CREATE TABLE IF NOT EXISTS` 에만 적으면 **기존 DB 에는 안 붙는다.**
         *    `tsc`·`jest` 는 통과하고 실서버에서만
         *    `no such column` 으로 터진다. 그래서 `ensureColumns` 까지 본다.
         */
        const db = read(DB);
        const created = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS intel'));
        const ensured = db.slice(db.indexOf("ensureColumns('intel'"));
        const declared = new Set([
            ...[...created.slice(0, created.indexOf('`)')).matchAll(/^\s+(\w+)\s+(TEXT|INTEGER|REAL)/gm)].map(m => m[1]),
            ...[...ensured.slice(0, ensured.indexOf('});')).matchAll(/(\w+):\s*'(TEXT|INTEGER|REAL)/g)].map(m => m[1]),
        ]);
        const missing = insertColumns().filter(c => !declared.has(c));
        expect(missing).toEqual([]);
    });

    it('🔴 현황판이 그 칸을 읽을 수 있다 — 받아만 두고 안 내면 없는 것과 같다', () => {
        const sim = read(join(__dirname, '../../src/routes/sim.ts'));
        const sel = sim.slice(sim.indexOf('FROM intel') - 700, sim.indexOf('FROM intel'));
        for (const c of ['vehicleType', 'deliveryDistanceKm', 'scheduleText']) {
            expect(sel).toContain(c);
        }
    });
});
