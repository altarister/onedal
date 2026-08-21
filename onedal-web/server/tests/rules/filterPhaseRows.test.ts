import { readFileSync } from 'fs';
import { join } from 'path';
import { FILTER_FIELDS, phaseRowOf, phaseOfRow, phaseStoreDiff, reachRadiusKm,
         DEFAULT_PHASE_SETTINGS, PHASE_KEYS, normalizePhaseSettings } from '@onedal/shared';

/**
 * 🎛️ **국면 옵션 병행 전환** (필터 확정안 v2 · 기사님 확정 2026-08-21)
 *
 * phase_settings JSON blob → user_filter_phases 테이블(행 = 사용자×국면).
 * 전환은 병행 비교 방식: 새 그릇을 옆에 세우고 → 양쪽에 같이 쓰며 비교 →
 * 조용해지면 읽기 전환 → blob 손 철거. (여섯 단계 치환·판정 dryRun 과 같은 순서)
 *
 * 컬럼·폼·기본값의 원천은 FILTER_FIELDS 표 하나다 (JUDGMENT_FIELDS 와 같은 문법).
 */

const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('FILTER_FIELDS — 표 하나가 컬럼·폼·비교를 다 만든다', () => {
    it('표의 경로가 PhaseSettings 와 1:1 이다 (칸이 늘면 표에만 한 줄)', () => {
        const paths = FILTER_FIELDS.map(f => f.path).sort();
        expect(paths).toEqual(Object.keys(DEFAULT_PHASE_SETTINGS.first).sort());
        expect(new Set(FILTER_FIELDS.map(f => f.col)).size).toBe(FILTER_FIELDS.length);
    });

    it('설정 ↔ 행 왕복해도 값이 안 변한다', () => {
        for (const key of PHASE_KEYS) {
            const s = DEFAULT_PHASE_SETTINGS[key];
            expect(phaseOfRow(phaseRowOf(s), key)).toEqual(s);
        }
    });

    it('행 값이 없거나 이상하면 그 국면의 기본값으로 메운다 (지어내지 않는다)', () => {
        expect(phaseOfRow(null, 'local').discountPct).toBe(DEFAULT_PHASE_SETTINGS.local.discountPct);
        expect(phaseOfRow({ discount_pct: 'abc' }, 'first').discountPct)
            .toBe(DEFAULT_PHASE_SETTINGS.first.discountPct);
        expect(phaseOfRow({ discount_pct: 999 }, 'first').discountPct).toBe(100);   // 범위 자름
    });

    it('🧪 병행 비교 — 어긋난 칸을 이름으로 짚는다', () => {
        const blob = normalizePhaseSettings(null);
        const rows = { ...blob, first: { ...blob.first, pickupRadiusKm: 99 } };
        const diffs = phaseStoreDiff(blob, rows);
        expect(diffs).toEqual(['first.pickup_radius_km: blob=10 행=99']);
        expect(phaseStoreDiff(blob, blob)).toEqual([]);
    });

    it('행이 아예 없으면 "행 없음" — 이식이 안 된 것', () => {
        const blob = normalizePhaseSettings(null);
        const { first, ...rest } = blob as any;
        expect(phaseStoreDiff(blob, rest)).toContain('first: 행 없음');
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

describe('국면 옵션의 원천은 행 하나다 (병행 전환 완료 · ④)', () => {
    it('🔴 saveBaseFilter 가 행(user_filter_phases)에 쓴다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        const fn = fm.slice(fm.indexOf('function saveBaseFilter'));
        expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/writePhaseRows\(/);
    });

    it('🔴 로그인의 읽기 원천은 행이다 — 행이 없는 건 신규 유저뿐, 표 기본값으로 시드한다', () => {
        const store = codeOnly(read('state/userSessionStore.ts'));
        // 행에서 읽은 값이 세션의 평소값이 된다
        expect(store).toMatch(/session\.basePhaseSettings = loadPhaseRows\(/);
        const fm = codeOnly(read('state/filterManager.ts'));
        const fn = fm.slice(fm.indexOf('function loadPhaseRows'));
        expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/normalizePhaseSettings\(rows\)/);
        expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/writePhaseRows\(userId, seeded\)/);
    });

    /**
     * 🔴 **두 번째 편집 화면을 되살리지 않는다** (전수 조사 8장 · 기사님 확정 폐기).
     * 요율 탭의 "내 노선 기본 설정" 4칸은 국면 첫짐 탭과 같은 값의 두 번째 편집
     * 화면이었고, 평면 1km vs 국면 15km "두 벌 값" 사고의 뿌리였다.
     * 절대 하한가·상한가 입력도 함께 폐기 — 하한은 단가표 × 콜할인율 파생만.
     */
    it('🔴 요율 탭에 노선·반경·절대가 편집이 없다 (편집 자리는 국면 탭 하나)', () => {
        const tab = codeOnly(readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/settings/PricingSettingsTab.tsx'), 'utf8'));
        expect(tab).not.toMatch(/setDestinationCity|setDestinationRadiusKm|setDetourRadiusKm/);
        expect(tab).not.toMatch(/setMinFare|setMaxFare|setPickupRadiusKm/);
        expect(tab).toMatch(/vehicleRates/);          // 금액 축의 원천은 남는다
        expect(tab).toMatch(/excludedKeywords/);
    });

    it('🔴 컬럼 목록을 db.ts 가 손으로 적지 않는다 (FILTER_FIELDS 표에서 뽑는다)', () => {
        const db = codeOnly(read('db.ts'));
        expect(db).toMatch(/FILTER_FIELDS\.map/);
        expect(db).toMatch(/ensureColumns\('user_filter_phases', FILTER_PHASE_COLS\)/);
        expect(db).not.toMatch(/pickup_radius_km\s+REAL,\s*\n\s*detour_allow_km/);   // 손 나열 금지
    });
});
