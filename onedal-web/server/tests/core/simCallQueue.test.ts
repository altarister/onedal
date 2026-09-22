import { readFileSync } from 'fs';
import { join } from 'path';
import {
    SIM_CALL_KEEP, createSimCallQueue, pushSimCall, readSimCallInput, resetSimCalls, simCallsAfter, withdrawSimCall,
} from '../../src/core/simCallQueue';
import type { SimCallInput } from '../../src/core/simCallQueue';

/**
 * 🚚 **개별콜 — 서버가 들고 있다가 시뮬레이터에 넘긴다** (기사님 지시 2026-09-15 · `src/core/simCallQueue.ts` 머리).
 *
 * 현황판 → 서버 → 시뮬레이터 세 곳이 같은 콜 모양을 주고받는다. 한 곳만 칸 이름을 바꾸면
 * **타입 검사가 못 잡는다** — 시뮬레이터(onedal-sim)와 관제웹은 서버 타입을 안 가져다 쓴다. 그래서 여기서 글자로 대조한다.
 */

const place = (region: string, lon = 127.312587, lat = 37.363298) =>
    ({ addressDetail: `경기 광주시 ${region} 경충대로 907`, region, lon, lat });
const body = (over: Record<string, unknown> = {}) => ({ pickup: place('초월읍'), dropoff: place('신둔면', 127.401207, 37.309733), fare: 50000, ...over });
const call = (): SimCallInput => (readSimCallInput(body()) as { ok: true; call: SimCallInput }).call;

describe('개별콜 — 받는 콜 모양', () => {
    it('맞는 콜을 받는다 · 차종·상호는 있어도 없어도 된다', () => {
        expect(readSimCallInput(body())).toEqual({ ok: true, call: body() });
        const withMore = body({ vehicleType: '다마스', pickup: { ...place('초월읍'), customerName: '모다아울렛' } });
        expect(readSimCallInput(withMore)).toEqual({ ok: true, call: withMore });
    });

    it.each([
        ['몸통이 없다', null],
        ['상차지가 없다', body({ pickup: undefined })],
        ['동 이름이 없다', body({ pickup: { ...place('초월읍'), region: '' } })],
        ['주소가 없다', body({ dropoff: { ...place('신둔면'), addressDetail: '  ' } })],
        ['좌표가 글자다', body({ pickup: { ...place('초월읍'), lon: '127.3' } })],
        ['경도·위도가 바뀌었다', body({ pickup: place('초월읍', 37.363298, 127.312587) })],
        ['요금 0', body({ fare: 0 })],
        ['요금이 소수', body({ fare: 1.5 })],
        ['요금이 글자', body({ fare: '50000' })],
        ['차종이 빈칸', body({ vehicleType: ' ' })],
        ['상호가 빈칸', body({ pickup: { ...place('초월읍'), customerName: '' } })],
    ])('🔴 받지 않고 무엇이 틀렸는지 말한다 — 채우지 않는다 (규칙 ④): %s', (_why, b) => {
        const r = readSimCallInput(b);
        expect(r.ok).toBe(false);
        expect((r as { error: string }).error.length).toBeGreaterThan(0);
    });
});

describe('개별콜 — 번호', () => {
    it('번호는 늘기만 하고, 넘치면 오래된 것부터 버린다 (번호는 그대로)', () => {
        const q = createSimCallQueue();
        for (let i = 0; i < SIM_CALL_KEEP + 3; i++) pushSimCall(q, call(), 1000 + i);
        expect(q.lastSeq).toBe(SIM_CALL_KEEP + 3);
        expect(q.calls).toHaveLength(SIM_CALL_KEEP);
        expect(q.calls[0].seq).toBe(4);
    });

    it('처음 묻는 시뮬레이터에는 콜을 안 주고 지금 번호만 준다 — 열기 전에 낸 콜을 다시 내지 않는다', () => {
        const q = createSimCallQueue();
        pushSimCall(q, call(), 1);
        pushSimCall(q, call(), 2);
        expect(simCallsAfter(q, null, 10)).toEqual({ lastSeq: 2, round: 0, calls: [], withdrawn: [] });
    });

    it('번호 뒤의 콜만 준다 · 물은 시각을 남긴다', () => {
        const q = createSimCallQueue();
        expect(q.lastPollAt).toBeNull();
        pushSimCall(q, call(), 1);
        pushSimCall(q, call(), 2);
        pushSimCall(q, call(), 3);
        const r = simCallsAfter(q, 1, 99);
        expect(r.lastSeq).toBe(3);
        expect(r.calls.map(c => c.seq)).toEqual([2, 3]);
        expect(q.lastPollAt).toBe(99);
    });
});

describe('개별콜 — 회차 (시나리오를 다시 시작하면 이전 콜을 리셋한다)', () => {
    it('비우면 회차가 오르고 들고 있던 콜이 사라진다 · 번호는 이어진다', () => {
        const q = createSimCallQueue();
        expect(q.round).toBe(0);
        pushSimCall(q, call(), 1);
        pushSimCall(q, call(), 2);
        resetSimCalls(q);
        expect(q.round).toBe(1);
        expect(q.calls).toEqual([]);
        expect(pushSimCall(q, call(), 3).seq).toBe(3);
    });

    it('답에 회차가 실린다 — 시뮬레이터가 목록을 비울 때를 안다', () => {
        const q = createSimCallQueue();
        pushSimCall(q, call(), 1);
        resetSimCalls(q);
        pushSimCall(q, call(), 2);
        expect(simCallsAfter(q, 1, 5)).toMatchObject({ lastSeq: 2, round: 1 });
        expect(simCallsAfter(q, 1, 5).calls.map(c => c.seq)).toEqual([2]);
    });
});

/**
 * 🫳 **채점이 끝난 줄의 콜은 거둔다 — «다른 기사가 가져갔다»** (2026-09-15 일곱 번째 바퀴 · onedal-49 합의 · 시뮬 쪽은 onedal-49).
 *    12:06 막힘으로 채점된 B2 콜이 시뮬레이터 목록에 남아, 12:09 복귀를 켜자 폰이 다시 판정해 잡았다 → 적재가 차 C3 가 차종으로 막혔다.
 *    실주행에서 콜은 누가 잡으면 목록에서 사라진다 — 시험 도구만 영원히 두고 있었다.
 */
describe('개별콜 — 거두기', () => {
    it('🔴 거둔 콜은 목록에서 빠지고 답의 withdrawn 에 실린다 (after 와 무관)', () => {
        const q = createSimCallQueue();
        const a = pushSimCall(q, call(), 1);
        const b = pushSimCall(q, call(), 2);
        withdrawSimCall(q, a.seq);
        const batch = simCallsAfter(q, 0, 3);
        expect(batch.calls.map(c => c.seq)).toEqual([b.seq]);
        expect(batch.withdrawn).toEqual([a.seq]);
        expect(simCallsAfter(q, b.seq, 4).withdrawn).toEqual([a.seq]);
    });
    it('같은 번호를 두 번 거둬도 한 번만 · 회차가 바뀌면 비운다', () => {
        const q = createSimCallQueue();
        const a = pushSimCall(q, call(), 1);
        withdrawSimCall(q, a.seq); withdrawSimCall(q, a.seq);
        expect(simCallsAfter(q, 0, 2).withdrawn).toEqual([a.seq]);
        resetSimCalls(q);
        expect(simCallsAfter(q, 0, 3).withdrawn).toEqual([]);
    });
});

describe('🔴 세 곳이 같은 말을 한다 — 현황판 · 서버 · 시뮬레이터', () => {
    const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const server = codeOnly(readFileSync(join(__dirname, '../../src/core/simCallQueue.ts'), 'utf8'));
    const route = codeOnly(readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8'));
    const sim = codeOnly(readFileSync(join(__dirname, '../../../../onedal-sim/packages/core-simulator/src/injectedCall.ts'), 'utf8'));
    const simHook = codeOnly(readFileSync(join(__dirname, '../../../../onedal-sim/packages/ui-simulators/src/context/useSimInjectedCalls.ts'), 'utf8'));
    const board = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/statusboard/simCall.ts'), 'utf8'));
    const boardCard = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/statusboard/StatusBoard.tsx'), 'utf8'));
    /** 🚪 현황판이 시뮬 문을 여는 **유일한 자리** — 주소 접두(`/sim`)는 여기 한 곳에 산다 */
    const boardDoor = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/statusboard/simDoor.ts'), 'utf8'));

    /** `interface 이름 { … }` 안의 칸 이름들 */
    const fieldsOf = (src: string, name: string) => {
        const i = src.indexOf(`interface ${name}`);
        expect(i).toBeGreaterThan(-1);
        const inner = src.slice(src.indexOf('{', i) + 1, src.indexOf('}', i));
        return [...inner.matchAll(/(\w+)\??:/g)].map(m => m[1]).sort();
    };

    it('자리 칸 — 주소 · 동 이름 · 경도 · 위도', () => {
        const core = ['addressDetail', 'lat', 'lon', 'region'];
        expect(fieldsOf(board, 'SimPlaceDraft')).toEqual(core);
        /* 상호·전화는 서버·시뮬만 주고받는다 — 현황판 개별콜 입력에는 그 칸이 없다 */
        expect(fieldsOf(server, 'SimPlace').filter(k => k !== 'customerName' && k !== 'phone1')).toEqual(core);
        expect(fieldsOf(sim, 'InjectedPlace')).toEqual(fieldsOf(server, 'SimPlace'));
    });

    it('콜 칸 — 상차지 · 하차지 · 요금 (+ 차종)', () => {
        expect(fieldsOf(board, 'SimCallBody')).toEqual(['dropoff', 'fare', 'pickup']);
        expect(fieldsOf(server, 'SimCallInput')).toEqual(['dropoff', 'fare', 'pickup', 'vehicleType']);
        expect(fieldsOf(sim, 'InjectedCall')).toEqual(['dropoff', 'fare', 'pickup', 'seq', 'vehicleType']);
    });

    it('답 칸 — 번호 · 회차 · 콜 (서버 답 ↔ 시뮬레이터가 받는 묶음)', () => {
        expect(fieldsOf(server, 'SimCallBatch')).toEqual(['calls', 'lastSeq', 'round', 'withdrawn']);   // 🫳 거둔 번호 (2026-09-15 · 시뮬 짝은 onedal-49)
        expect(fieldsOf(sim, 'InjectedBatch')).toEqual(fieldsOf(server, 'SimCallBatch'));
    });

    it('🔴 폰 본 콜 기억 회차 — 서버 응답 꼬리 칸 ↔ 원달앱 DeviceControl 칸이 같은 이름', () => {
        const scrap = codeOnly(readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8'));
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/models/SharedModels.kt'), 'utf8');
        expect(scrap).toMatch(/callMemoryRound/);
        const i = kt.indexOf('data class DeviceControl');
        expect(kt.slice(i, kt.indexOf('\n)', i))).toMatch(/val callMemoryRound: Int\? = null/);
    });

    it('경로 — 현황판이 내는 곳 · 서버가 받는 곳 · 시뮬레이터가 묻는 곳이 같다', () => {
        expect(route).toMatch(/router\.post\("\/calls"/);
        expect(route).toMatch(/router\.get\("\/calls"/);
        /**
         * 🚪 **현황판은 주소를 손으로 적지 않는다** — `/sim` 접두는
         *    문지기(`simDoor.ts`)가 붙이고 카드는 **뒷자리만** 적는다.
         *    🔴 세 곳이 같은 말을 하는지는 그대로 본다: **접두 + 뒷자리**.
         */
        expect(boardDoor).toMatch(/\$\{apiBase\(\)\}\/sim\$\{path\}/);
        expect(boardCard).toMatch(/simAsk<[^>]*>\('\/calls'/);
        expect(simHook).toMatch(/\/api\/sim\/calls/);
    });

    it('🔴 두 경로 모두 개발 빌드에서만 열린다 — 운영에는 시뮬레이터가 없다', () => {
        for (const verb of ['post', 'get']) {
            const i = route.indexOf(`router.${verb}("/calls"`);
            const inner = route.slice(i, route.indexOf('\n});', i));
            expect(inner).toMatch(/if \(!isDevBuild\(\)\) return res\.status\(404\)/);
        }
    });
});
