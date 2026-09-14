import { readFileSync } from 'fs';
import { join } from 'path';
import {
    phoneCheckOf, rememberSentFilterVersion, sentFilterVersionOf, forgetSentFilterVersions,
    FILTER_SYNC_GRACE_MS, CONTACT_STALE_MS,
} from '../../src/core/phoneCheck';

/**
 * 📱 **테스트 시작 전 점검 — 폰이 «실제로 쓰는 값»을 서버 값과 비교한다** (기사님 지시 2026-09-14)
 *
 * 기사님: *"지금 여러 번 같은 지점에 오류가 계속되고 있어 … 먼발치에서 근본적인 원인을 찾아 수정해야 할 것 같아"*
 *
 * 그날 콜이 안 잡힌 두 번은 시스템이 옳게 거른 것이 아니라 **테스트 조건이 틀어져 있었다** —
 * 그런데 시작 전 점검은 «서버가 정한 값»만 봐서 초록이었다:
 * ```
 * 14:41  폰이 서버 응답을 못 읽어 옛 필터 · 직접 모드(MANUAL)로 돌았다  ← 서버는 폰이 보낸 모드·지문을 들고 있었다
 * 14:54  폰에 실제로 적용된 상차 반경 4.55km (자동)                      ← 점검은 설정값 10km 를 봤다
 * ```
 * 폰은 통신마다 «적용 중인 모드»와 «들고 있는 필터 지문»을 보낸다. 서버는 그 순간 «보낼 지문»을 계산한다.
 * **둘을 비교하는 곳이 없었다** — 이 검사가 그 비교를 잠근다.
 */

const NOW = 1_800_000_000_000;
const dev = (over: Record<string, unknown> = {}) => ({
    deviceId: '폰1', deviceName: '1234', lastSeen: NOW - 5_000, status: 'ONLINE', mode: 'AUTO',
    version: '2.9.4-radiusdouble', stats: { polled: 0, grabbed: 0, canceled: 0 },
    ...over,
}) as any;

describe('📱 폰 점검 — 모드', () => {
    it('🔴 설정한 모드와 폰이 대답한 모드가 다르면 빨간불 (14:41 폰이 MANUAL 로 남았다)', () => {
        const c = phoneCheckOf(dev({ appliedMode: 'MANUAL' }), undefined, NOW);
        expect(c.mode).toEqual({ want: 'AUTO', got: 'MANUAL', ok: false });
    });
    it('같으면 초록', () => {
        expect(phoneCheckOf(dev({ appliedMode: 'AUTO' }), undefined, NOW).mode.ok).toBe(true);
    });
    it('대답을 안 보내는 폰은 «모름»이다 — 초록으로 지어내지 않는다', () => {
        const c = phoneCheckOf(dev(), undefined, NOW);
        expect(c.mode).toEqual({ want: 'AUTO', got: null, ok: false });
    });
});

describe('📱 폰 점검 — 필터 지문', () => {
    it('🔴 서버가 보낸 지문과 폰의 지문이 오래 다르면 «옛 필터» 빨간불', () => {
        const c = phoneCheckOf(dev({ filterVersion: 'A' }), { version: 'B', since: NOW - FILTER_SYNC_GRACE_MS - 10_000 }, NOW);
        expect(c.filter.state).toBe('stale');
        expect(c.filter.ok).toBe(false);
    });
    it('방금 바뀌었으면 «받는 중» — 빨간불이 아니다 (다음 통신에 실려 간다)', () => {
        const c = phoneCheckOf(dev({ filterVersion: 'A' }), { version: 'B', since: NOW - 10_000 }, NOW);
        expect(c.filter).toEqual({ state: 'waiting', ok: true, ageSec: 10 });
    });
    it('같으면 초록', () => {
        const c = phoneCheckOf(dev({ filterVersion: 'B' }), { version: 'B', since: NOW - 999_000 }, NOW);
        expect(c.filter.state).toBe('same');
        expect(c.filter.ok).toBe(true);
    });
    it('서버가 아직 보낸 적이 없거나 폰이 지문을 안 보내면 «모름»', () => {
        expect(phoneCheckOf(dev({ filterVersion: 'A' }), undefined, NOW).filter).toEqual({ state: 'unknown', ok: false, ageSec: null });
        expect(phoneCheckOf(dev(), { version: 'B', since: NOW }, NOW).filter.state).toBe('unknown');
    });
});

describe('📱 폰 점검 — 연락', () => {
    it('🔴 1분 넘게 소식이 없으면 빨간불', () => {
        const c = phoneCheckOf(dev({ lastSeen: NOW - CONTACT_STALE_MS - 1_000 }), undefined, NOW);
        expect(c.contact.ok).toBe(false);
    });
    it('한 번도 연락이 없던 폰(lastSeen 0)도 빨간불', () => {
        expect(phoneCheckOf(dev({ lastSeen: 0 }), undefined, NOW).contact).toEqual({ ageSec: null, ok: false });
    });
    it('이름과 앱 버전을 함께 싣는다', () => {
        const c = phoneCheckOf(dev(), undefined, NOW);
        expect(c.name).toBe('1234');
        expect(c.appVersion).toBe('2.9.4-radiusdouble');
    });
});

describe('📱 서버가 «보낸 지문» 기억', () => {
    beforeEach(() => forgetSentFilterVersions());
    it('지문이 바뀔 때만 «언제부터»를 새로 잡는다', () => {
        rememberSentFilterVersion('폰1', 'A', 100);
        rememberSentFilterVersion('폰1', 'A', 200);
        expect(sentFilterVersionOf('폰1')).toEqual({ version: 'A', since: 100 });
        rememberSentFilterVersion('폰1', 'B', 300);
        expect(sentFilterVersionOf('폰1')).toEqual({ version: 'B', since: 300 });
    });
});

describe('📱 짝 — 폰에 실제로 보내는 지문을 기억하고, 점검이 그것을 읽는다', () => {
    const code = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 scrap.ts 가 응답에 싣는 그 지문을 기억한다', () => {
        expect(code('routes/scrap.ts')).toMatch(/rememberSentFilterVersion\(\s*deviceId\s*,\s*filterVersion\s*\)/);
    });
    it('🔴 시작 전 점검이 폰 점검과 «실제로 적용되는» 반경을 싣는다', () => {
        const sim = code('routes/sim.ts');
        expect(sim).toMatch(/phoneCheckOf\(/);
        expect(sim).toMatch(/sentFilterVersionOf\(/);
        expect(sim).toMatch(/effectiveRadii\(/);
    });
});
