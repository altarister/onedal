import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **미리보기 심사석 — 남은 시간이 보이고, 눌러서 치운다.**
 *
 * 🔴 서버는 «픽커 상세 대기 시간 + 정리 여유» 뒤 미리보기를 스스로 치운다. 화면은 그 시간을 **배경이 차오르는 것**으로 말한다.
 * 🔴 **누르면 치운다** — 배차망에는 아무 일도 안 생기고(안 잡은 콜), 취소 한도도 안 깎인다 (`countCancel` 이 미리보기를 안 센다).
 */
const SEAT = join(__dirname, '../../../client-app/src/components/dashboard/JudgmentSeat.tsx');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const src = codeOnly(readFileSync(SEAT, 'utf8'));

describe('👀 미리보기 심사석', () => {
    it('🔴 남은 시간을 «픽커 상세 대기 + 정리 여유»로 센다 — 서버가 치우는 그 시각이다', () => {
        expect(src).toMatch(/pickerAlarmDetailSec/);
        expect(src).toMatch(/SERVER_CLEANUP_EXTRA_SEC/);
    });

    it('🔴 콜이 생긴 시각부터 흐른 만큼 배경이 차 있다 — 새로고침해도 처음부터 다시 차오르지 않는다', () => {
        expect(src).toMatch(/capturedAt/);
        expect(src).toMatch(/animationDelay/);
    });

    it('🔴 누르면 치운다 — 미리보기에만 있는 길이다', () => {
        expect(src).toMatch(/isPreview/);
        expect(src).toMatch(/onDecision\?\.\(route\.id, 'SAFE_CANCEL'\)/);
    });
});
