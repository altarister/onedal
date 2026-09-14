import { describe, expect, it } from 'vitest';
import { generateBaseCall, takeInjected, toInjectedForced } from '../packages/core-simulator/src/index';
import type { InjectedCall } from '../packages/core-simulator/src/index';
import { SIM_NET_LIST } from '../packages/ui-simulators/src/nets';

/**
 * 🚚 **개별콜 — 서버가 넘긴 콜이 배차망마다 목록 콜이 되는가** (기사님 지시 2026-09-15 · `injectedCall.ts` 머리).
 *
 * 동 이름(`region`)은 인성 목록의 지역 칸 · 픽커 목록의 동 칸에 찍히고, 폰 원달앱이 그 글자로 거른다.
 * 요금은 보낸 그대로 가야 요금 축 시험이 성립한다.
 */
const injected = (over: Partial<InjectedCall> = {}): InjectedCall => ({
    seq: 1,
    pickup: { addressDetail: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', region: '초월읍', lon: 127.312587, lat: 37.363298 },
    dropoff: { addressDetail: '경기 이천시 신둔면 도자예술로 72', region: '신둔면', lon: 127.401207, lat: 37.309733 },
    fare: 50000,
    ...over,
});

/* 기사님이 상차지에 서 있다 — 상차 거리가 «그 순간의 위치»에서 재어지는지 본다 */
const config = { driverLon: 127.312587, driverLat: 37.363298, maxPickupKm: 10, minFare: 30000 };

describe('개별콜 → 강제 쌍', () => {
    it('칸을 그대로 옮긴다 · 차종이 없으면 비워 둔다 (배차망이 고른다)', () => {
        const f = toInjectedForced(injected());
        expect(f.pickup).toEqual({ addressDetail: '경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점', region: '초월읍', lon: 127.312587, lat: 37.363298 });
        expect(f.fare).toBe(50000);
        expect('vehicleType' in f).toBe(false);
        expect(toInjectedForced(injected({ vehicleType: '다마스' })).vehicleType).toBe('다마스');
    });

    it.each(SIM_NET_LIST.map(n => [n.label, n] as const))('%s — 목록 콜이 된다: 동 이름 · 주소 · 요금이 보낸 그대로', (_label, net) => {
        const forced = toInjectedForced(injected());
        const draft = generateBaseCall(config, forced);
        expect(draft).not.toBeNull();
        const simCall = net.toCall(draft!, { minFare: config.minFare, forced });
        expect(simCall.pickupDetails?.[0]?.region).toBe('초월읍');
        expect(simCall.dropoffDetails?.[0]?.region).toBe('신둔면');
        expect(simCall.pickupDetails?.[0]?.addressDetail).toBe('경기 광주시 초월읍 경충대로 907 모다아울렛 곤지암점');
        expect(simCall.fare).toBe(50000);
        expect(simCall.pickupDistanceKm).toBeLessThan(0.01);
    });
});

describe('개별콜 — 번호를 이어 받는다', () => {
    const batch = (lastSeq: number, seqs: number[], round = 0) => ({ lastSeq, round, calls: seqs.map(seq => injected({ seq })) });
    const at = (seq: number, round = 0) => ({ seq, round });

    it('처음 물으면 콜을 안 내고 지금 번호·회차만 기억한다 — 열기 전에 낸 콜을 다시 내지 않고, 목록도 안 비운다', () => {
        expect(takeInjected(null, batch(4, [], 3))).toEqual({ cursor: at(4, 3), calls: [], clear: false });
    });

    it('내 번호 뒤의 콜을 번호 순서대로', () => {
        const r = takeInjected(at(4), batch(7, [7, 5, 6]));
        expect(r.cursor).toEqual(at(7));
        expect(r.calls.map(c => c.seq)).toEqual([5, 6, 7]);
        expect(r.clear).toBe(false);
    });

    it('이미 받은 번호는 다시 안 낸다', () => {
        expect(takeInjected(at(7), batch(7, [6, 7])).calls).toEqual([]);
    });

    it('🔴 서버 번호가 내 번호보다 작다 → 서버를 다시 띄웠다. 다음 물음에서 처음부터 받는다', () => {
        expect(takeInjected(at(7), batch(2, []))).toEqual({ cursor: at(0), calls: [], clear: false });
        expect(takeInjected(at(0), batch(2, [1, 2])).calls.map(c => c.seq)).toEqual([1, 2]);
    });

    it('🔴 회차가 바뀌었다 → 시나리오를 새로 시작했다. 목록을 비우고 새 회차 콜만 낸다', () => {
        const r = takeInjected(at(7, 1), batch(8, [8], 2));
        expect(r).toEqual({ cursor: at(8, 2), calls: [injected({ seq: 8 })], clear: true });
    });

    it('🔴 서버 재기동과 회차 바뀜이 한 물음에 같이 오면 — 비우고 · 번호 0 · 다음 물음에서 받는다', () => {
        expect(takeInjected(at(7, 2), batch(1, [1], 0))).toEqual({ cursor: at(0, 0), calls: [], clear: true });
        expect(takeInjected(at(0, 0), batch(1, [1], 0))).toEqual({ cursor: at(1, 0), calls: [injected({ seq: 1 })], clear: false });
    });
});

/* 소스는 Vite 의 `import.meta.glob`(?raw)으로 읽는다 — 시뮬레이터 tsconfig 에 Node 타입을 들이지 않으려고 (boundaries.test.ts 와 같다) */
const FILES = {
    ...import.meta.glob('../packages/ui-simulators/src/context/useSimInjectedCalls.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../src/pages/DispatchPage.tsx', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../src/pages/SetupPage.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;
const src = (rel: string) => {
    const text = FILES[`../${rel}`];
    if (typeof text !== 'string') throw new Error(`소스를 못 읽었다: ${rel}`);
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
};

describe('개별콜 — 입구와 한 번에 한 종류 (기사님 2026-09-15: 메인 메뉴 «시나리오콜 · 랜덤콜 · 개별콜»)', () => {
    it('🔴 설정 화면에 «🚚 개별콜» 탭이 있고, 시작하면 배차망과 개별콜 표시만 넘긴다 (간격·채움 없음)', () => {
        const setup = src('src/pages/SetupPage.tsx');
        expect(setup).toMatch(/name="🚚 개별콜"/);
        expect(setup).toMatch(/new URLSearchParams\(\{ net, calls: 'individual' \}\)/);
    });

    it('🔴 개별콜 화면은 흘리지 않고 서버 콜만 받는다 · 다른 화면은 서버 콜을 안 받는다', () => {
        const page = src('src/pages/DispatchPage.tsx');
        expect(page).toMatch(/const individual = presetParams\.get\('calls'\) === 'individual';/);
        expect(page).toMatch(/enabled: !individual,/);
        expect(page)
            .toMatch(/useSimInjectedCalls\(\{ config: generatorConfig, toCall: simNet\.toCall, appendCall, resetCalls, ready: locationReady, enabled: individual \}\)/);
    });

    it('🔴 받는 훅은 위치를 받기 전·개별콜 화면이 아닐 때 안 묻는다 · 멈춤으로 대신하지 않는다', () => {
        const hook = src('packages/ui-simulators/src/context/useSimInjectedCalls.ts');
        expect(hook).toMatch(/if \(!ready \|\| !enabled\) return;/);
        expect(hook).not.toMatch(/isTimerPaused/);
    });

    it('🔴 회차가 바뀌면 목록을 비운다 — 열린 상세는 닫는 길(handleCloseDetail)로 닫고 확정 목록도 비운다', () => {
        const hook = src('packages/ui-simulators/src/context/useSimInjectedCalls.ts');
        expect(hook).toMatch(/if \(taken\.clear\) resetCalls\(\);/);
        const page = src('src/pages/DispatchPage.tsx');
        const i = page.indexOf('const resetCalls = useCallback(');
        expect(i).toBeGreaterThan(-1);
        const body = page.slice(i, page.indexOf('}, [', i));
        expect(body).toMatch(/handleCloseDetail\(\);/);
        expect(body).toMatch(/setStreamingCalls\(\[\]\);/);
        expect(body).toMatch(/setConfirmedCalls\(\[\]\);/);
    });
});
