import { create } from 'zustand';
import { MOTION_HOLD_SEC_DEFAULT, DEFAULT_WAIT_TIMES } from '@onedal/shared';
import type { WaitTimes } from '@onedal/shared';
import { apiClient } from '../api/apiClient';
import { socket } from '../lib/socket';

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
    /** 🚚 내 차종 — 머리줄 · 일반 설정창이 읽는다. 못 읽었으면 null */
    vehicleType: string | null;
    /** 🧭 경로 기본 우선 — 일반 설정창이 읽는다 */
    defaultPriority: string | null;
    /** 🏠 집 주소와 좌표 — 지도 출발점 · 집 버튼 · 필터창 «설정의 집 주소»가 읽는다. 좌표는 서버가 찾은 값 */
    homeAddress: string | null;
    homeX: number | null;
    homeY: number | null;
    /** 서버에서 한 번 읽어 온 적이 있나 — 두 번 묻지 않게 */
    loaded: boolean;
    setMotionHoldSec: (n: number) => void;
    /** ⏱️ 배차망별 대기 시간 — 판정석 장막 · 홀드 진행 막대가 읽는다 */
    setWaitTimes: (w: WaitTimes) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    motionHoldSec: MOTION_HOLD_SEC_DEFAULT,
    ...DEFAULT_WAIT_TIMES,
    vehicleType: null,
    defaultPriority: null,
    homeAddress: null,
    homeX: null,
    homeY: null,
    loaded: false,
    setMotionHoldSec: (n) => set({ motionHoldSec: n }),
    setWaitTimes: (w) => set({ ...w }),
}));

/** 소켓에서 `on` · `off` 만 쓴다 — 검사가 가짜 소켓을 넣는다 */
type SettingsSocket = { on(ev: 'settings-updated', h: () => void): unknown; off(ev: 'settings-updated', h: () => void): unknown };

/**
 * 📡 **설정 바뀜을 듣고 다시 읽는다** — 설정창 · 다른 창에서 저장하면 서버가 `settings-updated` 를 보낸다(`routes/settings.ts`).
 *    신호에는 기사님이 넣은 값만 실리고 서버가 찾은 집 좌표는 없어서, 실린 값을 쓰지 않고 `/settings` 를 다시 읽는다.
 *    돌려주는 함수로 끊는다.
 */
export function followSettingsUpdates(socket: SettingsSocket): () => void {
    const onUpdated = () => { void loadScreenSettings(true); };
    socket.on('settings-updated', onUpdated);   // audit:socket 이 `socket.on(` 글자로 듣는 곳을 센다 — 인자 이름을 socket 으로 둔다
    return () => { socket.off('settings-updated', onUpdated); };
}
let subscribed = false;

/**
 * 📡 **서버 값을 읽어 온다 — `/settings` 를 읽는 곳은 여기 하나다** (화면마다 따로 읽으면 저장 뒤 어떤 화면은 옛 값).
 *    처음 부를 때 «설정 바뀜» 듣기도 한 번 건다. `force` 가 아니면 이미 읽은 뒤에는 다시 묻지 않는다.
 */
export async function loadScreenSettings(force = false): Promise<void> {
    if (!subscribed) { subscribed = true; followSettingsUpdates(socket); }
    if (!force && useSettingsStore.getState().loaded) return;
    try {
        const { data } = await apiClient.get('/settings');
        useSettingsStore.setState({
            vehicleType: data?.vehicleType ?? null,
            defaultPriority: data?.defaultPriority ?? null,
            homeAddress: data?.homeAddress ?? null,
            homeX: data?.homeX ?? null,
            homeY: data?.homeY ?? null,
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
