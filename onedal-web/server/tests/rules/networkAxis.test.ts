import { readFileSync } from 'fs';
import { join } from 'path';
import { touchDeviceSession } from '../../src/routes/devices';
import { isTargetApp, isCapturedVia, TARGET_APPS, DEFAULT_TARGET_APP } from '@onedal/shared';

/**
 * 🌐 **«어느 배차망» 축과 «어떻게 잡았나» 칸** (기사님 확정 2026-08-30 · 픽커_수집.md §6-전)
 *
 * · targetApp: 6하원칙의 «어디서». 원장(orders·intel)엔 이미 있었고, 여기서 지키는 것은
 *   ① 기기 세션이 scrap 의 targetApp 을 버리지 않는다 (폰 영역 배지의 원천)
 *   ② 값 표준은 shared 한 벌이다 — 모르는 값은 기본값으로
 * · capturedVia: 6하원칙의 «어떻게»(자동·알람·직접) — **기록 전용**. 보호 분기는
 *   matchType 만 본다 (#75 재발 방지). 원장에 실리는 배선을 소스로 잠근다.
 */
describe('«어느 배차망» 축', () => {
    it('🔴 기기 세션이 scrap 의 targetApp 을 기억한다 — 폰 영역 배지의 원천', () => {
        touchDeviceSession('test-net-axis-dev', 'test-net-axis-user', 1, 'LIST',
            undefined, false, undefined, undefined, undefined, undefined, undefined, 'kakaopicker');
        // 갱신 경로도 같은 자리를 지나는지 — 배차망을 갈아탄 폰이 옛 배지로 남으면 안 된다
        touchDeviceSession('test-net-axis-dev', 'test-net-axis-user', 1, 'LIST',
            undefined, false, undefined, undefined, undefined, undefined, undefined, 'insung');

        const src = readFileSync(join(__dirname, '../../src/routes/devices.ts'), 'utf8');
        expect(src).toMatch(/session\.targetApp = targetApp/);
        expect(src).toMatch(/targetApp,/);   // 생성 경로에도 실린다
    });

    it('값 표준은 shared 한 벌 — 셋이고, 모르는 값은 기본값으로 거른다', () => {
        expect([...TARGET_APPS]).toEqual(['insung', 'hwamul24', 'kakaopicker']);
        expect(DEFAULT_TARGET_APP).toBe('insung');
        expect(isTargetApp('kakaopicker')).toBe(true);
        expect(isTargetApp('모르는앱')).toBe(false);
    });
});

describe('«어떻게 잡았나» — 기록 전용 칸', () => {
    const strip = (p: string) => readFileSync(join(__dirname, p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 confirm 이 capturedVia 를 검증해 원장 캐시에 싣는다', () => {
        const orders = strip('../../src/routes/orders.ts');
        expect(orders).toMatch(/capturedVia: isCapturedVia\(/);
    });

    it('🔴 재시작 복원이 capturedVia 를 되살린다 — 빠지면 재부팅마다 갈래 배지가 사라진다', () => {
        // 복원 경로(dispatchEngine 되살리기)는 칸을 하나씩 옮겨 담는다 — 새 칸을 만들면 여기도 실어야 한다
        const engine = strip('../../src/services/dispatchEngine.ts');
        expect(engine).toMatch(/capturedVia: row\.capturedVia/);
    });

    it('🔴 원장 저장(upsert)에 capturedVia 가 실리고, 재확정 때 지워지지 않는다', () => {
        const repo = readFileSync(join(__dirname, '../../src/repositories/OrderRepository.ts'), 'utf8');
        expect(repo).toMatch(/capturedVia/);
        expect(repo).toMatch(/capturedVia = COALESCE\(excluded\.capturedVia, capturedVia\)/);
    });

    it('모르는 값은 null — 지어내지 않는다 (규칙 ④)', () => {
        expect(isCapturedVia('ALARM')).toBe(true);
        expect(isCapturedVia('ALARM_CLICK')).toBe(false);   // #75 의 그 딱지는 값이 아니다
    });

    it('🚧 잡기 수순의 입구마다 수문이 있다 — 수순 없는 배차망은 클릭 못 한다', () => {
        /**
         * 시퀀스 플러그인 경계 (픽커_수집.md §3-확장): 인성 잡기 수순(리스트 자동클릭 ·
         * 확정 전/후 화면 · 팝업 3종)의 입구는 supportsCatching 수문을 지나야 한다.
         * 수문이 하나라도 빠지면 픽커 화면에서 인성 수순이 돌아 엉뚱한 걸 누른다.
         * 이 금이 곧 «잡기 시작하는 날» 인성 수순을 떼어낼 절단선이다.
         */
        const hijack = readFileSync(join(__dirname,
            '../../../../onedal-app/app/src/main/java/com/onedal/app/HijackService.kt'), 'utf8');
        const gates = hijack.match(/TargetApp\.supportsCatching\(currentTargetApp\)/g) ?? [];
        expect(gates.length).toBeGreaterThanOrEqual(6);
    });

    it('🔴 보호 분기는 capturedVia 를 읽지 않는다 — #75 재발 방지', () => {
        // 직접콜 보호(강제 취소 면제·즉시 KEEP)는 matchType/type 만 본다.
        // capturedVia 가 보호 조건에 등장하면 기록이 판단으로 새는 것이다.
        const engine = strip('../../src/services/dispatchEngine.ts');
        const detail = strip('../../src/routes/detail.ts');
        const devices = strip('../../src/routes/devices.ts');
        for (const src of [engine, detail, devices]) {
            expect(src).not.toMatch(/capturedVia\s*===|===\s*.{0,20}capturedVia/);
        }
    });
});
