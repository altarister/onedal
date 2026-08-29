import { scoreDryRun, DEFAULT_JUDGMENT } from '@onedal/shared';

/**
 * 🔴 **못 쟀으면 색을 지어내지 않는다** (2026-08-29 · 3단계)
 *
 * 규칙 ⑤: *"모르는 값을 불리하게 지어내 탈락시키는 건 구분이 아니라 포기다.
 * 모르면 **모른다고 표시하고 기사님께 넘긴다**."*
 * 용어집: **🔴 = 연산 실패.** 못 쟀다는 것은 나쁘다는 뜻이 아니라 **못 쟀다**는 뜻이다.
 *
 * ── 무엇이 문제였나 (실측 2026-08-29) ──
 *
 * 점수는 «기준 점수 × 가중치»의 평균이다. 그런데 잴 값이 없으면 그 기준을 **아예
 * 안 만든다.** 그래서 분모가 줄고, 극단에서 **양쪽으로** 색을 지어냈다:
 *
 * | 상황 | 예전 | 무엇이 틀렸나 |
 * |---|---|---|
 * | 기준 0개 (경로를 못 구함) | 🟡 **똥 0점** | 10만원짜리도 똥이 된다 — **잡을 수 있었던 콜을 놓친다** |
 * | 통과한 조건 하나만 남음 | 🔵 **꿀 100점** | 아무것도 못 쟀는데 최고점 — **더 위험하다** |
 *
 * 🔴 두 번째가 더 나쁘다. 기사님은 **색만 보고 1~2초 안에 누른다**(규칙 ⑤-3).
 *    「기존 콜 약속 보존 통과」 하나로 100점이 뜨면 근거 없이 잡게 된다.
 *
 * ── 무엇을 재는가 ──
 *
 * 「통과/실패」 조건(약속 보존 · 같이 못 실음)은 **혼자서 점수를 만들지 못한다.**
 * 그것들은 «이 콜이 얼마나 좋은가»가 아니라 «사고가 나는가»를 답한다.
 * 좋고 나쁨을 재는 것은 **돈·버퍼·적재** 쪽이다 — 그게 하나도 없으면 못 잰 것이다.
 */

const 잰다 = (over: any) => scoreDryRun({ fare: 50_000, gates: [], tags: [], ...over }, DEFAULT_JUDGMENT);

const 통과문지기 = [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: true, why: null }];

describe('🔴 못 쟀으면 색을 지어내지 않는다', () => {
    it('첫짐 — 배송 주행을 못 구하면 「똥」이 아니다', () => {
        const v = 잰다({ kind: 'first', fare: 100_000, totalMinutes: null });
        expect(v.color).toBe('사고');          // 예전엔 🟡 똥 0점 — 10만원짜리를 버렸다
    });

    it('합짐 — 우회·버퍼·적재를 다 못 구하면 「똥」이 아니다', () => {
        const v = 잰다({ kind: 'merge', detourExtraMin: null, bufferAfterMin: null, slotsFreePct: null });
        expect(v.color).toBe('사고');
    });

    it('🔴 통과한 조건 하나로 「꿀」이 되지 않는다 — 아무것도 못 쟀다', () => {
        const v = 잰다({ kind: 'merge', detourExtraMin: null, bufferAfterMin: null, slotsFreePct: null,
                        gates: 통과문지기 });
        expect(v.color).not.toBe('꿀');        // 예전엔 🔵 꿀 100점
        expect(v.color).toBe('사고');
    });

    it('못 쟀을 때는 이유를 함께 적는다 — 숫자만 두면 거짓말이 된다 (규칙 ④)', () => {
        const v = 잰다({ kind: 'first', totalMinutes: null });
        expect(v.tags.join(' ')).toContain('잴 수 없음');
    });

    /** 하나라도 잴 수 있으면 평소대로 — 이 고침이 멀쩡한 판정을 건드리면 안 된다 */
    it('하나라도 재면 평소대로 채점한다', () => {
        const v = 잰다({ kind: 'merge', detourExtraMin: 30, bufferAfterMin: null, slotsFreePct: null,
                        gates: 통과문지기 });
        expect(v.color).not.toBe('사고');
        expect(v.axes.some(a => a.key === 'revenuePerDetour')).toBe(true);
    });

    it('첫짐도 하나라도 재면 평소대로', () => {
        expect(잰다({ kind: 'first', totalMinutes: 120 }).color).not.toBe('사고');
    });

    /**
     * ⚠️ **깨진 조건은 여전히 「사고」다.** 못 잰 것과 사고는 지금 같은 색을 쓴다 —
     *    이건 이미 아는 숙제다 (docs/지금/판정.md §7). 여기서 섞지만
     *    않으면 된다: **딱지가 둘을 가른다.**
     */
    it('깨진 조건과 못 잰 것은 딱지로 갈린다', () => {
        const 깨짐 = 잰다({ kind: 'merge', detourExtraMin: 30, bufferAfterMin: 10, slotsFreePct: 50,
                          gates: [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: false, why: '7분 깨집니다' }] });
        expect(깨짐.color).toBe('사고');
        expect(깨짐.tags.join(' ')).not.toContain('잴 수 없음');
    });
});
