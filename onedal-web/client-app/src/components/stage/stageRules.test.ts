import { describe, it, expect } from 'vitest';
import { stageStep, initialStageMemory, USER_HOLD_MS,
         type StageMemory, type StageSignals } from './stageRules';
import { SHEET_HEIGHT, SHEET_FIXED_HEIGHT, SHEET_MAX_RATIO, SHEET_LIST_MAX, sheetOccludedPx, type SheetSnap } from './StageSheet';

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

    /**
     * 🪧 **개정 2026-09-05 — 판정석이 «시트 맨 아래»로 갔다** (기사님 확정 · 안 ⓑ).
     *
     * 🔴 예전 규칙은 «판정 중이면 내린다»(peek) 였다 — «지도가 판정의 근거다»를 지키려던 것.
     *    그런데 결재 버튼이 시트 안으로 들어오면서, 내리면 **누를 것이 안 보인다.**
     *    실물에 콜을 올려 **찍어 보고서야** 드러났다.
     * 🟢 **둘 다 지킨다** — 「나」는 58% 상한이라 지도가 절반 남는다.
     *    후보 경로(노란 점선)를 보면서 아래에서 결재한다.
     * ⚠️ 이미 「다」면 그대로 — 손이 이긴다 (`snapOnJudging`).
     */
    it('S4 판정 중이면 주행·정차보다 먼저다 — 「나」로 올려 결재를 보인다', () => {
        for (const drive of ['drive', 'idle'] as const) {
            const r = tick(initialStageMemory(), sig({ judging: true, drive, snap: 'peek' }));
            expect(r.snap).toBe('list');
            expect(r.reason).toBe('판정중');
        }
        /**
         * 🔄 **2026-09-12 — 「다」도 「나」로 내려온다** (기사님 실측).
         *    예전엔 *"손으로 「다」까지 올려 두셨으면 안 내린다"* 였는데, KEEP 으로 올라간
         *    「다」에서 후보콜이 뜨면 **지도가 통째로 가려진 채** 결재하게 됐다.
         *    기사님: *"콜의 판정 화면은 **「나」** 여야만 해."*
         * 🔴 **손 유예는 위의 `holding` 이 이미 막는다** — 손으로 만지신 30초 안에는
         *    판정 신호 자체가 안 온다. 여기서 또 봐주면 규칙이 두 곳에 갈린다.
         */
        expect(tick(initialStageMemory(), sig({ judging: true, snap: 'full' })).snap).toBe('list');
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

    /**
     * 🔴 **유예 중에 온 «도착»은 유예가 끝나면 다시 묻는다 — 아직 그 정거장 곁이면** (2026-09-15 여섯 번째 바퀴 · onedal-49 합의).
     *    10:54:49 하차 도착이 «list·손» 유예 중에 와 미뤄졌는데, 유예가 끝나자 신호만 다시 물어 «정차»가 됐다 — 마중이 사라졌다.
     *    도착 직전에 콜 카드를 만져 보는 일은 흔하다 (실주행에서도 난다).
     *    버릴 때: 그 정거장을 떠났다(지나침·다음 정거장) · 더 새 도착이 왔다(최신 하나) · 완료 행동을 했다.
     */
    it('🔴 유예 중 미룬 도착은 유예가 끝나고 아직 곁이면 도착으로 올린다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'list' });
        const a = stageStep(g.mem, sig({ nowMs: T0 + 5_000 }), { type: 'arrive', orderId: 'o1', stopType: 'dropoff' });
        expect(a.deferred).toBe(true);
        const t = tick(a.mem, sig({ nowMs: T0 + USER_HOLD_MS + 1, hereStops: ['o1:dropoff'] }));
        expect([t.snap, t.reason, t.mem.autoRaised]).toEqual(['full', '도착(유예 뒤)', true]);
        expect(tick(t.mem, sig({ nowMs: T0 + USER_HOLD_MS + 2, hereStops: ['o1:dropoff'] })).reason).not.toBe('도착(유예 뒤)');   // 한 번만
    });

    it('유예가 끝났을 때 그 정거장을 떠났으면 도착으로 올리지 않는다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'list' });
        const a = stageStep(g.mem, sig({ nowMs: T0 + 5_000 }), { type: 'arrive', orderId: 'o1', stopType: 'dropoff' });
        const t = tick(a.mem, sig({ nowMs: T0 + USER_HOLD_MS + 1, hereStops: [] }));
        expect(t.reason).toBe('정차');
    });

    it('더 새 도착이 오면 그것 하나만 기억한다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'list' });
        let m = stageStep(g.mem, sig({ nowMs: T0 + 1_000 }), { type: 'arrive', orderId: 'o1', stopType: 'pickup' }).mem;
        m = stageStep(m, sig({ nowMs: T0 + 2_000 }), { type: 'arrive', orderId: 'o2', stopType: 'pickup' }).mem;
        expect(tick(m, sig({ nowMs: T0 + USER_HOLD_MS + 1, hereStops: ['o1:pickup'] })).reason).toBe('정차');
        expect(tick(m, sig({ nowMs: T0 + USER_HOLD_MS + 1, hereStops: ['o2:pickup'] })).reason).toBe('도착(유예 뒤)');
    });

    it('완료 행동을 하면 미룬 도착을 잊는다', () => {
        const g = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'list' });
        const a = stageStep(g.mem, sig({ nowMs: T0 + 1_000 }), { type: 'arrive', orderId: 'o1', stopType: 'pickup' });
        const d = stageStep(a.mem, sig({ nowMs: T0 + 2_000 }), { type: 'done' });
        expect(tick(d.mem, sig({ nowMs: T0 + USER_HOLD_MS + 1, hereStops: ['o1:pickup'] })).reason).not.toBe('도착(유예 뒤)');
    });

    /** 🎭 모의 도착은 정차 첫 틱에 찍힌다 — 주행 신호는 굳는 10초 동안 아직 «주행»이다. 신호가 다시 흐르지 않으면 시트는 그대로다 (onedal-49 짚음) */
    it('도착으로 올린 시트는 주행 신호가 «바뀌어» 흐를 때만 내려간다 — 도착 사건 자체는 주행 중에도 올린다', () => {
        const a = stageStep(initialStageMemory(), sig({ drive: 'drive' }), { type: 'arrive', orderId: 'o1', stopType: 'pickup' });
        expect(a.snap).toBe('full');
        expect(tick(a.mem, sig({ nowMs: T0 + 10_000, drive: 'idle' })).snap).toBeNull();   // 굳은 «정차»는 마중을 못 끌어내린다
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
        /* 🪧 0905 개정 — 판정석이 시트 맨 아래라 «나»로 올려야 결재가 보인다 (지도는 절반 남는다) */
        expect(step({ type: 'signal' }, { judging: true, snap: 'peek' }).snap).toBe('list');  // 합짐 후보 판정
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

describe('🗺️ 「나」도 지도가 볼 자리를 남긴다 (기사님 확정 2026-09-05)', () => {
    /**
     * 기사님: *"판정 시트나 시트 아래 나타날 때 시트는 「나」 위치로 가기 때문에
     * **모두 보여야 한다.**"*
     *
     * 🔴 **판정이 보이는 것만으로 모자란다** — 후보 경로를 지도에서 보는 것이
     *    **판정의 재료**다 (실물이 판정 중에 시트를 내렸던 이유가 그것이다).
     *    그런데 「나」의 상한이 `100%` 라 **콜이 많으면 시트가 화면을 다 덮었다.**
     * 🔴 값은 `SHEET_MAX_RATIO` 하나에서 온다 — 가림 계산(S8)과 **같은 값**이라야
     *    «시트가 덮는 높이»와 «지도가 비켜 주는 높이»가 안 갈라진다 (규칙 ③).
     */
    it('「나」의 상한과 가림 상한이 같은 값에서 온다', () => {
        expect(SHEET_LIST_MAX).toBe(`${SHEET_MAX_RATIO * 100}%`);
    });

    it('지도가 적어도 42%는 남는다', () => {
        expect(SHEET_MAX_RATIO).toBeLessThanOrEqual(0.58);
        expect(1 - SHEET_MAX_RATIO).toBeGreaterThanOrEqual(0.42);
    });

    it('아무리 내용이 많아도 가림은 그 비율을 안 넘는다', () => {
        for (const measured of [100, 500, 900, 5000]) {
            expect(sheetOccludedPx('list', 800, measured)).toBeLessThanOrEqual(800 * SHEET_MAX_RATIO);
        }
    });

    /** 🔴 「다」는 «다 쓴다»가 정의라 100% 다 — 상한은 「나」에만 건다 */
    it('「다」는 100% 그대로다 — 정의가 «다 쓴다»이다', () => {
        expect(SHEET_HEIGHT.full).toBe('100%');
    });
});

/**
 * 🪧 **판정이 손보다 먼저다 · 판정 중에는 손이 높이를 못 바꾼다 · 늦게 열기도 규칙을 지난다** (기사님 2026-09-15 · 버그 대장 #144).
 *
 * 기사님: *"판정중에는 드레그를 못하도록 딤드"* · *"1, 2를 자리 바꿈"*(새 판정 > 손) ·
 * *"뭔가 잘못눌러 취소나 킵을 못하면 안되니까"* · *"운전중일때는 올라왔다 내려오면 될꺼 같고
 * 늦게 열기 효과가 KEEP 한 콜을 열면 다시 올라오고"*.
 */
describe('#144 판정 우선 · 판정 중 손 막힘 · 늦게 열기', () => {
    const held = (): StageMemory => ({ ...initialStageMemory(), userHoldUntil: T0 + USER_HOLD_MS });

    it('손 유예 중에도 새 판정이 뜨면 「나」로 가고 유예는 끝난다', () => {
        const r = stageStep(held(), sig({ judging: true, snap: 'peek' }), { type: 'judge' });
        expect(r.snap).toBe('list');
        expect(r.mem.userHoldUntil).toBe(0);
        expect(r.deferred).toBe(false);
    });

    it('판정 중에는 끌기·탭이 높이를 못 바꾸고 유예도 안 건다', () => {
        for (const ev of [{ type: 'drag', to: 'full' }, { type: 'tap' }] as const) {
            const r = stageStep(initialStageMemory(), sig({ judging: true }), ev);
            expect(r.snap).toBeNull();
            expect(r.mem.userHoldUntil).toBe(0);
        }
    });

    it('판정이 없으면 끌기는 지금처럼 30초 유예를 건다', () => {
        const r = stageStep(initialStageMemory(), sig(), { type: 'drag', to: 'peek' });
        expect(r.snap).toBe('peek');
        expect(r.mem.userHoldUntil).toBe(T0 + USER_HOLD_MS);
    });

    it('KEEP 한 콜이 목록에 들어오면 다시 올라온다 — 손 유예 중이면 미룬다', () => {
        const r = stageStep(initialStageMemory(), sig(), { type: 'keepReady' });
        expect(r.snap).toBe('full');
        expect(r.mem.autoRaised).toBe(true);
        const h = stageStep(held(), sig(), { type: 'keepReady' });
        expect(h.snap).toBeNull();
        expect(h.deferred).toBe(true);
    });

    it('주행 중 KEEP 은 올라왔다가 주행 신호에 내려간다 (S12)', () => {
        const k = stageStep(initialStageMemory(), sig({ drive: 'drive' }), { type: 'keep' });
        expect(k.snap).toBe('full');
        expect(tick(k.mem, sig({ drive: 'drive' })).snap).toBe('peek');
    });
});
