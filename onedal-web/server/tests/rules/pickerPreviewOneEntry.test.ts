import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **픽커 상세 — 누가 열었든 한 곳에서 카드를 찾고, 판정까지 간다** (폰 시험)
 *
 * 기사님: *"내가 픽업에서 리스트를 클릭했는데.. 관제엡에서는 콜로 인지 하지 않았고 평가 하지 않았어.
 * 내가 손으로 누르면 경로를 찾아서 평가해야 해"*
 *
 * ── 막는 구멍 둘 ──
 * ① 손으로 연 상세 — 카드를 **알람이 누를 때만** 쥐여 주면 `👀 [미리보기 보류] 리스트 원본이 없다` 로 멈춘다.
 * ② 알람이 연 상세 — 서버는 **둘째 보고(`/detail`)가 와야** 경로를 찾는다. 첫 보고(`/confirm`)만 가면
 *    관제웹 «평가중»이 30초 뒤 사라지고 픽커 미리보기는 판정되지 않는다.
 *
 * 클래스: 「판단이 한쪽 경로에만 있다」 (#75 · #77 과 같은 뿌리) → 구조로 막는다:
 *   카드 찾기는 `KakaoPickerParser.matchListCard` 한 곳 · 알람 경로가 카드를 따로 쥐여 주지 않는다 · 미리보기는 둘째 보고까지 간다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const read = (abs: string) => readFileSync(abs, 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const hijack = codeOnly(read(join(APP, 'HijackService.kt')));
const preConfirmSeq = codeOnly(read(join(APP, 'core/engine/PreConfirmSequence.kt')));
const pickerParser = codeOnly(read(join(APP, 'plugins/kakaopicker/KakaoPickerParser.kt')));

describe('픽커 상세 — 카드 찾기는 한 곳 (#119)', () => {

    it('🔴 목록에서 누른 뒤 세션을 세우는 곳은 한 곳 — 모드마다 따로 쥐여 주는 길이 없다', () => {
        // 한쪽 길(알람)에만 카드를 쥐여 주면 다른 길로 연 상세가 빠진다 — 누르는 곳이 하나면 그 병이 없다
        const list = hijack.split('private fun handleListScreen')[1]?.split('\n    private fun ')[0] ?? '';
        const i = list.indexOf('🚪 [상세 진입]');
        expect(i).toBeGreaterThan(-1);
        expect(list.match(/session\.lastDetailOrder\s*=/g)?.length).toBe(1);
        expect(list.indexOf('session.lastDetailOrder')).toBeGreaterThan(i);
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
