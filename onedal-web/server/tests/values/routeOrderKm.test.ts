import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initGeoService, getDetourRegions } from '../../src/services/geoService';
import { buildAppOrderKm, rememberDetourProgress } from '../../src/state/filterManager';

/**
 * 🧭 버그 대장 #78 — **경로 순서가 지리를 뒤집는다** (2026-08-30 실폰 2회 재현)
 *
 * 7지점 판(집→모다→신둔농협 · 카카오 실경로 19.2km)에서:
 *   · 03 곤지암성당→이천제일 — 신둔 «가는 길목»인데 "2.2km 후진"으로 차단 (미탐)
 *   · 07 이천터미널→신둔    — 신둔을 «지나친 곳»인데 순방향으로 보여 잡힘 (오탐)
 *
 * 뿌리: 한 값(progressKm)이 두 사실을 답하고 있었다 (#76 과 동형).
 *   ① 트림 «언제 빼도 안전한가» — 동의 반지름(pad)을 더하고, 하차원 안이면 Infinity.
 *      늦게 빼기 위한 **안전 방향**이라 트림에는 맞다.
 *   ② 순서 «경로 어디쯤인가» — 같은 값을 그대로 썼다. 곤지암읍은 pad(수 km)가
 *      하차원 판정까지 부풀려 «하차지 원 안 → Infinity → 경로 끝(19.2km)»이 됐고,
 *      실제로는 6km 길목인 동네가 **경로 끝보다 뒤**가 되어 순서가 뒤집혔다.
 *
 * 수리: 값을 둘로 가른다 — 트림용 progressKm 은 그대로, 순서용 orderKm(순수 스냅점)을
 * 따로 만들어 앱 피기백(buildAppOrderKm)은 orderKm 만 쓴다.
 *
 * 고정본은 그날 서버가 실제로 부른 URL 그대로 받아 둔 카카오 경로다
 * (fixtures/route-home-moda-sindun.json · 350점 · 19,202m). 카카오를 다시 부르지 않는다.
 */

beforeAll(() => {
    initGeoService();
});

const line: Array<{ x: number; y: number }> = JSON.parse(
    readFileSync(join(__dirname, '../fixtures/route-home-moda-sindun.json'), 'utf8'),
);

// 실폰 판과 같은 반경 — 합짐 국면: 경유 3km · 하차 1km (서버 로그 14:28:33 그대로)
const regions = () => getDetourRegions(line, 3, 1)!;

const sessionWith = (r: ReturnType<typeof regions>) => {
    const session = {
        activeFilter: { destinationKeywords: r.flat },
        myOrders: [{ status: 'ORDER_CONFIRMED', routePolyline: line }],
    } as any;
    rememberDetourProgress(session, r);
    return session;
};

describe('#78 순서용 값은 지리를 지킨다 — 앱에 내려가는 경로 순서', () => {
    it('🔴 곤지암읍(길목)은 관고동·신둔면(끝쪽)보다 앞이다 — 03 미탐의 재현 지점', () => {
        const out = buildAppOrderKm(sessionWith(regions()));

        // 실폰 로그: 곤지암 19.20 > 관고 17.04 → "2.2km 후진" 차단. 지리는 그 반대다.
        expect(out['곤지암읍']).not.toBeNull();
        expect(out['관고동']).not.toBeNull();
        expect(out['신둔면']).not.toBeNull();
        expect(out['곤지암읍'] as number).toBeLessThan(out['관고동'] as number);
        expect(out['곤지암읍'] as number).toBeLessThan(out['신둔면'] as number);
    });

    it('집 앞 초월읍이 맨 앞이다', () => {
        const out = buildAppOrderKm(sessionWith(regions()));
        expect(out['초월읍'] as number).toBeLessThan(out['곤지암읍'] as number);
    });

    it('실어 보내는 값은 전부 JSON 왕복이 된다 — Infinity 가 새지 않는다', () => {
        const out = buildAppOrderKm(sessionWith(regions()));
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
        for (const v of Object.values(out)) {
            if (v !== null) expect(Number.isFinite(v)).toBe(true);
        }
    });
});

describe('#78 트림용 값은 그대로다 — 비대칭은 결정이다', () => {
    it('트림용 progressKm 은 여전히 pad·Infinity 를 쓴다 (늦게 빼기 위해 — 안전 방향)', () => {
        const r = regions();
        // 곤지암읍은 커서(pad 수 km) 하차원 판정에 걸린다 — 트림에서는 "영원히 남긴다"가 맞다
        expect(r.progressKm['곤지암읍']).toBe(Infinity);
    });
});
