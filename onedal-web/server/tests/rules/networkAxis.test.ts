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

    it('🚧 잡기 수순의 입구마다 잡기 차단 검사가 있다 — 수순 없는 배차망은 클릭 못 한다', () => {
        /**
         * 인성 전용 구간 (픽커_수집.md §3-확장): 인성 잡기 수순(리스트 자동클릭 ·
         * 확정 전/후 화면 · 팝업 3종)의 입구는 supportsCatching 잡기 차단 검사를 지나야 한다.
         * 이 검사가 하나라도 빠지면 픽커 화면에서 인성 수순이 돌아 엉뚱한 걸 누른다.
         * 이 표시가 곧 «잡기 시작하는 날» 인성 수순을 떼어낼 자리다.
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

/**
 * 📄 **픽커 상세 원문 보관 — 인성에는 새지 않는다** (기사님 확정 2026-09-02 · 갈래 ⓑ).
 *
 * 픽커 «확정 전 상세»에는 리스트에 없는 것이 다 있다 — 배송 km · 「17:04까지 픽업」·
 * 물품 규격 · 수익 분해. **어떤 칸으로 나눌지는 수락 뒤 화면을 실물로 본 다음에 정하므로**
 * (기사님: *"다녀와서 그걸 어떻게 테이블 구분을 할 건지 다시 고민한다"*), 지금은
 * `intel.rawDetailText` 한 칸에 **원문으로** 받는다.
 *
 * 🔴 여기서 지키는 것은 하나다 — **인성 콜은 이 칸에 안 들어간다.** 들어가면
 *    표본이 섞여 인성 판정이 오염된다 (규칙 ⑤-4 ⑤ «누가 이 값을 읽는가»).
 */
describe('픽커 상세 원문 보관', () => {
    it('🔴 픽커일 때만 저장한다 — targetApp 관문이 소스에 있다', () => {
        const src = readFileSync(join(__dirname, '../../src/routes/orders.ts'), 'utf8');
        expect(src).toMatch(/targetApp === 'kakaopicker'/);
        // 원문이 없으면 빈 줄을 만들지 않는다 (규칙 ④ — 지어내지 않는다)
        expect(src).toMatch(/rawText\b/);
        expect(src).toMatch(/PICKER_DETAIL/);        // 리스트 훑기(INTEL_BULK)와 갈라 둔다
    });

    it('칸이 스키마에 있다 — 기존 DB 에도 소급 적용된다', () => {
        const db = readFileSync(join(__dirname, '../../src/db.ts'), 'utf8');
        expect(db).toMatch(/rawDetailText:\s*'TEXT'/);
        // ensureColumns 로 붙여야 기존 1,500여 건이 살아 있는 채로 칸만 생긴다
        expect(db).toMatch(/ensureColumns\('intel'/);
    });
});

/**
 * 💸 **요금 하한은 배차망마다 다르다** (기사님 확정 2026-09-02 · 실측으로 드러났다).
 *
 * 픽커 콜 5,544원이 **인성 하한 20,000원**에 걸려 «똥콜»로 나왔다(08:37 실측).
 * 요금 체계가 아예 다른 판을 한 잣대로 잰 것이다 — 픽커는 앱의 알람 하한이 이미 걸렀다
 * (규칙 ⑤-1: *"돈은 앱이 이미 걸렀다 — 서버가 다시 세지 않는다"*).
 */
describe('요금 하한의 배차망 축', () => {
    it('🔴 픽커는 인성 절대하한을 타지 않는다', () => {
        const src = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');
        expect(src).toMatch(/targetApp === 'kakaopicker'/);
        // 인성 경로는 살아 있어야 한다 — 픽커만 건너뛴다
        expect(src).toMatch(/첫짐 절대하한가 미달/);
    });

    it('🔴 알람 하한을 판정에 재활용하지 않는다 — 한 값 두 역할 금지 (⑤-4 ⑤)', () => {
        // 주석은 걷어내고 **코드만** 본다 — 설명에 그 이름이 나오는 것은 괜찮다
        const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        const src = codeOnly(readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8'));
        // «울릴까»(pickerAlarmMinFare) 와 «색을 뭘로»(판정)는 다른 질문이다
        expect(src).not.toMatch(/pickerAlarmMinFare/);
    });
});
