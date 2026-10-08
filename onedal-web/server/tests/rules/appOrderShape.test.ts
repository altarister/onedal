import { readFileSync } from 'fs';
import { join } from 'path';
import type { SimplifiedOfficeOrder } from '@onedal/shared';

/**
 * 📋 **앱과 서버가 «콜 한 건»을 적는 양식은 칸 이름이 같다** (기사님 지시).
 *
 * 앱이 서버로 콜을 보낼 때 쓰는 양식이 **두 장**이다 —
 *   · 앱:  `onedal-app/.../models/SharedModels.kt` 의 `SimplifiedOfficeOrder` (Kotlin)
 *   · 서버: `@onedal/shared` 의 `SimplifiedOfficeOrder` (TypeScript)
 *
 * 🔴 **일부러 두 장이다** — Kotlin 은 TypeScript 파일을 읽을 수 없어서 한 장을 같이 못 쓴다.
 *    두 장을 잇는 것은 **칸 이름 글자가 같다**는 사실 하나뿐이다: 앱은 칸 이름을 그대로
 *    JSON 키로 보내고(Gson), 서버는 그 키를 이름으로 찾는다.
 *
 * 🔴 **한쪽만 이름을 바꾸면 아무 검사도 안 운다** — 앱 컴파일·앱 단위검사·서버 tsc·jest 가
 *    각자 자기 파일 안에서는 멀쩡하기 때문이다. 서버는 새 이름을 찾다 «값이 없네» 하고
 *    빈칸으로 받고, 관제웹에는 «못 잼»으로만 드러난다 (서버가 앱이 보낸 칸을
 *    저장에서 버리는 것도 같은 모양이다 — 그쪽은 `intelColumns` 가 막는다).
 *
 * 두 장을 손으로 대조하는 대신 이 검사가 칸 이름을 맞춰 본다.
 * ⚠️ **이름만 본다** — 타입(숫자·글자)과 «비어도 되나»는 안 본다.
 */

const APP_MODELS = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt');

/** 📱 앱 양식의 칸 이름 */
function appFields(): string[] {
    const src = readFileSync(APP_MODELS, 'utf8');
    const start = src.indexOf('data class SimplifiedOfficeOrder(');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n)', start))
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, '');
    return [...body.matchAll(/\bva[lr]\s+(\w+)\s*:/g)].map(m => m[1]);
}

/**
 * 🖥️ 서버 양식의 칸 이름 — 글자가 아니라 타입에서 뽑는다.
 *    `Required<…>` 라 칸이 빠진 견본은 타입 오류이고, 양식에 없는 칸을 적어도 타입 오류다 — 견본의 키가 곧 양식의 칸이다.
 */
function serverFields(): string[] {
    const sample: Required<SimplifiedOfficeOrder> = {
        itemSize: null, tagsText: null, verdict: null,
        id: 'c1', type: 'NEW_ORDER', pickup: '경기 광주 오포', dropoff: '이천시 신둔면', fare: 45000, timestamp: '2026-01-01T00:00:00.000Z',
        postTime: '12:23', scheduleText: '', vehicleType: '1t', rawText: '',
        pickupX: 0, pickupY: 0, dropoffX: 0, dropoffY: 0, pickupDistance: 0, deliveryDistance: 0,
        isSimulated: false, reserved: null, reservedDay: null, reservedAt: null,
    };
    return Object.keys(sample);
}

describe('📋 앱과 서버의 콜 양식 — 칸 이름이 같다', () => {
    const app = appFields();
    const server = serverFields();

    it('두 양식을 실제로 읽었다 — 못 읽고 «둘 다 비어서 같다»가 되지 않게', () => {
        expect(app.length).toBeGreaterThanOrEqual(10);
        expect(server.length).toBeGreaterThanOrEqual(10);
    });

    it('🔴 앱 양식에만 있는 칸이 없다 — 앱이 보내는데 서버가 이름을 모른다', () => {
        expect(app.filter(f => !server.includes(f))).toEqual([]);
    });

    it('🔴 서버 양식에만 있는 칸이 없다 — 서버가 기다리는데 앱이 안 보낸다', () => {
        expect(server.filter(f => !app.includes(f))).toEqual([]);
    });
});
