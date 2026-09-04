import { describe, it, expect } from 'vitest';
import { stageStep, initialStageMemory, USER_HOLD_MS,
         type StageMemory, type StageSignals } from './stageRules';
import { SHEET_HEIGHT, SHEET_FIXED_HEIGHT, sheetOccludedPx, type SheetSnap } from './StageSheet';

/**
 * 🧠 **v23 Ⅲ표를 검사로** (기사님 지시 2026-08-31 — *"구멍부터 처리하자"*).
 *
 * 이 규칙을 하루에 다섯 번 뒤집으면서 **전부 손으로** 확인했다. 그날 난 사고들이
 * 여기 문제로 들어 있다 — 다음에 규칙을 만지면 빨간불이 먼저 뜬다.
 */
const T0 = 1_000_000;
const sig = (over: Partial<StageSignals> = {}): StageSignals =>
    ({ nowMs: T0, calls: 1, judging: false, drive: 'idle', ...over });

/** 신호 한 번 흘리기 — 실제 화면이 하는 일과 같다 */
const tick = (mem: StageMemory, s: StageSignals) => stageStep(mem, s, { type: 'signal' });

describe('Ⅲ표 — 신호가 정하는 높이', () => {
    it('S1 콜 없음 → 엿보기', () => {
        const r = tick(initialStageMemory(), sig({ calls: 0 }));
        expect(r.snap).toBe('peek');
        expect(r.reason).toBe('콜없음');
    });

    it('S2 정차·콜 있음 → 반', () => {
        expect(tick(initialStageMemory(), sig()).snap).toBe('list');
    });

    it('S3 주행 → 엿보기 (지도가 주인공)', () => {
        const r = tick(initialStageMemory(), sig({ drive: 'drive' }));
        expect(r.snap).toBe('peek');
        expect(r.reason).toBe('주행');
    });

    it('S4 판정 중이면 주행·정차보다 먼저다 — 지도가 판정의 근거다', () => {
        for (const drive of ['drive', 'idle'] as const) {
            const r = tick(initialStageMemory(), sig({ judging: true, drive }));
            expect(r.snap).toBe('peek');
            expect(r.reason).toBe('판정중');
        }
    });
});

describe('마중(KEEP·도착) — 정차에는 이기고 주행에는 진다', () => {
    it('S5 KEEP 직후 전체 — 바로 통화한다', () => {
        const r = stageStep(initialStageMemory(), sig(), { type: 'keep' });
        expect(r.snap).toBe('full');
        expect(r.mem.autoRaised).toBe(true);
    });

    it('🔴 도착으로 올라간 시트를 «정차»가 끌어내리지 못한다', () => {
        const a = stageStep(initialStageMemory(), sig(), { type: 'arrive' });
        expect(a.snap).toBe('full');
        // 10초 뒤 정차 감지가 발화해도 신고 시트는 그대로 (예전엔 half 로 내려갔다)
        const b = tick(a.mem, sig({ nowMs: T0 + 10_000 }));
        expect(b.snap).toBeNull();
        expect(b.reason).toBe('마중 유지');
    });

    it('🔴 달리기 시작하면 즉시 내려간다 — 시간이 아니라 «무엇에 지는가»다 (0831 18:15 사고)', () => {
        /**
         * 실측: 17:56:29 KEEP(full) · 17:56:31 주행 감지 · **17:56:59 에야 내려감**.
         * KEEP 이 손과 같은 30초 시간 유예를 쓰는 바람에, 정거장이 가까워 구간이 30초보다
         * 짧으면 유예가 다음 구간을 통째로 덮었다. 이제 2초 뒤에도 내려가야 한다.
         */
        const k = stageStep(initialStageMemory(), sig(), { type: 'keep' });
        const d = tick(k.mem, sig({ nowMs: T0 + 2_000, drive: 'drive' }));
        expect(d.snap).toBe('peek');
        expect(d.reason).toBe('주행');
        expect(d.mem.autoRaised).toBe(false);   // 마중은 끝났다
    });

    it('출발을 누르면 주행 감지(10초)를 기다리지 않고 내려간다', () => {
        const a = stageStep(initialStageMemory(), sig(), { type: 'arrive' });
        const r = stageStep(a.mem, sig({ nowMs: T0 + 1_000 }), { type: 'depart' });
        expect(r.snap).toBe('peek');
        expect(r.reason).toBe('출발');
        expect(r.mem.autoRaised).toBe(false);
    });
});

describe('손이 이긴다 — 그리고 유예가 끝나면 잊지 않는다', () => {
    it('드래그 뒤 30초는 자동이 아무것도 못 바꾼다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'peek' });
        expect(g.snap).toBe('peek');
        const t = tick(g.mem, sig({ nowMs: T0 + 5_000, drive: 'drive' }));
        expect(t.snap).toBeNull();
        expect(t.deferred).toBe(true);        // 미룬 것이지 버린 것이 아니다
    });

    it('🔴 유예 중에 온 전환은 «미룸»으로 표시된다 — 안 그러면 시트가 눌러앉는다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'full' });
        for (const ev of [{ type: 'keep' }, { type: 'arrive' }, { type: 'depart' }] as const) {
            expect(stageStep(g.mem, sig({ nowMs: T0 + 1_000 }), ev).deferred).toBe(true);
        }
    });

    it('유예가 지나면 다시 신호를 따른다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'full' });
        const t = tick(g.mem, sig({ nowMs: T0 + USER_HOLD_MS + 1, drive: 'drive' }));
        expect(t.snap).toBe('peek');
        expect(t.deferred).toBe(false);
    });

    it('지도 정거장 탭은 전체 + 유예 — 골라 본 것을 뺏지 않는다 (S6)', () => {
        const r = stageStep(initialStageMemory(), sig(), { type: 'tap' });
        expect(r.snap).toBe('full');
        expect(r.mem.userHoldUntil).toBe(T0 + USER_HOLD_MS);
    });

    it('드래그는 마중을 끝낸다 — 손으로 내린 것을 도착 유지가 되돌리지 않는다', () => {
        const a = stageStep(initialStageMemory(), sig(), { type: 'arrive' });
        const g = stageStep(a.mem, sig(), { type: 'drag', to: 'peek' });
        expect(g.mem.autoRaised).toBe(false);
    });
});

describe('한 판을 통째로 걸어 본다 — 기사님이 정한 수순', () => {
    it('첫짐 KEEP↑ → 후보 판정↓ → KEEP↑ → 출발↓ → 도착↑ → 재출발↓', () => {
        let mem = initialStageMemory();
        let now = T0;
        const step = (ev: Parameters<typeof stageStep>[2], over: Partial<StageSignals> = {}) => {
            const r = stageStep(mem, sig({ nowMs: now, ...over }), ev);
            mem = r.mem;
            return r;
        };
        expect(step({ type: 'keep' }).snap).toBe('full');                      // 첫짐 잡음
        now += 20_000;
        expect(step({ type: 'signal' }, { judging: true }).snap).toBe('peek');  // 합짐 후보 판정
        now += 10_000;
        expect(step({ type: 'keep' }).snap).toBe('full');                      // 합짐 KEEP
        now += 5_000;
        expect(step({ type: 'depart' }).snap).toBe('peek');                    // 출발
        now += 60_000;
        expect(step({ type: 'arrive' }).snap).toBe('full');                    // 상차지 도착
        now += 12_000;
        // 18초 정차 연기 중 정차 감지가 와도 신고 시트는 유지
        expect(step({ type: 'signal' }).snap).toBeNull();
        now += 8_000;
        expect(step({ type: 'signal' }, { drive: 'drive' }).snap).toBe('peek'); // 다시 달린다
    });
});

describe('🪟 시트의 세 단 — 기사님이 다시 정의하셨다 (2026-09-05)', () => {
    /**
     * | 가 `peek` | 시트 상태바만 |
     * | 나 `list` | 상태바 + **아코디언 타이틀 전부** (+ 판정 영역이 있으면 그만큼) |
     * | 다 `full` | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
     *
     * 🔴 **「반 58%」라는 고정 숫자가 사라진 것이 핵심이다** — 콜이 하나면 낮고
     *    셋이면 높다. 남는 자리는 전부 지도다.
     * 🔴 **손으로 끌어도 딱 이 셋뿐이다** — 중간 높이가 없다.
     */
    it('세 단뿐이다 — 중간이 없다', () => {
        const snaps: SheetSnap[] = ['peek', 'list', 'full'];
        for (const s of snaps) expect(SHEET_HEIGHT[s]).toBeTruthy();
        expect(Object.keys(SHEET_HEIGHT)).toHaveLength(3);
    });

    it('나(list)는 숫자가 아니라 «내용만큼»이다', () => {
        expect(SHEET_HEIGHT.list).toBe('auto');
        // 미리 셀 수 있는 것은 가·다 둘뿐이다
        expect(Object.keys(SHEET_FIXED_HEIGHT).sort()).toEqual(['full', 'peek']);
    });

    it('가는 상태바만, 다는 다 쓴다', () => {
        expect(SHEET_HEIGHT.peek).toBe('72px');
        expect(SHEET_HEIGHT.full).toBe('100%');
    });

    /** 📏 잰 값이 있으면 그것이 이긴다 — `list` 는 미리 셀 수 없다 */
    it('지도의 가림 높이는 «잰 값»이 이긴다', () => {
        expect(sheetOccludedPx('list', 800, 300)).toBe(300);
        expect(sheetOccludedPx('peek', 800)).toBe(72);
    });

    /** 🔴 시트가 무대를 다 덮으면 지도가 무너진다 — 가림은 58% 를 안 넘는다 */
    it('아무리 높아도 지도가 볼 자리를 남긴다', () => {
        expect(sheetOccludedPx('full', 800, 800)).toBeLessThanOrEqual(800 * 0.58);
    });
});
