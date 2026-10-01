import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🎛️ **관제웹 폰 모드 고르기 — 자동 잡기 허락이 꺼진 폰은 «자동» 버튼이 없다** (기사님 결정 · onedal-69).
 *    못 쓰는 버튼을 보이고 «허락이 꺼졌습니다»라고 설명하지 않는다 — 버튼 자체를 그리지 않는다.
 *    목록은 shared `modeChoicesOf` 하나가 정한다(셈은 shared `deviceStage.test` — 허락 켜짐 · 사실 없음은 지금 그대로).
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('🎛️ 관제웹 폰 모드 고르기', () => {
    const panel = read('client-app/src/components/dashboard/DeviceControlPanel.tsx');

    it('🔴 목록은 shared modeChoicesOf 가 정한다 — 화면이 셋을 직접 늘어놓지 않는다', () => {
        expect(panel).toContain('{modeChoicesOf(DEVICE_MODES, device).map(m => (');
        expect(panel).not.toContain('DEVICE_MODES.filter(');
    });

    it('🔴 «허락이 꺼졌습니다» 안내 줄 · 버튼 설명 문구가 관제웹 · shared 어디에도 없다', () => {
        for (const f of ['client-app/src/components/dashboard/DeviceControlPanel.tsx', 'shared/src/allowance.ts', 'shared/src/index.ts'])
            expect(read(f)).not.toMatch(/modeHeldWhy|heldWhy|자동 잡기 허락이 꺼졌습니다/);
    });

    it('🔴 «적용중» 고침은 그대로 — 폰에 갈 모드와 견준다', () => {
        expect(panel).toContain('const applying = isModeApplying(device);');
        expect(read('shared/src/index.ts')).toContain('return phoneModeOf(d) !== d.appliedMode;');
    });
});
