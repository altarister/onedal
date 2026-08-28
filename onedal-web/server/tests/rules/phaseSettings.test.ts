import {
    PHASE_KEYS, PHASE_FIELDS, PHASE_LABEL, PHASE_AUTO_SOURCE,
    DEFAULT_PHASE_SETTINGS, normalizePhaseSettings,
    resolvePhaseKey, applyPhaseToFilter, phaseFromFlat,
} from "@onedal/shared";
import type { PhaseKey, PhaseSettings } from "@onedal/shared";

/**
 * 🔴 국면별 필터 설정 — docs/지금/필터.md §3 (2026-08-14 기사님 확정)
 *
 * 기사님: *"이번이 마지막 기준 설정이면 좋겠다. 또 오해가 있어서 잘못 만들지 말자."*
 *
 * 이 테스트는 **명세의 표를 그대로 고정한다.** 값이 바뀌면
 * "명세가 바뀐 것인가, 실수인가"를 먼저 물을 것.
 */
describe('국면 결정 — 두 축의 조합 (§2-4-1)', () => {

    it('첫짐 3종: 콜 0건일 때 callTarget 가 국면을 정한다', () => {
        expect(resolvePhaseKey('DEST',  'STANDBY')).toBe('first');
        expect(resolvePhaseKey('LOCAL', 'STANDBY')).toBe('local');
        expect(resolvePhaseKey('HOME',  'STANDBY')).toBe('home');
    });

    it('🔴 콜을 잡으면 어디서 출발했든 **합짐**이다 — 관내·복귀는 "첫짐의 자리"', () => {
        // 기사님: "첫짐-합짐-운행중-관내-합짐-운행중-복귀-합짐-운행중"
        for (const target of ['DEST', 'LOCAL', 'HOME']) {
            expect(resolvePhaseKey(target, 'GATHERING')).toBe('merge');
        }
    });

    it('🔴 출발하면 어디서 출발했든 **운행중**이다', () => {
        for (const target of ['DEST', 'LOCAL', 'HOME']) {
            expect(resolvePhaseKey(target, 'DELIVERING')).toBe('drive');
        }
    });

    it('알 수 없는 callTarget 는 노선행(DEST)으로 본다 (안전 기본값)', () => {
        expect(resolvePhaseKey('', 'STANDBY')).toBe('first');
        expect(resolvePhaseKey('???', 'STANDBY')).toBe('first');
    });

    it('진리표 9칸이 전부 정의돼 있다', () => {
        const seen = new Set<PhaseKey>();
        for (const h of ['DEST', 'LOCAL', 'HOME']) {
            for (const d of ['STANDBY', 'GATHERING', 'DELIVERING']) {
                seen.add(resolvePhaseKey(h, d));
            }
        }
        expect([...seen].sort()).toEqual(['drive', 'first', 'home', 'local', 'merge']);
    });
});

describe('국면 × 필드 표 (§2-4-5)', () => {

    it('다섯 국면이 **같은 5개 키**를 갖는다', () => {
        const keys = ['destinationCity', 'pickupRadiusKm', 'detourAllowKm', 'dropoffRadiusKm', 'discountPct'];
        for (const p of PHASE_KEYS) {
            expect(Object.keys(PHASE_FIELDS[p]).sort()).toEqual([...keys].sort());
            expect(Object.keys(DEFAULT_PHASE_SETTINGS[p]).sort()).toEqual([...keys].sort());
        }
    });

    it('명세 표 그대로 — 첫짐', () => {
        expect(PHASE_FIELDS.first).toEqual({
            destinationCity: 'input', pickupRadiusKm: 'input',
            detourAllowKm: 'hidden', dropoffRadiusKm: 'input', discountPct: 'input',
        });
    });

    /**
     * 🔴 **합짐·주행중의 도착 목표는 `hidden` → `auto` 로 바뀌었다** (기사님 확정 2026-08-25).
     *
     * 기사님: *"가남→세종대왕면 , 가남→점동면 둘다 콜이 올라와야 한다고 난 보는데."*
     *
     * 콜을 잡는 순간 도착 목표가 판정에서 사라지는데 **화면에는 그대로 적혀 있었다**
     * (규칙 ⑤-4 ④ — 화면이 조용히 거짓말한다). 이제 첫짐에서 상속해 판정에 쓰므로
     * 화면에도 보여야 한다. 노선인 동안 목적지는 안 바뀌니 **못 고친다**(`auto`).
     * 근거는 tests/rules/destinationSurvivesPhase.test.ts.
     */
    it('명세 표 그대로 — 합짐 (도착 목표는 첫짐에서 상속 · 상차 반경 숨김 · 우회 입력)', () => {
        expect(PHASE_FIELDS.merge).toEqual({
            destinationCity: 'auto', pickupRadiusKm: 'hidden',
            detourAllowKm: 'input', dropoffRadiusKm: 'input', discountPct: 'input',
        });
    });

    it('명세 표 그대로 — 운행중 (도착 목표 상속 · 우회와 콜할인율)', () => {
        expect(PHASE_FIELDS.drive).toEqual({
            destinationCity: 'auto', pickupRadiusKm: 'hidden',
            detourAllowKm: 'input', dropoffRadiusKm: 'hidden', discountPct: 'input',
        });
    });

    it('명세 표 그대로 — 관내 (기준 지역만 · 반경 없음)', () => {
        // 관내는 거리로 자르지 않는다. 같은 시 안이면 통과다
        expect(PHASE_FIELDS.local).toEqual({
            destinationCity: 'override', pickupRadiusKm: 'hidden',
            detourAllowKm: 'hidden', dropoffRadiusKm: 'hidden', discountPct: 'input',
        });
    });

    it('명세 표 그대로 — 복귀 (집 주소 표시 · 우회 입력)', () => {
        // 복귀는 "최종 하차지 → 집" 이라는 **경로**가 생기는 국면이다.
        // 두 점 반경(상차·하차) 둘이 아니라 길 위 우회 하나가 그 뜻이다
        expect(PHASE_FIELDS.home).toEqual({
            destinationCity: 'auto', pickupRadiusKm: 'hidden',
            detourAllowKm: 'input', dropoffRadiusKm: 'hidden', discountPct: 'input',
        });
    });

    it('🔴 도착 도시를 기사님이 **직접 적는** 국면은 첫짐뿐이다', () => {
        // 관내는 override — 자동이 기본이고 다른 시로 덮을 수 있다.
        // 나머지는 경로·집 주소에서 파생된다 (저장하면 낡은 값이 남는다)
        const inputs = PHASE_KEYS.filter(p => PHASE_FIELDS[p].destinationCity === 'input');
        expect(inputs).toEqual(['first']);
        expect(PHASE_KEYS.filter(p => PHASE_FIELDS[p].destinationCity === 'override')).toEqual(['local']);
    });

    it('auto 인 국면은 그 출처를 화면에 말할 수 있어야 한다', () => {
        for (const p of PHASE_KEYS) {
            if (PHASE_FIELDS[p].destinationCity === 'auto') {
                expect(PHASE_AUTO_SOURCE[p]).toBeTruthy();
            }
        }
    });

    it('단가 할인율은 **모든 국면에서** 기사님이 정한다', () => {
        for (const p of PHASE_KEYS) expect(PHASE_FIELDS[p].discountPct).toBe('input');
    });

    it('라벨이 다섯 국면 모두 있다', () => {
        for (const p of PHASE_KEYS) expect(PHASE_LABEL[p]).toBeTruthy();
    });
});

describe('기본값 (§2-4-5)', () => {

    it('운행중 경유 = 0 — 우회할 여유가 없어서 출발한 것이다', () => {
        expect(DEFAULT_PHASE_SETTINGS.drive.detourAllowKm).toBe(0);
    });

    it('합짐 경유 = 5 · 하차 반경 = 3', () => {
        expect(DEFAULT_PHASE_SETTINGS.merge.detourAllowKm).toBe(5);
        expect(DEFAULT_PHASE_SETTINGS.merge.dropoffRadiusKm).toBe(3);
    });

    it('관내 하차 반경 = 0 (같은 시 안) · 할인율 20% (짧아서 금액이 작다)', () => {
        expect(DEFAULT_PHASE_SETTINGS.local.dropoffRadiusKm).toBe(0);
        expect(DEFAULT_PHASE_SETTINGS.local.discountPct).toBe(20);
    });
});

describe('조각 → 평면 매핑 (§2-4-6)', () => {

    const s: PhaseSettings = {
        destinationCity: '파주시', pickupRadiusKm: 7,
        detourAllowKm: 4, dropoffRadiusKm: 2, discountPct: 30,
    };

    it('🔴 새 이름 → 평면(앱 피기백) 옛 이름으로 옮긴다', () => {
        const flat = applyPhaseToFilter('first', s);
        expect(flat.pickupRadiusKm).toBe(7);
        expect(flat.detourRadiusKm).toBe(4);        // detourAllowKm
        expect(flat.destinationRadiusKm).toBe(2);     // dropoffRadiusKm
        expect(flat.callDiscountPct).toBe(30);             // discountPct
    });

    it('🔴 도착 도시는 input(첫짐)과 **덮어쓴** override(관내)에서만 내보낸다', () => {
        // auto 인 국면에서 저장값(대개 빈 문자열)이 서버 파생값을 덮으면 안 된다
        expect(applyPhaseToFilter('first', s).destinationCity).toBe('파주시');
        for (const p of ['merge', 'drive', 'home'] as PhaseKey[]) {
            expect(applyPhaseToFilter(p, s).destinationCity).toBeUndefined();
        }
        // 관내: 값을 골랐으면 그 값이, 비워 뒀으면(=자동) 아무것도 안 나간다
        expect(applyPhaseToFilter('local', s).destinationCity).toBe('파주시');
        expect(applyPhaseToFilter('local', { ...s, destinationCity: '' }).destinationCity).toBeUndefined();
    });

    it('평면 → 조각 (마이그레이션·폼 초기화)', () => {
        const back = phaseFromFlat(
            { pickupRadiusKm: 1, detourRadiusKm: 1, destinationRadiusKm: 1, callDiscountPct: 20, destinationCity: '용인시' },
            DEFAULT_PHASE_SETTINGS.first,
        );
        expect(back).toEqual({
            destinationCity: '용인시', pickupRadiusKm: 1,
            detourAllowKm: 1, dropoffRadiusKm: 1, discountPct: 20,
        });
    });

    it('평면에 값이 없으면 폴백을 쓴다 (없는 숫자를 지어내지 않는다)', () => {
        const back = phaseFromFlat({}, DEFAULT_PHASE_SETTINGS.merge);
        expect(back).toEqual(DEFAULT_PHASE_SETTINGS.merge);
    });
});

describe('저장 JSON 방어 (§2-4-7)', () => {

    it('빈 값·null 이어도 온전한 5국면 맵이 나온다', () => {
        for (const raw of [null, undefined, {}, '깨진문자열', 42]) {
            const m = normalizePhaseSettings(raw);
            expect(Object.keys(m).sort()).toEqual([...PHASE_KEYS].sort());
        }
    });

    it('일부 국면·일부 필드만 저장돼 있어도 나머지는 기본값으로 채운다', () => {
        const m = normalizePhaseSettings({ first: { pickupRadiusKm: 3 } });
        expect(m.first.pickupRadiusKm).toBe(3);
        expect(m.first.dropoffRadiusKm).toBe(DEFAULT_PHASE_SETTINGS.first.dropoffRadiusKm);
        expect(m.home).toEqual(DEFAULT_PHASE_SETTINGS.home);
    });

    it('숫자가 아닌 값이 들어와도 기본값으로 떨어진다', () => {
        const m = normalizePhaseSettings({ merge: { detourAllowKm: '다섯', discountPct: null } });
        expect(m.merge.detourAllowKm).toBe(DEFAULT_PHASE_SETTINGS.merge.detourAllowKm);
        expect(m.merge.discountPct).toBe(DEFAULT_PHASE_SETTINGS.merge.discountPct);
    });
});
