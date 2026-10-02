import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initGeoService, getDetourRegions } from '../../src/services/geoService';

/**
 * 🧭 **동의 실제 경로상 자리(orderKm)는 지리를 지킨다** — 띠로만 든 동의 지나온 구간 빼기 진행도가 이 값을 읽는다.
 *
 * 한 값이 두 사실을 답하면 뒤집힌다: 트림용 progressKm 은 «언제 빼도 안전한가»라 동의 반지름(pad)을 더하고
 * 하차원 안이면 Infinity 다 — 곤지암읍(실제 6km 길목)이 «경로 끝 뒤»가 된다. 그래서 동의 자리는 orderKm(순수 스냅점)이 따로 답한다.
 *
 * 고정본은 카카오 실경로(집→모다→신둔농협 · fixtures/route-home-moda-sindun.json · 350점 · 19,202m)다. 카카오를 다시 부르지 않는다.
 */

beforeAll(() => {
    initGeoService();
});

const line: Array<{ x: number; y: number }> = JSON.parse(
    readFileSync(join(__dirname, '../fixtures/route-home-moda-sindun.json'), 'utf8'),
);

// 합짐 국면 반경 — 경유 3km · 하차 1km
const regions = () => getDetourRegions(line, 3, 1)!;

describe('동의 자리(orderKm)는 지리를 지킨다', () => {
    it('🔴 곤지암읍(길목)은 관고동·신둔면(끝쪽)보다 앞이다', () => {
        const at = regions().orderKm;
        expect(at['곤지암읍']).toBeLessThan(at['관고동']);
        expect(at['곤지암읍']).toBeLessThan(at['신둔면']);
    });

    it('집 앞 초월읍이 맨 앞이다', () => {
        const at = regions().orderKm;
        expect(at['초월읍']).toBeLessThan(at['곤지암읍']);
    });

    it('값은 전부 유한하다 — Infinity 가 섞이지 않는다', () => {
        for (const v of Object.values(regions().orderKm)) expect(Number.isFinite(v)).toBe(true);
    });
});

describe('#78 트림용 값은 그대로다 — 비대칭은 결정이다', () => {
    it('트림용 progressKm 은 여전히 pad·Infinity 를 쓴다 (늦게 빼기 위해 — 안전 방향)', () => {
        const r = regions();
        // 곤지암읍은 커서(pad 수 km) 하차원 판정에 걸린다 — 트림에서는 "영원히 남긴다"가 맞다
        expect(r.progressKm['곤지암읍']).toBe(Infinity);
    });
});
