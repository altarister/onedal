import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⏱️ **픽커 상세 대기 타이머 — 누가 열었든 거는 곳 하나 · 끄는 곳 하나** (폰 시험)
 *
 * 18:30:34 — 18:29:34 알람이 건 60초 타이머가, 기사님이 18:30:16 에 **손으로 연 다른 상세**를 18초 만에 닫았다.
 * 원인 둘:
 *   ① 타이머를 **알람이 카드를 누를 때만** 걸었다 (손으로 연 상세는 따로 · 갈래가 둘)
 *   ② 끄는 곳이 «상세 → 리스트» 한 경우뿐 — 실제로는 «상세 → 모르는 화면(중간 장면) → 리스트»라 안 꺼졌다
 *
 * 기사님: *"리스트에서 사람이 콜하나를 선택해서 클릭하고 상세페이지에 진입하더라도 정해진 시간이 지나면
 * 다시 리스트로 돌아온다. 이렇게 하면 분기 하나가 사라질수 있겠다"* · 모드(자동·알람·직접)도 가리지 않는다.
 *
 * 클래스: 「판단이 한쪽 경로에만 있다」 + 「콜의 생애를 화면 이벤트로 끝낸다」(#44) — 끄는 곳은 세션을 비우는 한 곳이다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const hijack = codeOnly(readFileSync(join(APP, 'HijackService.kt'), 'utf8'));
const sequence = codeOnly(readFileSync(join(APP, 'core/engine/PreConfirmSequence.kt'), 'utf8'));
const allCode = hijack + '\n' + sequence;

const countOf = (re: RegExp) => (allCode.match(re) || []).length;
const bodyOf = (signature: string) => {
    const i = hijack.indexOf(signature);
    return i < 0 ? '' : hijack.slice(i, hijack.indexOf('\n    }', i));
};

describe('픽커 상세 대기 타이머 — 한 곳 (#124)', () => {

    it('🔴 거는 곳은 상세 화면 처리 한 곳 — 알람이 카드를 누르는 자리에는 없다', () => {
        // 부르는 곳만 센다 — 함수 정의 줄(`fun scheduleDetailBack()`)은 빼고
        expect(countOf(/(?<!fun ScanContext\.|override fun |fun )\bscheduleDetailBack\(\)/g)).toBe(1);
        const alarm = hijack.indexOf('🚪 [알람 상세]');
        const alarmBlock = hijack.slice(alarm, hijack.indexOf('} else if', alarm));
        expect(alarm).toBeGreaterThan(-1);
        expect(alarmBlock).not.toMatch(/DetailBack\(\)/);
        expect(sequence).toMatch(/handlePreConfirmScreen[\s\S]*?scheduleDetailBack\(\)/);
    });

    it('🔴 끄는 곳은 세션을 비우는 한 곳 — «상세 → 리스트» 한 경우에만 끄지 않는다', () => {
        expect(bodyOf('override fun resetSessionState()')).toMatch(/cancelDetailBack\(\)/);
        expect(hijack).not.toMatch(/previous == ScreenContext\.DETAIL_PRE_CONFIRM\)\s*cancel/);
        expect(hijack).not.toMatch(/AlarmDetailBack/);
    });

    it('🔴 모드를 가리지 않는다 — 알람일 때만 돌아오지 않는다', () => {
        const fn = bodyOf('override fun scheduleDetailBack()') || bodyOf('private fun scheduleDetailBack()');
        expect(fn.length).toBeGreaterThan(0);
        expect(fn).not.toMatch(/currentMode\s*==\s*"ALARM"/);
    });
});
