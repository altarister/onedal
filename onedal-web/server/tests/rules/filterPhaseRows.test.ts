import { readFileSync } from 'fs';
import { join } from 'path';
import { FILTER_FIELDS, filterValuesFrom, DEFAULT_FILTER_VALUES, reachRadiusKm } from '@onedal/shared';

/**
 * 🎛️ **값 다섯의 그릇** — 컬럼·폼·기본값의 원천은 `FILTER_FIELDS` 표 하나다.
 *
 * 🔄 **개정 2026-09-11 — 그릇이 다섯 행에서 «한 행»이 됐다** (이식 C3-3b).
 *    이 파일은 원래 «phase_settings blob → `user_filter_phases` 다섯 행» 병행 전환을
 *    지키던 검사다. 그 전환은 끝났고, 2026-09-11 에 **값이 한 벌**이 되며
 *    다섯 행이 통째로 걷혔다 — 기사님: *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * 🔴 **지키는 뜻은 그대로다**: 표 하나가 컬럼과 폼을 만들고, **없는 값을 지어내지 않는다.**
 */

const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('FILTER_FIELDS — 표 하나가 컬럼·폼을 다 만든다', () => {
    it('표의 경로가 기본값과 1:1 이다 (칸이 늘면 표에만 한 줄)', () => {
        const paths = FILTER_FIELDS.map(f => f.path).sort();
        expect(paths).toEqual(Object.keys(DEFAULT_FILTER_VALUES).sort());
        expect(new Set(FILTER_FIELDS.map(f => f.col)).size).toBe(FILTER_FIELDS.length);
    });

    /**
     * 🔴 **이름이 «한 벌»이다** (이식 C3-3b). 예전엔 국면 그릇과 평면(앱 피기백)이
     *    같은 값을 다르게 불러 `applyPhaseToFilter` 가 사이를 옮겼다.
     *    표의 `path` 가 **평면 이름 그대로**라 이제 옮길 것이 없다.
     */
    it('🔴 표의 경로가 평면(앱 피기백) 이름이다 — 옮길 다리가 없다', () => {
        expect(FILTER_FIELDS.map(f => f.path)).toEqual(
            ['destinationCity', 'pickupRadiusKm', 'detourRadiusKm',
             'destinationRadiusKm', 'callDiscountPct']);
    });

    it('행 값이 없거나 이상하면 표 기본값으로 메운다 (지어내지 않는다)', () => {
        expect(filterValuesFrom(null).callDiscountPct).toBe(DEFAULT_FILTER_VALUES.callDiscountPct);
        expect(filterValuesFrom({ call_discount_pct: 'abc' }).callDiscountPct)
            .toBe(DEFAULT_FILTER_VALUES.callDiscountPct);
        expect(filterValuesFrom({ call_discount_pct: 999 }).callDiscountPct).toBe(100);   // 범위 자름
    });

    /**
     * 🔴 **칸이 NULL 이면 «0» 이 아니라 «없다» 다**.
     *
     * `Number(null) === 0` 이고 `Number.isFinite(0)` 이라, 새로 판 칸이 NULL 인 기존 행을
     * 읽으면 **0 이 기본값을 이긴다.** 마름모 셋을 판 날 바로 드러났다 —
     * 필터 화면에 **출발각 0°** 가 떴고, 0° 는 그물이 아예 닫히는 값이다.
     * ⚠️ 지금은 테스트 단계라 마이그레이션을 안 한다 — **새 칸은 늘 이 모양으로 태어난다.**
     */
    it('🔴 행은 있는데 칸이 NULL 이면 기본값이다 — 0 으로 읽지 않는다', () => {
        const blankRow: Record<string, unknown> = { user_id: 'x' };
        for (const f of FILTER_FIELDS) blankRow[f.col] = null;
        expect(filterValuesFrom(blankRow)).toEqual(DEFAULT_FILTER_VALUES);
        // 칸이 아예 없는 행(옛 스키마)도 같다
        expect(filterValuesFrom({ user_id: 'x' }).pickupRadiusKm).toBe(DEFAULT_FILTER_VALUES.pickupRadiusKm);
        // 🔴 진짜 0 은 여전히 0 이다 (라인반경 0 = "가는 길 위의 콜만")
        expect(filterValuesFrom({ detour_radius_km: 0 }).detourRadiusKm).toBe(0);
        // 빈 글자도 «없다» 로 읽는다
        expect(filterValuesFrom({ destination_city: '' }).destinationCity).toBe(DEFAULT_FILTER_VALUES.destinationCity);
    });

    /** 🔴 평면 이름으로도, DB 컬럼 이름으로도 읽는다 — 두 그릇을 오가야 해서 */
    it('평면 이름과 DB 컬럼 이름을 둘 다 읽는다', () => {
        expect(filterValuesFrom({ pickupRadiusKm: 22 }).pickupRadiusKm).toBe(22);
        expect(filterValuesFrom({ pickup_radius_km: 22 }).pickupRadiusKm).toBe(22);
    });
});

describe('⏱️ 시간 축 — 계수 확정 전엔 거르지 않고 계측만 (기사님 확정 3 강화)', () => {
    it('도달 분 → 반경 km (잠정 계수 1.5분/km)', () => {
        expect(reachRadiusKm(30)).toBe(20);        // 시계 30분 ≈ 20km
        expect(reachRadiusKm(0)).toBe(0);          // 여유 없음 — 지어내지 않는다
        expect(reachRadiusKm(-5)).toBe(0);
        expect(reachRadiusKm(45, 1.5)).toBe(30);
    });

    it('🔴 심사가 계수 재료(직선↔카카오 분)를 수집하고, dryRun 반경은 로그뿐이다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/도달 계수 수집/);
        expect(ev).toMatch(/도달 반경 dryRun/);
        // 🔴 파생 반경이 필터를 조이지 않는다 — pickupRadiusKm 에 대입하는 코드가 없어야 한다
        expect(ev).not.toMatch(/pickupRadiusKm\s*=/);
    });
});

describe('값 다섯의 원천은 «한 행»이다 (이식 C3-3b · 2026-09-11)', () => {
    it('🔴 saveBaseFilter 가 값 다섯을 같은 행에 쓴다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        const fn = fm.slice(fm.indexOf('function saveBaseFilter'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).toMatch(/filterValuesFrom\(b as any\)/);
        /* 🔴 다섯 행에 같은 값을 다섯 번 쓰던 길이 없다 */
        expect(body).not.toMatch(/writePhaseRows/);
    });

    it('🔴 로그인의 읽기 원천도 그 행이다 — 없으면 표 기본값 (지어내지 않는다)', () => {
        const store = codeOnly(read('state/userSessionStore.ts'));
        expect(store).toMatch(/loadFilterValues\(userId\)/);
        expect(store).not.toMatch(/loadPhaseRows/);
        const fm = codeOnly(read('state/filterManager.ts'));
        const fn = fm.slice(fm.indexOf('function loadFilterValues'));
        expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/filterValuesFrom\(row\)/);
    });

    /**
     * 🔴 **두 번째 편집 화면을 되살리지 않는다** (전수 조사 8장 · 기사님 확정 폐기).
     * 요율 탭의 "내 노선 기본 설정" 4칸은 국면 첫짐 탭과 같은 값의 두 번째 편집
     * 화면이었고, 평면 1km vs 국면 15km "두 벌 값" 사고의 뿌리였다.
     * 절대 하한가·상한가 입력도 함께 폐기 — 하한은 단가표 × 콜할인율 파생만.
     */
    it('🔴 요율 탭에 노선·반경·절대가·블랙리스트 편집이 없다 (편집 자리는 🔍 필터 하나)', () => {
        const tab = codeOnly(readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/settings/PricingSettingsTab.tsx'), 'utf8'));
        expect(tab).not.toMatch(/setDestinationCity|setDestinationRadiusKm|setDetourRadiusKm/);
        expect(tab).not.toMatch(/setMinFare|setMaxFare|setPickupRadiusKm/);
        expect(tab).toMatch(/vehicleRates/);          // 금액 축의 원천은 남는다
    });

    it('🔴 컬럼 목록을 db.ts 가 손으로 적지 않는다 (FILTER_FIELDS 표에서 뽑는다)', () => {
        const db = codeOnly(read('db.ts'));
        expect(db).toMatch(/FILTER_FIELDS\.map/);
        expect(db).toMatch(/FILTER_VALUE_COLS/);
        /* 🔴 다섯 행짜리 옛 표가 없다 */
        expect(db).not.toMatch(/CREATE TABLE IF NOT EXISTS user_filter_phases/);
        expect(db).not.toMatch(/pickup_radius_km\s+REAL,\s*\n\s*detour_allow_km/);   // 손 나열 금지
    });
});
