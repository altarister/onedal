// @ts-nocheck
import { soloJudgmentFrom, mergedJudgmentFrom, fallbackJudgmentFrom } from '../../src/core/engine/OrderEvaluator';
import { DEFAULT_JUDGMENT, derivationInputsOf } from '@onedal/shared';

/**
 * 🧮 **판정 셈을 값만 넣어 문다** — soloJudgmentFrom · mergedJudgmentFrom · fallbackJudgmentFrom 은
 * 세션 · 장부(DB) · 설정 · 카카오 · 지금 시각을 안 읽는다. 길찾기 결과 · 정차 · 시세 하한 · 타임라인 · 지금 시각을 값으로 받는다.
 * 규칙마다 «안 일어나야 함 + 일어나야 함». 끝까지 돌리는 검사는 judgmentBranches.
 */
const MODA = { x: 127.312587, y: 37.363298 };            // 광주 초월읍
const TERMINAL = { x: 127.446936, y: 37.277421 };        // 이천 중리동
const GONJIAM = { x: 127.33209, y: 37.35310 };           // 광주 곤지암읍
const HD_SINDUN = { x: 127.40410, y: 37.30574 };         // 이천 신둔면
const BUBAL = { x: 127.4867, y: 37.2602 };               // 이천 부발읍
const cfg = DEFAULT_JUDGMENT;

const soloOrder = (o = {}) => ({ id: 'c', fare: 45000, totalDurationMin: 30, approachDurationMin: 7, kakaoSoloDistanceKm: 15.5, kakaoSoloDurationMin: 23,
    pickupX: GONJIAM.x, pickupY: GONJIAM.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y, pickupApprox: null, dropoffApprox: null, ...o });
const solo = (o = {}) => soloJudgmentFrom({
    order: soloOrder(), roadEvent: null, tollKrw: 1200, dwell: { dwell: 13, hasUnknown: false }, firstStop: { handMinutes: 8, protectionMin: null },
    rateForScore: null, rateForDisplay: null, fuelCostPerKm: 150, reservedLater: false,
    origin: { ...MODA, source: 'gps', isFallback: false }, goal: '이천시', pickupRadiusKm: 10, excludedHits: [], judgmentCfg: cfg, ...o,
});

describe('🎯 첫짐 판정 셈 — 값만', () => {
    it('🔴 걸리는 시간 = 주행 + 정차 · 같은 값이 더 쓰는 시간이 된다', () => {
        const r = solo();
        expect(r.total).toBe(43);
        expect(r.dry.extraMin).toBe(43);
        expect(solo({ dwell: { dwell: 0, hasUnknown: false } }).total).toBe(30);
        expect(solo({ order: soloOrder({ totalDurationMin: null }) }).total).toBeNull();
    });

    it('🔴 기름값 · 톨비는 받은 값으로 돈에서 뺀다 — 없으면 안 뺀다', () => {
        const money = (o) => solo(o).dry.axes.find(a => a.key === 'money').raw;
        expect(money({})).toContain('기름 −0.2만 · 톨비 −0.1만');
        expect(money({ fuelCostPerKm: null, tollKrw: null })).not.toContain('기름');
    });

    it('🔴 딱지 — 정차 모름 · 시세 미달(미리보기) · 무통보 상차 한계 밖(내일 콜은 안 붙음)', () => {
        expect(solo().dry.tags).not.toContain('정차 미확인(일반값)');
        expect(solo({ dwell: { dwell: 13, hasUnknown: true } }).dry.tags).toContain('정차 미확인(일반값)');
        const far = soloOrder({ approachDurationMin: cfg.unknown.pickupPromiseMin + 5 });
        expect(solo({ order: far }).dry.tags).toContain('통화 필수 — 무통보 상차 한계 밖');
        expect(solo({ order: far, reservedLater: true }).dry.tags).not.toContain('통화 필수 — 무통보 상차 한계 밖');
        expect(solo({ rateForDisplay: { minAcceptable: 50000 } }).dry.tags.some(t => t.startsWith('요율 0.5만 모자람'))).toBe(true);
        expect(solo({ rateForDisplay: { minAcceptable: 40000 } }).dry.tags.some(t => t.startsWith('요율'))).toBe(false);
    });

    it('🔴 미리보기 단가 미달이면 색만 똥으로 · 점수는 그대로 · 로그 한 줄', () => {
        const ok = solo();
        expect(ok.dry.color).toBe('보통');
        expect(ok.logs).toEqual([]);
        const short = solo({ rateForScore: { minAcceptable: 50000 } });
        expect(short.dry.color).toBe('똥');
        expect(short.logs).toHaveLength(1);
        expect(short.logs[0]).toContain('[미리보기 단가] 보통 → 똥');
    });

    it('🔴 등 뒤 상차 · 지리 — 사진의 기점 · 목적지 · 반경으로 잰다', () => {
        const geo = (o) => solo(o).dry.axes.find(a => a.key === 'geography');
        expect(geo({}).score).toBeGreaterThan(90);
        expect(geo({ goal: '광주시' }).score).toBeLessThan(geo({}).score);
        const behind = { order: soloOrder({ pickupX: 127.13, pickupY: 37.42 }) };
        expect(solo(behind).dry.color).toBe('사고');
        expect(solo({ ...behind, pickupRadiusKm: 99 }).dry.color).not.toBe('사고');
    });
});

describe('🎨 판정 불가 셈 — 값만', () => {
    it('🔴 사고 · 점수 없음 · 까닭 딱지 · 좌표가 있으면 방향은 잰다', () => {
        const d = fallbackJudgmentFrom({ order: soloOrder({ totalDurationMin: null }), why: 'API KEY 부재', excludedHits: [], fuelCostPerKm: 150,
            origin: { ...MODA, source: 'gps', isFallback: false }, goal: '이천시', pickupRadiusKm: 10, judgmentCfg: cfg });
        expect(d.color).toBe('사고');
        expect(d.axes.find(a => a.key === 'money').score).toBeNull();   // 걸린 시간을 모른다
        expect(d.tags[0]).toBe('판정 불가 — API KEY 부재');
        expect(d.axes.find(a => a.key === 'geography').raw).toMatch(/전진율/);
        const noXY = fallbackJudgmentFrom({ order: soloOrder({ dropoffX: undefined, dropoffY: undefined }), why: 'x', excludedHits: [], fuelCostPerKm: null,
            origin: { ...MODA, source: 'gps', isFallback: false }, goal: '이천시', pickupRadiusKm: 10, judgmentCfg: cfg });
        expect(noXY.axes.find(a => a.key === 'geography').raw).toContain('좌표 미확인');
    });
});

describe('🧩 합짐 판정 셈 — 값만', () => {
    const NOW = Date.parse('2026-10-07T03:00:00.000Z');
    const kept = { id: 'k1', status: 'ORDER_CONFIRMED', pickupX: GONJIAM.x, pickupY: GONJIAM.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y, goalCity: '이천시' };
    const cand = { id: 'c1', fare: 30000, pickupX: HD_SINDUN.x, pickupY: HD_SINDUN.y, dropoffX: BUBAL.x, dropoffY: BUBAL.y, deliveryDistanceKm: 8, pickupApprox: null, dropoffApprox: null };
    const entry = (orderId, stopType, etaMin, promisedMin, arrived = false) => ({
        orderId, stopType, etaMs: etaMin == null ? null : NOW + etaMin * 60_000, dwellMinutes: 5, driveMinutes: etaMin, leadMinutes: 0,
        promisedUntil: promisedMin == null ? null : new Date(NOW + promisedMin * 60_000).toISOString(), promiseConfirmed: false,
        dwellShiftMinutes: 0, segmentDriveMinutes: null, departPrevMs: null, departByMs: null,
        lateMinutes: etaMin != null && promisedMin != null ? Math.max(0, etaMin - promisedMin) : 0, arrived,
    });
    const stopsAfter = [
        { orderId: 'k1', stopType: 'pickup', driveMinutes: 8 }, { orderId: 'c1', stopType: 'pickup', driveMinutes: 20 },
        { orderId: 'k1', stopType: 'dropoff', driveMinutes: 35 }, { orderId: 'c1', stopType: 'dropoff', driveMinutes: 45 },
    ];
    const merged = (o = {}) => mergedJudgmentFrom({
        order: cand, activeCalls: [kept],
        tlAfter: [entry('k1', 'pickup', 8, 10), entry('c1', 'pickup', 20, 30), entry('k1', 'dropoff', 35, 60), entry('c1', 'dropoff', 45, null)],
        stopsAfter,
        result: { merged: { distance: 31000, duration: 3300 }, timeDiffMin: 15, distDiffKm: '6.0', tollDiffKrw: 500, roadEvent: null },
        distDiff: 6, cost: { total: 28, drive: 15, dwell: 13, hasUnknown: false, handMinutes: 8, protectionMin: null }, conflicts: [],
        filter: { callTarget: 'DEST', dispatchPhase: 'GATHERING', slotsUsed: 20, capacityConfidence: 'CONFIRMED' },
        derivation: derivationInputsOf(cfg, {}), fuelCostPerKm: 150, nowMs: NOW, goal: '이천시', excludedHits: [], judgmentCfg: cfg, ...o,
    });

    it('🔴 한계 우회 · 더 쓰는 시간 = 우회 + 정차 · 우회 딱지', () => {
        const r = merged();
        expect(r.marginal).toBe(15);
        expect(r.marginalKm).toBe(6);
        expect(r.dry.extraMin).toBe(28);
        expect(r.dry.tags).toContain('우회 +15분 · +6km');
    });

    it('🔴 꼬리 배송을 뺀 «벗어난 분» · 합짐 지리 기점은 꼬리 앞 정거장 — 로그로 돌려준다', () => {
        const r = merged();
        expect(r.logs.some(l => l.includes('[벗어난 분] 15분 → 5분'))).toBe(true);
        expect(r.logs.some(l => l.includes('[합짐 지리] 기점 중리동'))).toBe(true);
    });

    it('🔴 늦는 정거장 — 설정 분 이상 늦으면 전화할 곳 · 약속 버퍼는 가장 빠듯한 정거장', () => {
        const ok = merged();
        expect(ok.dry.axes.find(a => a.key === 'calls').raw).toContain('없음');
        expect(ok.bufAfter.minutes).toBe(2);
        const late = merged({ tlAfter: [entry('k1', 'pickup', 8, 10), entry('c1', 'pickup', 20, 30), entry('k1', 'dropoff', 70, 60), entry('c1', 'dropoff', 80, null)] });
        expect(late.dry.axes.find(a => a.key === 'calls').raw).not.toContain('없음');
        expect(late.dry.stops.find(s => s.name.includes('하차')).lateMin).toBe(10);
    });

    it('🔴 지금 시각을 값으로 받는다 — 상차까지 분이 바뀐다', () => {
        const wait = (nowMs) => merged({ nowMs }).dry.axes.find(a => a.key === 'wait').raw;
        expect(wait(NOW)).not.toEqual(wait(NOW - 10 * 60_000));
    });

    it('🔴 자리 · 적재 근거 · 국면은 받은 필터 값으로', () => {
        const space = (filter) => merged({ filter: { callTarget: 'DEST', dispatchPhase: 'GATHERING', ...filter } }).dry.axes.find(a => a.key === 'space');
        expect(space({ slotsUsed: 20, capacityConfidence: 'CONFIRMED' }).raw).toBe('여유 80%');
        expect(space({ slotsUsed: 120, capacityConfidence: 'DECLARED' }).score).toBe(0);
        expect(space({ slotsUsed: 120, capacityConfidence: 'ESTIMATED' }).score).toBeNull();
        expect(merged().dry.tags).toContain('합짐');
        expect(merged({ filter: { callTarget: 'DEST', dispatchPhase: 'DELIVERING', slotsUsed: 20, capacityConfidence: 'CONFIRMED' } }).dry.tags).not.toContain('합짐');
    });

    it('🔴 정거장 순서를 못 받으면 «도착 모름» 딱지 — «약속 보존»으로 읽히지 않게', () => {
        expect(merged().dry.unknownWhy).toBeNull();
        const r = merged({ tlAfter: [], stopsAfter: [] });
        expect(r.dry.unknownWhy).toBe('전체 경로의 정거장 순서를 못 받았다');
        expect(r.dry.tags).toContain('기존 콜 도착 모름 — 전체 경로의 정거장 순서를 못 받았다');
    });
});
