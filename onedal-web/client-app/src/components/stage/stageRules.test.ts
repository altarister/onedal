import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stageStep, initialStageMemory, USER_HOLD_MS,
         type StageMemory, type StageSignals } from './stageRules';

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
        expect(tick(initialStageMemory(), sig()).snap).toBe('half');
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
        // 12초 정차 연기 중 정차 감지가 와도 신고 시트는 유지
        expect(step({ type: 'signal' }).snap).toBeNull();
        now += 8_000;
        expect(step({ type: 'signal' }, { drive: 'drive' }).snap).toBe('peek'); // 다시 달린다
    });
});

/**
 * 🔴 **규칙은 한 곳에만 산다** (규칙 ③ — 이 레포가 가장 많이 재발한 형태).
 * 화면(StageView)이 자기 판단을 다시 가지면, 검사받는 규칙과 도는 규칙이 갈라진다.
 */
describe('규칙은 화면 안에 다시 생기지 않는다', () => {
    const view = readFileSync(join(__dirname, 'StageView.tsx'), 'utf8')
        .split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 화면은 시트 높이를 직접 정하지 않는다 — stageStep 이 정한다', () => {
        expect(view).toMatch(/stageStep\(/);
        // 옛 손판단(자체 유예·자체 올림 표시)이 되살아나지 않았는가
        expect(view).not.toMatch(/autoRaised\.current\s*=/);
        expect(view).not.toMatch(/userHoldUntil\.current\s*=/);
    });

    it('🔴 미룬 결정을 다시 묻는 길이 있다 — 없으면 시트가 눌러앉는다', () => {
        expect(view).toMatch(/deferred/);
        expect(view).toMatch(/setRuleTick/);
    });
});
