import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_FILTER_KEYS } from '@onedal/shared';
import db from '../../src/db';
import settingsRouter from '../../src/routes/settings';
import { getUserSession } from '../../src/state/userSessionStore';

/**
 * 💰 **요율표를 고쳐 저장하면 «앱이 받는 단가»도 바로 새 값이어야 한다**
 *
 * 앱은 이 표 하나로 콜을 거른다 — `fare ≥ deliveryDistance × ratePerKm[차종]`.
 * 그래서 저장이 세션까지 닿지 않으면 **집는 콜의 범위 자체가 옛 요율로 굳는다.**
 *
 * ── 왜 조용한가 ──
 *
 * ```
 * 기사님이 1t 요율을 1000 → 2000 으로 올려 저장
 *   DB            →  2000        (바뀜)
 *   설정 화면     →  2000        (GET /pricing 이 DB 를 읽는다 — 바뀐 것처럼 보인다)
 *   앱이 받는 표  →   770        ← 옛 요율 그대로            두 목소리
 * ```
 *
 * 화면이 새 값을 보여주므로 **기사님은 바뀐 줄 아신다.** 버그 대장 최다 클래스인
 * 「화면이 조용히 거짓말한다」이고, `callOptionsSave` 가 무는 #33 의 형제다.
 *
 * 🔴 방향이 양쪽이다 — 올렸는데 안 오르면 싼 콜을 계속 잡고, 내렸는데 안 내려가면
 *    좋은 콜을 통째로 못 본다.
 *
 * ── 왜 계산식 검사로는 못 잡나 ──
 *
 * `pricingModel` · `PricingEngine` 은 `rateFloorsFrom` 의 **식**을 고정한다. 식은 맞다.
 * 끊긴 곳은 «저장한 값이 그 식에 닿는가»라서, 저장 경로를 실제로 태워야만 보인다.
 */

const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const maybe = USER ? describe : describe.skip;

/**
 * `PUT /api/settings/pricing` 의 핸들러를 라우터에서 꺼내 직접 태운다.
 * 이 레포에 supertest 가 없어서인데, 그보다 **실제 라우트를 타는 것 자체가 요점**이다 —
 * 저장 로직을 검사가 옮겨 적으면 그 복사본만 초록불이 된다.
 */
function callPricingSave(body: any) {
    const layer: any = (settingsRouter as any).stack.find(
        (l: any) => l.route?.path === '/pricing' && l.route?.methods?.put
    );
    const stack = layer.route.stack;
    const handler = stack[stack.length - 1].handle;      // requireAuth 뒤의 본 핸들러
    const req: any = { user: { id: USER }, body, app: { get: () => undefined } };
    let failure: any = null;
    const res: any = {
        json: () => {},
        status: (code: number) => ({ json: (v: any) => { failure = { code, v }; } }),
    };
    handler(req, res);
    if (failure) throw new Error(`요율 저장이 실패했다: ${JSON.stringify(failure)}`);
}

const ratesInDb = (): Record<string, number> => JSON.parse(
    (db.prepare(`SELECT vehicle_rates FROM user_filters WHERE user_id = ?`).get(USER) as any).vehicle_rates
);
const feeInDb = (): number =>
    (db.prepare(`SELECT agency_fee_percent FROM user_filters WHERE user_id = ?`).get(USER) as any).agency_fee_percent;

/** 앱이 실제로 받는 값 — 피기백은 `session.activeFilter` 에서 뜬다 (`routes/scrap.ts`) */
const rateAppWillGet = (vehicle: string): number | undefined =>
    getUserSession(USER).activeFilter.ratePerKm?.[vehicle];

maybe('💰 요율표 저장이 앱이 받는 단가까지 닿는다', () => {
    let 원래요율: string;
    let 원래수수료: number;

    beforeAll(() => {
        getUserSession(USER);                       // 세션을 깨워 초기 파생값을 앉힌다
        원래요율 = JSON.stringify(ratesInDb());
        원래수수료 = feeInDb();
    });

    /** 🔴 기사님의 실제 설정값이다 — 검사가 바꿔 놓고 나가면 안 된다 */
    afterAll(() => {
        callPricingSave({ vehicleRates: JSON.parse(원래요율), agencyFeePercent: 원래수수료 });
    });

    it('🔴 요율을 올려 저장하면 앱이 받는 단가도 오른다', () => {
        const 수수료 = feeInDb();
        const 새표 = { ...ratesInDb(), '1t': 2000 };

        callPricingSave({ vehicleRates: 새표, agencyFeePercent: 수수료 });

        expect(ratesInDb()['1t']).toBe(2000);                       // DB 는 바뀐다 (여기까진 늘 통과했다)

        // 콜할인율은 건드리지 않았으니 그대로 쓴다 — 바뀐 것은 요율뿐이다
        const 할인율 = getUserSession(USER).activeFilter.callDiscountPct ?? 10;
        const 기대 = Math.round(2000 * (1 - 수수료 / 100) * (1 - 할인율 / 100));

        expect(rateAppWillGet('1t')).toBe(기대);
    });

    it('🔴 수수료율을 바꿔 저장해도 앱이 받는 단가가 따라온다', () => {
        const 표 = ratesInDb();
        callPricingSave({ vehicleRates: 표, agencyFeePercent: 30 });

        expect(feeInDb()).toBe(30);

        const 할인율 = getUserSession(USER).activeFilter.callDiscountPct ?? 10;
        const 기대 = Math.round(표['1t'] * 0.7 * (1 - 할인율 / 100));

        expect(rateAppWillGet('1t')).toBe(기대);
    });
});

describe('💰 단가표는 앱까지 내려가는 값이다 — 그래서 위의 검사가 필요하다', () => {
    it('`ratePerKm` 은 앱에 실리는 키다', () => {
        expect(APP_FILTER_KEYS).toContain('ratePerKm');
    });

    /**
     * 파생은 `filterManager` 한 곳에서만 만든다 (server/CLAUDE.md).
     * 🔴 저장 경로가 `rateFloorsFrom` 을 **직접** 부르면 표가 두 곳에서 태어난다 — 규칙 ③ 위반.
     */
    it('🔴 요율 저장 경로가 단가표를 스스로 만들지 않는다', () => {
        const 저장 = readFileSync(join(__dirname, '../../src/routes/settings.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(저장).not.toMatch(/rateFloorsFrom/);
    });
});
