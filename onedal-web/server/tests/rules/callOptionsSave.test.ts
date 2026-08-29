import { readFileSync } from 'fs';
import { join } from 'path';
import db, { dwellRatesFor, forgetCallOptions, seedCallOptions } from '../../src/db';

/**
 * 🎛️ **값을 고쳐 저장하면 «서버 판정»도 바로 새 값을 써야 한다** (기사님 지적 2026-08-29)
 *
 * 기사님: *"버튼을 눌러 값을 바꾸고 저장되면 서버 값을 바꿔야 하니까. 알고 있지?"*
 *
 * ── 왜 위험한가 ──
 *
 * 서버는 표를 매번 읽지 않고 **사람마다 기억해 둔다**(`dwellRatesFor`). 빠르지만,
 * 저장할 때 **그 기억을 안 버리면** 이렇게 된다:
 *
 * ```
 * 기사님이 「수작업 30초/박스」로 고쳐 저장
 *   DB       →  0.5           (바뀜)
 *   화면     →  「수작업 15분」 (바뀜)
 *   서버 판정 →  「10분」        ← 기억한 옛 값        두 목소리
 * ```
 *
 * 🔴 이 레포가 **오늘만 세 번** 겪은 #33 클래스다. 그래서 저장은 **셋을 한 번에** 한다:
 *    ① DB 를 고친다  ② **기억을 버린다**  ③ 세션·화면을 갱신한다.
 */

const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const maybe = USER ? describe : describe.skip;

maybe('🎛️ 저장하면 서버 판정이 바로 새 값을 쓴다', () => {
    beforeAll(() => seedCallOptions(USER));
    const 되돌리기 = () => {
        db.prepare(`UPDATE call_options SET num2 = ? WHERE user_id = ? AND category = 'handling' AND key = '수작업'`)
          .run(1 / 3, USER);
        forgetCallOptions(USER);
    };
    afterAll(되돌리기);

    it('🔴 기억을 버리면 새 값이 보인다', () => {
        되돌리기();
        expect(dwellRatesFor(USER).perBoxMin!.manualMin).toBeCloseTo(1 / 3);

        db.prepare(`UPDATE call_options SET num2 = 0.5 WHERE user_id = ? AND category = 'handling' AND key = '수작업'`)
          .run(USER);
        forgetCallOptions(USER);
        expect(dwellRatesFor(USER).perBoxMin!.manualMin).toBeCloseTo(0.5);
    });

    /** 🔴 이게 이 검사의 핵심 — 기억을 안 버리면 **옛 값이 그대로 산다** */
    it('🔴 기억을 안 버리면 옛 값이 남는다 — 그래서 저장이 반드시 버려야 한다', () => {
        되돌리기();
        dwellRatesFor(USER);                                  // 기억에 옛 값을 앉힌다
        db.prepare(`UPDATE call_options SET num2 = 0.9 WHERE user_id = ? AND category = 'handling' AND key = '수작업'`)
          .run(USER);
        expect(dwellRatesFor(USER).perBoxMin!.manualMin).toBeCloseTo(1 / 3);   // 아직 옛 값
        forgetCallOptions(USER);
        expect(dwellRatesFor(USER).perBoxMin!.manualMin).toBeCloseTo(0.9);     // 버리면 새 값
    });
});

describe('🎛️ 저장 길이 셋을 다 한다', () => {
    const 소켓 = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const 저장 = 소켓.slice(소켓.indexOf('save-call-options'),
                          소켓.indexOf('save-call-options') + 1400);

    it('① DB 를 고친다', () => {
        expect(저장).toMatch(/UPDATE call_options SET/);
    });

    it('🔴 ② 기억을 버린다 — 빠뜨리면 서버 판정이 옛 값을 계속 쓴다', () => {
        expect(저장).toMatch(/forgetCallOptions\(userId\)/);
    });

    it('③ 세션과 화면을 갱신한다', () => {
        expect(저장).toMatch(/session\.callOptions = loadCallOptions\(userId\)/);
        expect(저장).toMatch(/emit\("call-options-init"/);
    });

    it('한 번에 넣는다 — 절반만 반영된 상태를 만들지 않는다', () => {
        expect(저장).toMatch(/db\.transaction/);
    });
});
