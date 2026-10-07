// @ts-nocheck
import db from '../../src/db';
import devicesRouter from '../../src/routes/devices';
import { touchDeviceSession, getActiveDevicesSnapshot } from '../../src/state/deviceSessions';
import { otherAutoPhoneOf } from '../../src/state/deviceRegistry';
import { getUserSession } from '../../src/state/userSessionStore';
import * as fileLogger from '../../src/utils/fileLogger';
import { LIST_SCREENS } from '@onedal/shared';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📱 **기기 세션 규칙을 동작으로 문다** — 폰 보고(`touchDeviceSession`) · 모드 문을 불러 세션 · DB · 알람을 본다.
 * 규칙마다 «안 일어나야 함 + 일어나야 함»을 나란히 둔다. 소스 글자로 보면 파일을 나눌 때 옮긴 글자를 따라가 동작이 바뀌어도 초록이다.
 */
const U = 'test-dev-rules';
const OTHER = 'test-dev-rules-other';
const ADMIN = 'ADMIN_USER';   // user_devices 에 없는 폰의 세션 주인
const quiet = { to: () => ({ emit: () => {} }) };
const sessionOf = (id: string) => getActiveDevicesSnapshot().find(d => d.deviceId === id);
const register = (dev: string, owner: string, mode: string | null = null) =>
    db.prepare(`INSERT OR REPLACE INTO user_devices (user_id, device_id, device_name, mode) VALUES (?, ?, ?, ?)`).run(owner, dev, dev, mode);
const modeInDb = (dev: string) => (db.prepare(`SELECT mode FROM user_devices WHERE device_id = ?`).get(dev) as any)?.mode ?? null;

/** 모드 문 — 로그인 문(requireAuth) 뒤의 마지막 처리를 꺼내 부른다(deviceAuth 검사와 같은 꼴) */
const modeRoute = (() => {
    const layer = devicesRouter.stack.find((l: any) => l.route?.path === '/:deviceId/mode' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const setMode = async (dev: string, user: string, mode: string) => {
    let status = 200;
    const res = { status: (s: number) => { status = s; return res; }, json: () => res };
    await modeRoute({ params: { deviceId: dev }, body: { mode }, user: { id: user }, app: { get: (k: string) => (k === 'io' ? quiet : undefined) }, headers: {} }, res);
    return status;
};

/** 심사 중 콜을 그 폰에 쥐여 준다 */
const evaluating = (dev: string, id: string, extra: any) => {
    const s = getUserSession(ADMIN);
    s.pendingOrdersData.set(id, {
        id, status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: dev, capturedAt: new Date().toISOString(),
        pickup: '사음동', dropoff: '중리동', fare: 50000, ...extra,
    });
    s.deviceEvaluatingMap.set(dev, id);
    return s;
};
const touch = (dev: string, ...screens: string[]) => screens.forEach(sc => touchDeviceSession(dev, ADMIN, 0, sc, quiet));

/* ⏲️ 목록 이탈 유예(3초) 같은 기다림이 검사 뒤에 터지지 않게 — 타이머만 가짜 시계 · 날짜는 진짜(Date.now 를 따로 바꾸는 검사가 있다) */
beforeAll(() => { jest.useFakeTimers({ doNotFake: ['Date', 'nextTick', 'setImmediate', 'queueMicrotask'] }); approvedUser(U); approvedUser(OTHER); });
afterAll(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    db.prepare(`DELETE FROM user_devices WHERE user_id IN (?, ?)`).run(U, OTHER);
    db.prepare(`DELETE FROM users WHERE id IN (?, ?)`).run(U, OTHER);
});
afterEach(() => jest.restoreAllMocks());

describe('«어느 배차망» — 기기 세션이 보고의 targetApp 을 기억한다 (폰 영역 배지의 원천)', () => {
    it('🔴 처음 보고에 실리고 · 배차망을 갈아타면 바뀌고 · 배차망을 안 실은 보고는 지우지 않는다', () => {
        const dev = 'dev-rules-net';
        touchDeviceSession(dev, ADMIN, 1, 'LIST', undefined, false, undefined, undefined, undefined, undefined, undefined, 'kakaopicker');
        expect(sessionOf(dev)?.targetApp).toBe('kakaopicker');
        touchDeviceSession(dev, ADMIN, 1, 'LIST', undefined, false, undefined, undefined, undefined, undefined, undefined, 'insung');
        expect(sessionOf(dev)?.targetApp).toBe('insung');
        touchDeviceSession(dev, ADMIN, 1, 'LIST');
        expect(sessionOf(dev)?.targetApp).toBe('insung');
    });
});

describe('⏱️ 직전 보고 시각 — 덮기 전에 옮긴다', () => {
    it('🔴 두 번째 보고에서 prevSeen = 첫 보고 시각 · lastSeen = 지금', () => {
        const dev = 'dev-rules-gap';
        const t0 = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
        touch(dev, 'LIST');
        now.mockReturnValue(t0 + 3_000);
        touch(dev, 'LIST');
        const s = sessionOf(dev);
        expect(s?.prevSeen).toBe(t0);
        expect(s?.lastSeen).toBe(t0 + 3_000);
    });

    it('🔴 침묵 처리된 세션(lastSeen 0 — 하트비트 전에 모드 문이 만든 세션)은 prevSeen 으로 안 옮긴다', async () => {
        const dev = 'dev-rules-silent';
        register(dev, U);
        expect(await setMode(dev, U, 'ALARM')).toBe(200);          // 하트비트 전 — lastSeen 0 인 세션을 미리 만든다
        touchDeviceSession(dev, U, 0, 'LIST', quiet);
        const s = sessionOf(dev);
        expect(s?.prevSeen).toBeUndefined();
        expect(s?.lastSeen).toBeGreaterThan(0);
    });

    it('🔴 그 간격은 «화면 바뀜» 로그에 «직전 보고와 N초 만»으로 찍힌다 · 같은 화면이면 그 줄이 없다', () => {
        const dev = 'dev-rules-gaplog';
        const lines: string[] = [];
        jest.spyOn(fileLogger, 'slog').mockImplementation((tag: string, msg: string) => { if (tag === '화면') lines.push(msg); });
        const t0 = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
        touch(dev, 'LIST');
        now.mockReturnValue(t0 + 2_500);
        touch(dev, 'LIST');
        expect(lines.some(l => l.includes('화면 바뀜'))).toBe(false);
        now.mockReturnValue(t0 + 5_000);
        touch(dev, 'DETAIL_PRE_CONFIRM');
        expect(lines.some(l => l.includes('화면 바뀜') && l.includes('직전 보고와 2.5초 만'))).toBe(true);
    });
});

describe('🧹 목록 복귀 — 정의는 shared 하나 · 직접콜은 안 치운다', () => {
    it('🔴 shared 의 목록 화면 모두(LIST · LIST_COMPLETED)가 «돌아왔다» — 잡은 콜에 목록 이탈 유예를 건다 · 상세 위 팝업은 아니다', () => {
        for (const list of LIST_SCREENS) {
            const dev = `dev-rules-list-${list}`;
            touch(dev, 'DETAIL_PRE_CONFIRM');
            const s = evaluating(dev, `li-${list}`, { type: 'AUTO', isPreview: false, detailSeen: true });
            touch(dev, list);
            expect(s.entries.has(`listExit_li-${list}`)).toBe(true);
        }
        const dev = 'dev-rules-popup';
        touch(dev, 'DETAIL_PRE_CONFIRM');
        const s = evaluating(dev, 'li-popup', { type: 'AUTO', isPreview: false, detailSeen: true });
        touch(dev, 'POPUP_PICKUP');
        expect(s.entries.has('listExit_li-popup')).toBe(false);
    });

    it('🔴 직접 잡은 콜(MANUAL · MANUAL_CLICK 딱지)은 목록으로 가도 안 치우고 이탈 유예도 안 건다 · 자동 콜은 유예를 건다', () => {
        for (const type of ['MANUAL', 'MANUAL_CLICK']) {
            const dev = `dev-rules-${type}`;
            touch(dev, 'DETAIL_PRE_CONFIRM');
            const s = evaluating(dev, `mn-${type}`, { type, isPreview: false, detailSeen: true });
            touch(dev, 'LIST');
            expect(s.pendingOrdersData.has(`mn-${type}`)).toBe(true);
            expect(s.entries.has(`listExit_mn-${type}`)).toBe(false);
        }
        const dev = 'dev-rules-auto';
        touch(dev, 'DETAIL_PRE_CONFIRM');
        const s = evaluating(dev, 'au-1', { type: 'AUTO', isPreview: false, detailSeen: true });
        touch(dev, 'LIST');
        expect(s.entries.has('listExit_au-1')).toBe(true);
    });

    it('🔴 미리보기는 MANUAL 딱지여도 목록으로 가면 치운다 — 아직 안 잡은 콜이라 보호가 필요 없다', () => {
        const dev = 'dev-rules-pv-manual';
        touch(dev, 'DETAIL_PRE_CONFIRM');
        const s = evaluating(dev, 'pv-manual', { type: 'MANUAL_CLICK', isPreview: true, detailSeen: true });
        touch(dev, 'LIST');
        expect(s.pendingOrdersData.has('pv-manual')).toBe(false);
    });
});

describe('💤 화면 꺼짐 — 접근성 막힘과 구분한다', () => {
    it('🔴 화면이 꺼진 채 노드 0 이면 «못 읽음»을 시작하지 않는다 · 켜진 채 노드 0 이면 시작한다', () => {
        const off = 'dev-rules-screen-off';
        touchDeviceSession(off, ADMIN, 0, 'LIST', quiet, false, undefined, undefined, 0, false);
        expect(sessionOf(off)?.blindSince).toBeUndefined();
        const on = 'dev-rules-screen-on';
        touchDeviceSession(on, ADMIN, 0, 'LIST', quiet, false, undefined, undefined, 0, true);
        expect(sessionOf(on)?.blindSince).toBeGreaterThan(0);
    });
});

describe('🎛️ 모드 — DB 가 원천', () => {
    it('🔴 모드 문은 DB 에 쓴다 — 바꾸면 user_devices.mode 가 그 값', async () => {
        const dev = 'dev-rules-mode-db';
        register(dev, U);
        expect(await setMode(dev, U, 'ALARM')).toBe(200);
        expect(modeInDb(dev)).toBe('ALARM');
        expect(await setMode(dev, U, 'MANUAL')).toBe(200);
        expect(modeInDb(dev)).toBe('MANUAL');
    });

    it('🔴 남의 폰 모드는 못 바꾼다 — 404 · DB 그대로 · 내 폰은 바뀐다', async () => {
        const theirs = 'dev-rules-mode-theirs';
        register(theirs, OTHER);
        expect(await setMode(theirs, U, 'ALARM')).toBe(404);
        expect(modeInDb(theirs)).toBeNull();
        expect(await setMode(theirs, OTHER, 'ALARM')).toBe(200);
        expect(modeInDb(theirs)).toBe('ALARM');
    });

    it('🔴 새 세션의 모드는 DB 에 적힌 값 · 적힌 값이 없으면 그 값이 아니다', () => {
        const saved = 'dev-rules-mode-saved';
        register(saved, U, 'SIMULATION');
        touchDeviceSession(saved, U, 0, 'LIST', quiet);
        expect(sessionOf(saved)?.mode).toBe('SIMULATION');
        const blank = 'dev-rules-mode-blank';
        register(blank, U, null);
        touchDeviceSession(blank, U, 0, 'LIST', quiet);
        expect(sessionOf(blank)?.mode).not.toBe('SIMULATION');
    });

    it('🔴 자동 · 알람 · 체험 폰이 있으면 필터가 돈다 · 직접 폰만 있으면 안 돈다', () => {
        const owners: string[] = [];
        const filterOn = (mode: string) => {
            const owner = `${U}-filter-${mode}`;
            owners.push(owner);
            approvedUser(owner);
            register(`dev-rules-filter-${mode}`, owner, mode);
            touchDeviceSession(`dev-rules-filter-${mode}`, owner, 0, 'LIST', quiet);
            return getUserSession(owner).filterEnabledByMode;
        };
        expect(filterOn('MANUAL')).toBe(false);
        for (const mode of ['AUTO', 'ALARM', 'SIMULATION']) expect(filterOn(mode)).toBe(true);
        for (const o of owners) {
            db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(o);
            db.prepare(`DELETE FROM users WHERE id = ?`).run(o);
        }
    });
});

describe('🔔 알람 — 도는 모드가 알람이고 성적표가 온 보고에서만', () => {
    const alarmsFrom = (dev: string, tally: any, effectiveMode?: string) => {
        const sent: any[] = [];
        const io = { to: () => ({ emit: (ev: string, p: any) => { if (ev === 'filter-pass-alarm') sent.push(p); } }) };
        touchDeviceSession(dev, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker',
            effectiveMode ? { effectiveMode } : undefined);
        return sent;
    };

    it('🔴 서버는 원달앱이 보낸 도는 모드를 받아 두고, 그것이 ALARM 일 때만 알람 — 자동 · 직접으로 돌면 조용하다', () => {
        const tally = { seen: 3, passed: 1, passedNew: 1 };
        expect(alarmsFrom('dev-rules-alarm-auto', tally, 'AUTO')).toHaveLength(0);
        expect(sessionOf('dev-rules-alarm-auto')?.effectiveMode).toBe('AUTO');
        expect(alarmsFrom('dev-rules-alarm-manual', tally, 'MANUAL')).toHaveLength(0);
        expect(alarmsFrom('dev-rules-alarm-on', tally, 'ALARM')).toHaveLength(1);
        expect(sessionOf('dev-rules-alarm-on')?.effectiveMode).toBe('ALARM');
    });

    it('🔴 성적표(filterTally)가 없는 보고는 알람이 없다 · 있으면 난다', () => {
        expect(alarmsFrom('dev-rules-alarm-notally', undefined, 'ALARM')).toHaveLength(0);
        expect(alarmsFrom('dev-rules-alarm-notally', { seen: 2, passed: 1, passedNew: 1 }, 'ALARM')).toHaveLength(1);
    });

    it('🔴 알람에 «조용히» · «못 연 까닭» 같은 칸이 없다 — 관제웹은 받으면 늘 소리를 낸다', () => {
        const [alarm] = alarmsFrom('dev-rules-alarm-body', { seen: 2, passed: 1, passedNew: 1 }, 'ALARM');
        expect(alarm).toBeDefined();
        expect(Object.keys(alarm).sort()).toEqual(['at', 'deviceId', 'deviceName', 'passed', 'passedNew', 'seen']);
    });
});

describe('🔁 자동은 한 폰만', () => {
    it('🔴 자동을 누르면 같은 기사님의 다른 자동 폰을 알람으로 옮겨 저장한다 · 알람을 누르면 다른 폰은 그대로', async () => {
        const owner = `${U}-one-auto`;
        approvedUser(owner);
        register('dev-rules-one-a', owner, 'AUTO');
        register('dev-rules-one-b', owner, 'AUTO');
        expect(await setMode('dev-rules-one-a', owner, 'ALARM')).toBe(200);
        expect(modeInDb('dev-rules-one-b')).toBe('AUTO');
        expect(await setMode('dev-rules-one-a', owner, 'AUTO')).toBe(200);
        expect(modeInDb('dev-rules-one-b')).toBe('ALARM');
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(owner);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(owner);
    });

    it('🔴 «다른 자동 폰» 셈 — 살아 있고 · 자동으로 돌고 · 자동 확정이 되는 배차망인 다른 폰만', () => {
        const owner = `${U}-other-auto`;
        approvedUser(owner);
        const me = 'dev-rules-oa-me', them = 'dev-rules-oa-them';
        register(me, owner, 'AUTO');
        register(them, owner, 'ALARM');
        const report = (dev: string, net: string, extras?: any) =>
            touchDeviceSession(dev, owner, 0, 'LIST', quiet, false, undefined, undefined, undefined, true, undefined, net, extras);
        report(me, 'insung');
        report(them, 'insung');
        expect(otherAutoPhoneOf(me, owner)).toBe(false);                     // 다른 폰이 알람
        report(them, 'insung', { appliedMode: 'AUTO' });
        expect(otherAutoPhoneOf(me, owner)).toBe(true);                      // 받은 모드가 자동 · 인성
        report(them, 'kakaopicker', { appliedMode: 'AUTO' });
        expect(otherAutoPhoneOf(me, owner)).toBe(false);                     // 픽커는 자동 확정이 없다
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(owner);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(owner);
    });
});

describe('📵 데드맨 — 말 없는 폰을 끊김으로 넘길 때', () => {
    it('🔴 데드맨 시간이 지나면 끊김(통신 두절)으로 넘기며 그 폰의 미리보기를 치운다 · 그 전이면 안 치운다', () => {
        const owner = `${U}-deadman`;
        approvedUser(owner);
        const dev = 'dev-rules-deadman';
        register(dev, owner);
        const t0 = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
        touchDeviceSession(dev, owner, 0, 'DETAIL_PRE_CONFIRM', quiet);
        const s = getUserSession(owner);
        s.pendingOrdersData.set('pv-dead', {
            id: 'pv-dead', status: 'ORDER_SECURED_EVALUATING', capturedDeviceId: dev, capturedAt: new Date(t0).toISOString(),
            pickup: '사음동', dropoff: '중리동', fare: 50000, isPreview: true, detailSeen: true,
        });
        s.deviceEvaluatingMap.set(dev, 'pv-dead');
        now.mockReturnValue(t0 + 10_000);
        getActiveDevicesSnapshot(quiet);
        expect(s.pendingOrdersData.has('pv-dead')).toBe(true);
        now.mockReturnValue(t0 + 5 * 60_000);                                // 데드맨 시간보다 길고 잊는 시간(30분)보다 짧게
        const gone = getActiveDevicesSnapshot(quiet).find(d => d.deviceId === dev);
        expect(gone?.status).toBe('OFFLINE');
        expect(gone?.offlineReason).toBe('NO_CONTACT');
        expect(s.pendingOrdersData.has('pv-dead')).toBe(false);
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(owner);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(owner);
    });
});

describe('👁️ 성적표 받은 시각', () => {
    it('🔴 그 보고의 lastSeen 과 같은 값을 찍는다(서버 시계) · 성적표 없는 보고(하트비트)는 그 시각을 안 민다', () => {
        const dev = 'dev-rules-tally-at';
        const t0 = Date.now();
        const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
        touchDeviceSession(dev, ADMIN, 0, 'LIST', quiet, false, undefined, undefined, undefined, true, { seen: 3, passed: 0 });
        expect(sessionOf(dev)?.filterTallyAt).toBe(t0);
        expect(sessionOf(dev)?.filterTallyAt).toBe(sessionOf(dev)?.lastSeen);
        now.mockReturnValue(t0 + 5_000);
        touchDeviceSession(dev, ADMIN, 0, 'LIST', quiet);
        expect(sessionOf(dev)?.lastSeen).toBe(t0 + 5_000);
        expect(sessionOf(dev)?.filterTallyAt).toBe(t0);
    });
});
