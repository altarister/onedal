import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **픽커 상세 — 누가 열었든 한 곳에서 카드를 찾고, 판정까지 간다** (2026-09-14 폰 시험)
 *
 * 기사님: *"내가 픽업에서 리스트를 클릭했는데.. 관제엡에서는 콜로 인지 하지 않았고 평가 하지 않았어.
 * 내가 손으로 누르면 경로를 찾아서 평가해야 해"*
 *
 * ── 로그가 보여 준 두 구멍 ──
 * ① 손으로 연 상세 (17:05:38) — `👀 [미리보기 보류] 리스트 원본이 없다`. 카드는 **알람이 누를 때만** 쥐여 줬다.
 * ② 알람이 연 상세 (16:22 · 16:23) — 첫 보고(`/confirm`)만 갔다. 서버는 **둘째 보고(`/detail`)가 와야**
 *    경로를 찾는데 픽커는 «수락하기» 뒤에만 보냈다 → 관제웹 «평가중» 30초 뒤 사라짐. 픽커 미리보기는 한 번도 판정된 적이 없다.
 *
 * 클래스: 「판단이 한쪽 경로에만 있다」 (#75 · #77 과 같은 뿌리 — 세 번째) → 구조로 없앤다:
 *   카드 찾기는 `KakaoPickerParser.matchListCard` 한 곳 · 알람 경로의 따로 쥐여 주기를 없앤다 · 미리보기는 둘째 보고까지 간다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const read = (abs: string) => readFileSync(abs, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const hijack = codeOnly(read(join(APP, 'HijackService.kt')));
const preConfirmSeq = codeOnly(read(join(APP, 'core/engine/PreConfirmSequence.kt')));
const pickerParser = codeOnly(read(join(APP, 'plugins/kakaopicker/KakaoPickerParser.kt')));

describe('픽커 상세 — 카드 찾기는 한 곳 (#119)', () => {

    it('🔴 알람 경로가 카드를 따로 쥐여 주지 않는다 — 그 한쪽 길 때문에 손으로 연 상세만 빠졌다', () => {
        const i = hijack.indexOf('🚪 [알람 상세]');
        // 알람이 카드를 누르는 갈래의 끝 — 상세 대기 타이머도 이제 여기서 걸지 않는다 (#124)
        const j = hijack.indexOf('} else if', i);
        expect(i).toBeGreaterThan(-1);
        expect(j).toBeGreaterThan(i);
        expect(hijack.slice(i, j)).not.toMatch(/lastDetailOrder\s*=/);
    });

    it('🔴 미리보기는 리스트 카드를 찾는 함수 하나를 거친다', () => {
        expect(preConfirmSeq).toMatch(/scrapParser\.matchDetailOrder\(/);
        expect(pickerParser).toMatch(/matchListCard\(screenTexts,\s*recentOrders\)/);
    });
});

describe('픽커 상세 — 미리보기도 판정까지 간다 (#119)', () => {

    it('🔴 첫 보고 뒤 둘째 보고까지 보낸다 — 서버는 둘째 보고가 와야 경로를 찾는다', () => {
        const confirm = preConfirmSeq.indexOf('sendConfirmOnce(');
        const detail = preConfirmSeq.indexOf('sendDetail(');
        expect(confirm).toBeGreaterThan(-1);
        expect(detail).toBeGreaterThan(confirm);
    });
});
