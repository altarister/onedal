import { create } from 'zustand';
import { MOTION_HOLD_SEC_DEFAULT, DEFAULT_WAIT_TIMES } from '@onedal/shared';
import type { WaitTimes } from '@onedal/shared';
import { apiClient } from '../api/apiClient';

/**
 * ⚙️ **화면이 쓰는 설정 — 한 곳에서 읽는다** (기사님 지시).
 *
 * 🔴 **왜 스토어인가** — 이 값을 쓰는 곳(`useDriveMotion` · 판정석 장막 · 홀드 진행 막대)이 화면 여럿에 있다.
 *    각자 `/settings` 를 부르면 **같은 값을 여러 번 묻고, 저장 뒤 어떤 화면은 옛 값을
 *    쓴다.** 한 그릇에 담고 모두가 그것을 본다 (규칙 ③).
 *
 * 🔴 **여기에 계산을 넣지 않는다** — 서버가 준 값을 그대로 든다. 기본값조차
 *    `shared` 한 곳에서 온다 (`MOTION_HOLD_SEC_DEFAULT` · `DEFAULT_WAIT_TIMES`).
 *
 * ⚠️ 설정 전부를 여기 담지 않는다. **화면이 실제로 읽는 것만** 올린다 —
 *    요율·판정 기준은 서버가 쓰는 값이라 화면이 들고 있을 이유가 없다.
 */
interface SettingsState extends WaitTimes {
    /** ⏱️ «주행·정차»로 굳는 초 — 모의 주행에서는 줄여 쓴다 */
    motionHoldSec: number;
    /** 서버에서 한 번 읽어 온 적이 있나 — 두 번 묻지 않게 */
    loaded: boolean;
    setMotionHoldSec: (n: number) => void;
    /** ⏱️ 배차망별 대기 시간 — 판정석 장막 · 홀드 진행 막대가 읽는다 */
    setWaitTimes: (w: WaitTimes) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    motionHoldSec: MOTION_HOLD_SEC_DEFAULT,
    ...DEFAULT_WAIT_TIMES,
    loaded: false,
    setMotionHoldSec: (n) => set({ motionHoldSec: n }),
    setWaitTimes: (w) => set({ ...w }),
}));

/**
 * 📡 **서버 값을 한 번 읽어 온다** — 앱이 뜰 때 한 번. 저장하면 그 자리에서 스토어도 고친다
 *    (`ScreenSettingsTab` · `GeneralSettingsTab`), 그러니 다시 물을 일이 없다.
 */
export async function loadScreenSettings(): Promise<void> {
    if (useSettingsStore.getState().loaded) return;
    try {
        const { data } = await apiClient.get('/settings');
        useSettingsStore.setState({
            motionHoldSec: data?.motionHoldSec ?? MOTION_HOLD_SEC_DEFAULT,
            safeCancelSecInsung: data?.safeCancelSecInsung ?? DEFAULT_WAIT_TIMES.safeCancelSecInsung,
            safeCancelSecHwamul24: data?.safeCancelSecHwamul24 ?? DEFAULT_WAIT_TIMES.safeCancelSecHwamul24,
            pickerAlarmDetailSec: data?.pickerAlarmDetailSec ?? DEFAULT_WAIT_TIMES.pickerAlarmDetailSec,
            loaded: true,
        });
    } catch {
        /* 🔴 못 읽으면 기본값으로 간다 — 화면이 멈추는 것보다 낫다 (규칙 ④: 지어내지 않고 기본을 쓴다) */
        useSettingsStore.setState({ loaded: true });
    }
}
