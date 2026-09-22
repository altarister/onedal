import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { APP_FILTER_KEYS, effectiveRadii } from '@onedal/shared';

/**
 * 📦 **앱에 내려가는 키는 표가 정한다**.
 *
 * 🔴 **«떼는 키»를 손으로 나열하지 않고, 보낼 키를 표로 고른다** — `const { destinationGroups, dispatchPhase,
 *    … } = activeFilter` 처럼 떼는 키를 나열하면 **새 칸이 생길 때마다 그 목록에 넣어야 하고, 안 넣으면
 *    조용히 앱으로 간다.** 한 번만 잊으면 규격이 어긋난다.
 *
 * 이 검사가 잡는 것은 **두 방향의 어긋남**이다:
 *   · 앱이 읽는데 서버가 안 보낸다 → **조용한 고장** (빈 값으로 거른다)
 *   · 서버가 보내는데 앱이 안 읽는다 → **낭비** (하트비트마다 재전송된다.
 *     실측에서 `destinationGroups` 하나가 응답의 27%였다)
 */

const SERVER = join(__dirname, '../../src');
const APP_JAVA = join(__dirname, '../../../../onedal-app/app/src/main/java');
const read = (abs: string) => readFileSync(abs, 'utf8');
/** 주석을 걷어낸 코드만 — 주석이 예로 든 글자에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 📱 **앱이 서버 필터에서 읽는 키** — 앱이 그 JSON 을 통째로 담는 타입(`FilterConfig`)의
 *    필드가 곧 그것이다. 필드가 있다는 것은 «이 키가 오기를 기대한다»는 뜻이고,
 *    표에 없으면 서버가 안 실어 보내 **앱은 늘 기본값으로 거른다.**
 *
 * 🔴 **Kotlin 전체에서 `filter.xxx` 를 긁지 않는다.** 앱에는 화면 표시용으로 **가공한**
 *    객체(`MainViewModel.ParsedFilter` — «전체 허용» · «3개 등록» 같은 사람이 읽는 문자열)도
 *    `filter` 라는 이름으로 돌아다닌다. 그걸 서버 키로 읽으면, 서버가 보낼 수도 없는 이름이
 *    «빠졌다»고 빨간불이 켜진다 — 화면 문구를 하나 늘릴 때마다 게이트가 막힌다.
 */
function appReadKeys(): Set<string> {
    const src = read(join(APP_JAVA, 'com/onedal/app/models/SharedModels.kt'));
    const head = src.indexOf('data class FilterConfig(');
    if (head < 0) throw new Error('FilterConfig 를 못 찾았다 — 앱이 서버 필터를 담는 타입이 바뀌었나');
    /* 여는 괄호부터 짝이 맞는 닫는 괄호까지가 본문이다 */
    let depth = 0, end = -1;
    for (let i = src.indexOf('(', head); i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')' && --depth === 0) { end = i; break; }
    }
    if (end < 0) throw new Error('FilterConfig 본문의 끝을 못 찾았다');
    const body = codeOnly(src.slice(head, end));
    const out = new Set<string>();
    for (const m of body.matchAll(/\bval\s+([a-zA-Z][a-zA-Z0-9]*)\s*:/g)) out.add(m[1]);
    return out;
}

describe('앱 피기백 규격 — 서버가 싣는 것과 앱이 읽는 것이 같다', () => {

    it('🔴 표가 있고 비어 있지 않다', () => {
        expect(Array.isArray(APP_FILTER_KEYS)).toBe(true);
        expect(APP_FILTER_KEYS.length).toBeGreaterThan(10);
        // 중복이 없다 — 표가 곧 규격이다
        expect(new Set(APP_FILTER_KEYS).size).toBe(APP_FILTER_KEYS.length);
    });

    /**
     * 🔴 **앱이 읽는데 표에 없으면 조용한 고장이다.** 그 키는 안 실려 가고, 앱은
     *    «빈 값»으로 거르기 시작한다 — 화면에도 로그에도 아무 표시가 없다.
     */
    it('🔴 앱이 읽는 필터 키가 표에 다 있다 (빠지면 조용한 고장)', () => {
        const missing = [...appReadKeys()].filter(k => !(APP_FILTER_KEYS as readonly string[]).includes(k));
        expect(missing).toEqual([]);
    });

    it('🔴 서버는 표로 **고른다** — 떼는 목록을 손으로 나열하지 않는다', () => {
        const scrap = codeOnly(read(join(SERVER, 'routes/scrap.ts')));
        expect(scrap).toMatch(/APP_FILTER_KEYS/);
        // 떼어내는 구조분해가 없다
        expect(scrap).not.toMatch(/const \{ destinationGroups,/);
    });

    /**
     * ⚠️ `orderKm`·`pickerAlarmMinFare` 는 평면 필터에 없다 — 조립할 때 얹는다.
     *    그래서 표는 «앱이 읽는 키»이지 «`AutoDispatchFilter` 의 부분집합»이 아니다.
     */
    it('조립할 때 얹는 둘도 표에 있다 (표가 곧 앱이 받는 전부다)', () => {
        for (const k of ['orderKm', 'pickerAlarmMinFare']) {
            expect(`${k} in APP_FILTER_KEYS`).toBe(
                `${k} ${(APP_FILTER_KEYS as readonly string[]).includes(k) ? 'in' : 'NOT in'} APP_FILTER_KEYS`);
        }
    });

    /**
     * 🔴 **이름만 맞으면 안 된다 — 숫자 모양도 맞아야 한다** (기사님 실측 · 「7지점 한 바퀴」).
     *
     * 반경을 «40km 기준(자동)»으로 켜면 서버가 `pickupRadiusKm: 4.554354460578365` 같은 소수를 보낸다.
     * 앱이 그 칸을 `Int` 로 받으면 **응답을 통째로 버린다**:
     * ```
     * E/1DAL_API: NumberFormatException: Expected an int but was 4.554354460578365
     *          path $.dispatchEngineArgs.pickupRadiusKm
     * ```
     * 새 필터도 모드도 못 받아 앱이 기본값 MANUAL 로 남고, 필터를 통과한 콜을 **하나도 안 누른다.**
     * 위 검사들은 **이름**만 봐서 이것을 못 잡는다 (자동 반경은 소수다).
     *
     * «소수가 될 수 있는 칸»은 손으로 적지 않는다 — **서버가 쓰는 그 함수**(`effectiveRadii`)에
     * 자동을 켜서 물어본다. 새 칸이 소수가 되면 저절로 여기 걸린다.
     */
    it('🔴 서버가 소수로 보낼 수 있는 칸을 앱이 정수로 받지 않는다', () => {
        const eff = effectiveRadii({
            pickupRadiusKm: 10, destinationRadiusKm: 10, quadRadiusKm: 35, detourRadiusKm: 6,
            radiusAuto: true, radiusDistanceKm: 18.2, radiusBaseKm: 40,
        });
        const fractional = Object.entries(eff)
            .filter(([k, v]) => (APP_FILTER_KEYS as readonly string[]).includes(k) && !Number.isInteger(v))
            .map(([k]) => k);
        expect(fractional.length).toBeGreaterThan(0);   // 이 검사가 헛돌지 않는다 — 자동은 실제로 소수를 낸다

        const models = codeOnly(read(join(APP_JAVA, 'com/onedal/app/models/SharedModels.kt')));
        const filterConfig = models.slice(models.indexOf('data class FilterConfig('));
        const block = filterConfig.slice(0, filterConfig.indexOf('\n)'));
        const intDeclared = fractional.filter(k => new RegExp(`\\bva[lr]\\s+${k}\\s*:\\s*Int\\b`).test(block));
        expect(intDeclared).toEqual([]);

        /* 저장된 필터를 다시 읽는 파서들 — `optInt` 는 4.55 를 조용히 4 로 자른다 */
        const truncated: string[] = [];
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) { walk(p); continue; }
                if (!name.endsWith('.kt')) continue;
                const src = codeOnly(read(p));
                for (const k of fractional) if (new RegExp(`optInt\\(\\s*"${k}"`).test(src)) truncated.push(`${name}:${k}`);
            }
        };
        walk(APP_JAVA);
        expect(truncated).toEqual([]);
    });

    /**
     * 🔴 **관제웹이 쓰는 것은 앱에 안 간다** — 소켓(`filter-updated`)으로 따로 받는다.
     *    여기 있으면 하트비트마다 재전송이라 낭비다.
     */
    it('🔴 관제웹 전용 값은 표에 없다 (소켓으로 따로 간다)', () => {
        for (const k of ['destinationGroups', 'srcAngleDeg', 'dstAngleDeg', 'quadRadiusKm',
                         'excludedRegions', 'callDiscountPct', 'detourRadiusKm']) {
            expect(`${k}: ${(APP_FILTER_KEYS as readonly string[]).includes(k) ? '실린다' : '안 실린다'}`)
                .toBe(`${k}: 안 실린다`);
        }
    });
});
