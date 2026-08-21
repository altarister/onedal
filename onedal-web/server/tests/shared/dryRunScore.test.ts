import { scoreDryRun, describeDryRun, marginalDetourMin, DEFAULT_JUDGMENT } from '@onedal/shared';

/**
 * 🧪 **새 판정 채점기** — 판정색_확정안 v2 (기사님 확정 2026-08-21)
 *
 * 문지기 실패 = 🔴 '사고' 고정 · 축 셋 가중 평균 → 색 · 딱지는 사실만.
 * 환산식은 초안 — 문제지(13~16) 캘리브레이션에서 숫자가 움직일 수 있다.
 * 여기서 못박는 것은 **구조**다: 낙제의 두 뿌리(요율 재계산 · 절대치 감점)가
 * 다시 못 들어오게, 그리고 노하우 콜의 채점 방향이 옳게.
 */

const cfg = DEFAULT_JUDGMENT;   // 색 경계 꿀70/보통40 (기존 보존)

describe('scoreDryRun — 확정안 v2 구조', () => {
    it('🔴 문지기 실패 = 사고(🔴) 고정 — 점수가 높아도 색은 사고다', () => {
        const v = scoreDryRun({
            kind: 'merge', fare: 90000, detourExtraMin: 10, bufferAfterMin: 60, slotsFreePct: 90,
            gates: [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: false,
                      why: '잡으면 상갈동 하차 약속이 12분 깨집니다' }],
            tags: [],
        }, cfg);
        expect(v.color).toBe('사고');
        expect(v.score).toBeGreaterThan(70);        // 축점은 계산해 둔다 — 캘리브레이션 재료
        expect(describeDryRun(v)).toContain('잡으면 사고');
        expect(describeDryRun(v)).toContain('상갈동');
    });

    it('노하우 콜의 방향 — 3.5만 벌러 40분 돌면 좋은 콜, 5천원이면 나쁜 콜', () => {
        const good = scoreDryRun({ kind: 'merge', fare: 35000, detourExtraMin: 40,
            bufferAfterMin: 40, gates: [], tags: [] }, cfg);
        const bad = scoreDryRun({ kind: 'merge', fare: 5000, detourExtraMin: 40,
            bufferAfterMin: 40, gates: [], tags: [] }, cfg);
        // 같은 40분 — 요금이 순증 축을 가른다 (절대치 문턱이면 둘 다 같은 감점이었다)
        expect(good.axes.find(a => a.key === 'revenuePerDetour')!.score).toBe(100);  // 5.2만/h
        expect(bad.axes.find(a => a.key === 'revenuePerDetour')!.score).toBe(25);    // 0.75만/h
        expect(good.color).toBe('꿀');
        expect(good.score).toBeGreaterThan(bad.score);
        expect(bad.color).not.toBe('꿀');
    });

    it('길목 콜(우회 ≤ 0분)은 순증 축 만점 — 꼬리 하차 0 > 길목 > 크게 소비 (16-7)', () => {
        const v = scoreDryRun({ kind: 'merge', fare: 35000, detourExtraMin: 0,
            bufferAfterMin: 35, gates: [], tags: [] }, cfg);
        expect(v.axes.find(a => a.key === 'revenuePerDetour')!.score).toBe(100);
        expect(v.color).toBe('꿀');
    });

    it('버퍼 곡선 — 30분 남으면 100 · 0분 40 · 음수 0', () => {
        const at = (bufferAfterMin: number) => scoreDryRun({ kind: 'merge', fare: 35000,
            detourExtraMin: 30, bufferAfterMin, gates: [], tags: [] }, cfg)
            .axes.find(a => a.key === 'bufferCost')!.score;
        expect(at(30)).toBe(100);
        expect(at(15)).toBe(70);
        expect(at(0)).toBe(40);
        expect(at(-5)).toBe(0);
    });

    it('첫짐은 시급 축 — 노하우① 가산→진위 3만/전체 108분 ≈ 1.7만/h', () => {
        // 접근 17 + 정차 12 + 배송 77 = 106분 (신림 기점 실측 모형)
        const v = scoreDryRun({ kind: 'first', fare: 30000, totalMinutes: 106,
            slotsFreePct: 95, gates: [], tags: [] }, cfg);
        const hourly = v.axes.find(a => a.key === 'hourlyRate')!;
        expect(hourly.score).toBe(57);               // 1.70만/h ÷ 3만 목표
        // 첫짐은 시급 축 하나 — 빈 차의 적재는 축이 아니다 (늘 만점이라 시급을 희석한다)
        expect(v.axes.length).toBe(1);
        // 🟢 보통 — 16-4 합격선 "🟢 이상" 을 임시 목표치로도 넘는다
        expect(v.color).toBe('보통');
    });

    it('모르는 재료는 축에서 빠진다 — 지어내지 않는다 (규칙 ④)', () => {
        const v = scoreDryRun({ kind: 'merge', fare: 35000, detourExtraMin: null,
            bufferAfterMin: null, slotsFreePct: null, gates: [], tags: ['버퍼 잴 약속 없음'] }, cfg);
        expect(v.axes.length).toBe(0);
        expect(v.score).toBe(0);
        expect(v.tags).toContain('버퍼 잴 약속 없음');
    });

    /**
     * 🧮 **문제지 캘리브레이션 1차** (2026-08-21 16:12 실측) — 우회는 한계 비용이다.
     * 카카오 delta 는 첫짐 단독 대비 누적이라 16번이 +189분을 뒤집어썼다.
     * 한계(294−251=43)로 재면 3.5만÷68분(정차 25 포함) = 3.1만/h → 🔵 — 합격선 그대로.
     */
    it('🔴 한계 비용 — 16번 문제지: 누적 +189가 아니라 294−251=43분', () => {
        expect(marginalDetourMin(294, 251, 189)).toBe(43);
        // 첫 합짐(직전 = 첫짐 단독)은 카카오 delta 그대로 — 둘이 같은 값이다
        expect(marginalDetourMin(213, null, 109)).toBe(109);

        const v = scoreDryRun({ kind: 'merge', fare: 35000,
            detourExtraMin: marginalDetourMin(294, 251, 189) + 25,   // + 정차 25분
            bufferAfterMin: 0, slotsFreePct: 85, gates: [], tags: [] }, cfg);
        expect(v.axes.find(a => a.key === 'revenuePerDetour')!.score).toBe(100);  // 3.1만/h ≥ 목표
        expect(v.color).toBe('꿀');                                               // 16-4: 16번 = 🔵
    });

    it('딱지는 색에 영향이 없다 — 사실 표시만 (기사님 확정 ①)', () => {
        const base = { kind: 'merge' as const, fare: 35000, detourExtraMin: 20,
            bufferAfterMin: 40, gates: [], tags: [] };
        const withTags = scoreDryRun({ ...base, tags: ['우회 +122분 · +46.8km', '통화 필수'] }, cfg);
        const without = scoreDryRun(base, cfg);
        expect(withTags.color).toBe(without.color);
        expect(withTags.score).toBe(without.score);
    });
});
