import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **미리보기 심사석 — 남은 시간이 보이고, 보기만 한다.**
 *
 * 🔴 남은 판정 시간은 **배경이 차오르는 것**으로 말한다(표시용 — 콜을 끄지 않는다).
 * 🔴 **관제웹은 미리보기를 닫지 않는다** — 미리보기는 스캔폰이 주도한다. 닫히는 것은 폰이 알린 사실(상세 이탈 · 수락 · 끊김)뿐이다 (기사님).
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
        /* 막대는 잡은 때(capturedAt)부터 판정 끝(judgeUntil)까지 — 두 걸음(drainPlanOf)이 흐른 만큼에서 시작한다 */
        expect(src).toMatch(/start: capturedAtMs, end: route\.judgeUntil/);
        expect(src).toMatch(/drainPlanOf\(startMs, endMs, Date\.now\(\), drawn\.current\)/);
    });

    it('🔴 관제웹은 미리보기에 결재를 보내지 않는다 — 누르면 치우던 길이 없다', () => {
        expect(src).toMatch(/isPreview/);
        /* 거절 단추(자동 갈래)의 SAFE_CANCEL 은 그대로 — 미리보기 갈래에서 보내는 길만 없다 */
        expect(src).not.toMatch(/isPreview\)\s*\{[^}]*onDecision/);
    });
});
