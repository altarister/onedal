import { readFileSync } from 'fs';
import { join } from 'path';
import { initGeoService, getDetourRegions } from '../../src/services/geoService';

/**
 * 🕳️ **서버가 보낸 null 이 앱 저장에서 사라지지 않게 한다**
 *
 * 서버 원문의 `null` 값이 앱 저장 왕복에서 사라지면 앱이 든 필터가 서버가 보낸 것과 갈라진다.
 * 서버 쪽 진행도에도 «모름»(null)이 실제로 있다(아래 서버 검사).
 *
 * 🔴 null 을 잃는 곳은 앱의 **저장 왕복**이다:
 *
 *     val filterJson = gson.toJson(scrapRes.dispatchEngineArgs)   // ← Gson 은 null 을 버린다
 *     prefs.edit().putString("activeFilter", filterJson)
 *
 * 서버 JSON → Gson 객체 → **다시 JSON**. Gson 은 기본으로 `null` 필드를 직렬화하지
 * 않으므로, `{"분당구": null}` 이 그 왕복에서 **통째로 없어진다.**
 *
 * 규칙: **서버가 보낸 JSON을 그대로 보관한다.** 왕복 자체를 두지 않는다 (규칙 ③).
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

beforeAll(() => { initGeoService(); });

describe('🕳️ 서버 — 모르는 진행도는 null 로 둔다', () => {
    it('진행도를 모르는 지역이 실제로 있다 (전제 확인)', () => {
        const r = getDetourRegions(
            [{ x: 127.258, y: 37.410 }, { x: 127.112, y: 37.393 }, { x: 126.680, y: 37.790 }],
            10, 3,
        );
        const nulls = Object.entries(r!.progressKm).filter(([, v]) => v === null);
        expect(nulls.length).toBeGreaterThan(0);
    });

    /**
     * 🔴 `JSON.stringify` 는 객체 값의 `null` 을 지우지 않는다 — 서버 쪽은 안전하다.
     *    (배열 안 `undefined` 만 `null` 이 되고, 객체의 `undefined` 키가 사라진다)
     *    그러니 **`undefined` 를 쓰지 않는다** — 그건 왕복에서 사라진다.
     */
    it('🔴 직렬화해도 null 키가 살아 있다 (undefined 를 쓰지 않는다)', () => {
        const r = getDetourRegions(
            [{ x: 127.258, y: 37.410 }, { x: 127.112, y: 37.393 }, { x: 126.680, y: 37.790 }],
            10, 3,
        );
        const before = Object.keys(r!.progressKm).length;
        const after = Object.keys(JSON.parse(JSON.stringify(r!.progressKm))).length;
        expect(after).toBe(before);
    });
});

describe('🕳️ 앱 — 서버가 보낸 필터를 왕복시키지 않는다', () => {
    const client = () => code(app('api/ApiClient.kt'));

    /**
     * 🔴 `gson.toJson(...)` 으로 되말면 **null 이 사라진다.** 원본 문자열을 그대로 둔다.
     */
    it('🔴 필터를 Gson 으로 되말아 저장하지 않는다 (null 이 사라진다)', () => {
        expect(client()).not.toMatch(/gson\.toJson\(\s*scrapRes\.dispatchEngineArgs\s*\)/);
    });

    it('🔴 서버가 보낸 원문에서 필터를 꺼내 그대로 보관한다', () => {
        expect(client()).toMatch(/optJSONObject\("dispatchEngineArgs"\)/);
    });
});
