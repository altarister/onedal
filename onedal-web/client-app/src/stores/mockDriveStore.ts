import { create } from 'zustand';
import { DWELL_TICKS, APPROACH_KM, type DriveDial } from '../hooks/simStep';

/**
 * 🎭 **모의 주행 — 손으로 켜고 끈다** (기사님 확정 2026-09-12).
 *
 * 기사님: *"경로가 생기면 현황판도 알게 될 거고 그때 **버튼을 활성화해서 클릭**하도록
 * 하면 될 듯 싶은데?"* · *"이건 그냥 **테스트용** 모의 주행이야 —
 * 라이브에서는 폰의 GPS를 쓸 거야."*
 *
 * 🔴 **예전엔 저절로 시작했다** — 개발빌드 + 출발 + 경로 + 실 GPS 15초 부재면 자동.
 *    끄는 길이 없어 «그만 보고 싶은데 계속 도는» 상태가 됐고, 속도는 주소창 `?speed=` 뿐이라
 *    운전석에서는 손댈 수가 없었다. 이제 **버튼이 주인**이다.
 *
 * 🔴 **테스트용이라 서버까지 GPS 를 보낸다.** 폰 GPS 자리를 대신하는 것이니 그것이 하던 일
 *    (도착 감지·마일스톤·경로 갱신·궤적)을 그대로 밟아야 «잘 되는가»를 볼 수 있다.
 *    라이브 차단은 `useMasterGps` 의 `import.meta.env.DEV` 게이트 그대로다.
 *
 * ⚠️ **목업의 «모의 시계»는 안 가져왔다** (기사님께 밝히고 뺐다). 목업 주행은 서버를
 *    안 밟기 때문에 시각을 앞당겨도 되지만, 서버를 밟는 이 주행에 넣으면 **화면 시각과
 *    서버 시각이 갈라져** 약속·상차버퍼가 전부 어긋난다.
 *
 * 🔴 **여기에 계산을 넣지 않는다.** 스위치와 눈금만 든다 — 좌표를 만드는 것은
 *    `simStep`(순수 함수), 서버로 보내는 것은 `gpsBridge.publishLocation` 하나다 (규칙 ③).
 */
interface MockDriveState {
    /**
     * 🔘 **버튼을 켤 수 있는가** — 관제웹이 올린다 (`useMasterGps`).
     *    개발 빌드이고 **경로가 있을 때**만 참이다. 현황판은 이 값만 보고 버튼을 활성화하면 된다 —
     *    «경로가 있나»를 제 손으로 다시 보면 두 곳이 다른 답을 낸다 (규칙 ③).
     */
    available: boolean;
    /** ▶️ 지금 도는가 */
    running: boolean;
    /**
     * 🐢🚗🚀 **배속** — 순항 걸음에만 곱한다. 정거장 정차(기본 12초)는 **실초로 지킨다**
     *    (`simStep` 주석: 정차 감지가 실제로 발화할 시간을 주려는 것이라 줄이면 뜻이 없다).
     */
    speed: number;

    /**
     * 🎭 **연기 눈금 — 시뮬이 «어떻게 달리는가»** (기사님 지시 2026-09-12:
     *    *"모의 주행의 정차시간, 서행하는 거 오른쪽 어드민에서 설정하면 좋겠는데"*).
     *
     * 🔴 **브라우저에만 산다**(localStorage). 개발 빌드에서만 도는 **시험 도구의 눈금**이라
     *    DB 까지 갈 값이 아니다 — 넣으면 라이브 스키마에 시험용 칸이 남는다 (기사님 확정).
     *    ⚠️ 「주행·정차로 굳는 시간」(`user_settings.motion_hold_sec`)과 **다른 층이다** —
     *       저것은 실운행에서도 쓰는 **제품 규칙**이라 DB 에 산다 (규칙 ⑤-4 ⑤).
     */
    /** ⏸️ 정거장에서 서 있는 **실초** — 배속을 곱하지 않는다 */
    dwellSec: number;
    /** 🐢 이 반경(km) 안에 들면 서행한다 */
    approachKm: number;
    /** 🐢 서행할 때 걸음을 몇 분의 일로 — 4 면 ¼ */
    slowFactor: number;

    setAvailable: (v: boolean) => void;
    start: () => void;
    stop: () => void;
    setSpeed: (n: number) => void;
    setDwellSec: (n: number) => void;
    setApproachKm: (n: number) => void;
    setSlowFactor: (n: number) => void;
}

/**
 * 🎭 **연기 눈금의 기본값** — 지금까지 코드에 박혀 있던 수 그대로다.
 *
 * ⚠️ **정차를 11초 아래로 줄이면 정차 규칙을 못 본다** — 그 시간은 «5km/h↓ 가 이어져야 정차»가
 *    실제로 발화할 길이를 주려는 것이다. 줄이려면 「굳는 시간」(⚙️ 설정)도 함께 줄여야 한다.
 */
/* 🔄 «지금까지 코드에 박혀 있던 수»에서 정차만 18 → 12 로 내렸다 (2026-09-15 · `DWELL_TICKS`) */
export const MOCK_DRIVE_DEFAULTS: DriveDial = { dwellSec: DWELL_TICKS, approachKm: APPROACH_KM, slowFactor: 4 };

/** 💾 브라우저에 남긴다 — 판을 새로 열어도 맞춰 둔 눈금이 그대로다 */
const LS_KEY = 'mockDriveDial';
const loadDial = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        const num = (v: unknown, lo: number, hi: number, dft: number) =>
            typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : dft;
        return {
            dwellSec: num(raw.dwellSec, 0, 120, MOCK_DRIVE_DEFAULTS.dwellSec),
            approachKm: num(raw.approachKm, 0, 20, MOCK_DRIVE_DEFAULTS.approachKm),
            slowFactor: num(raw.slowFactor, 1, 20, MOCK_DRIVE_DEFAULTS.slowFactor),
        };
    } catch { return { ...MOCK_DRIVE_DEFAULTS }; }
};
const saveDial = (d: { dwellSec: number; approachKm: number; slowFactor: number }) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* 사생활 모드 등 — 화면은 그대로 돈다 */ }
};

/** 🐢🚗🚀 **속도 셋** — 목업과 같은 세 단 (`MapMockup.tsx` 의 `SPEEDS`) */
export const MOCK_DRIVE_SPEEDS = [
    { label: '🐢 느림', value: 1 },
    { label: '🚗 보통', value: 3 },
    { label: '🚀 빠름', value: 15 },
] as const;
/* 🐢🚗🚀 2026-09-15 여섯 번째 바퀴 기사님 «정차가 너무 길고 속도가 너무 빠르다» → 보통을 15 → 3배(≈1,080km/h · 이천 30km 를 1분 40초)로.
   정차는 기본 12초로 함께 내렸다(`DWELL_TICKS`) — 모의 좌표의 도착은 500m 안이면 곧바로라(`evaluateArrivalTick`) 정차가 도착을 막지 않는다. 옛 빠름(15)은 🚀 로 남겼다. */

/** 🐢🐇 주소창 `?speed=` 는 **첫값으로만** 산다 — 그 뒤로는 버튼이 정한다 (옛 길을 안 끊는다) */
const initialSpeed = (): number => {
    try {
        const n = Number(new URLSearchParams(window.location.search).get('speed'));
        return Number.isFinite(n) && n >= 1 && n <= 300 ? n : 3;
    } catch { return 3; }
};

export const useMockDriveStore = create<MockDriveState>((set) => ({
    available: false,
    running: false,
    speed: initialSpeed(),

    /**
     * 🔴 **켤 수 없게 돼도 기사님이 켠 것(`running`)은 지우지 않는다**.
     *    2026-09-15 02:03:28 하차가 끝나 경로가 잠깐 0점이 되자 여기서 `running` 까지 꺼져, 경로가 3초 뒤 돌아와도 차가 섰다.
     *    엉뚱한 좌표는 `useMasterGps` 의 `useMock = canMock && running` 이 막는다 — 경로가 없는 틈에는 안 달리고,
     *    돌아오면 서 있던 자리에서 가장 가까운 점부터 이어 달린다. 🔴 **끄는 것은 기사님뿐이다** — 경로 끝에서도 안 끄고 그 자리에서 대기한다 (#133 개정).
     */
    setAvailable: (v) => set({ available: v }),
    start: () => set(s => (s.available ? { running: true } : s)),
    stop: () => set({ running: false }),
    setSpeed: (n) => set({ speed: n }),

    ...loadDial(),
    /* 🔴 고치면 **그 자리에서** 남긴다 — 「저장」 버튼을 따로 두지 않는다 (눈금은 돌리는 것이다) */
    setDwellSec: (n) => set(s => { const d = { ...dialOf(s), dwellSec: n }; saveDial(d); return d; }),
    setApproachKm: (n) => set(s => { const d = { ...dialOf(s), approachKm: n }; saveDial(d); return d; }),
    setSlowFactor: (n) => set(s => { const d = { ...dialOf(s), slowFactor: n }; saveDial(d); return d; }),
}));

/** 🎭 상태에서 «눈금 셋»만 추린다 — 저장할 때 다른 것이 섞이지 않게 */
function dialOf(s: MockDriveState) {
    return { dwellSec: s.dwellSec, approachKm: s.approachKm, slowFactor: s.slowFactor };
}
