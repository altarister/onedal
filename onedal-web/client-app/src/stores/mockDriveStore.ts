import { create } from 'zustand';

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
     * 🐢🚗🚀 **배속** — 순항 걸음에만 곱한다. 정거장 정차 18초는 **실초로 지킨다**
     *    (`simStep` 주석: 정차 감지가 실제로 발화할 시간을 주려는 것이라 줄이면 뜻이 없다).
     */
    speed: number;

    setAvailable: (v: boolean) => void;
    start: () => void;
    stop: () => void;
    setSpeed: (n: number) => void;
}

/** 🐢🚗🚀 **속도 셋** — 목업과 같은 세 단 (`MapMockup.tsx` 의 `SPEEDS`) */
export const MOCK_DRIVE_SPEEDS = [
    { label: '🐢 느림', value: 5 },
    { label: '🚗 보통', value: 15 },
    { label: '🚀 빠름', value: 40 },
] as const;

/** 🐢🐇 주소창 `?speed=` 는 **첫값으로만** 산다 — 그 뒤로는 버튼이 정한다 (옛 길을 안 끊는다) */
const initialSpeed = (): number => {
    try {
        const n = Number(new URLSearchParams(window.location.search).get('speed'));
        return Number.isFinite(n) && n >= 1 && n <= 300 ? n : 15;
    } catch { return 15; }
};

export const useMockDriveStore = create<MockDriveState>((set) => ({
    available: false,
    running: false,
    speed: initialSpeed(),

    /* 🔴 켤 수 없게 되면 **돌던 것도 멈춘다** — 경로가 사라졌는데 계속 달리면 엉뚱한 좌표가 간다 */
    setAvailable: (v) => set(v ? { available: true } : { available: false, running: false }),
    start: () => set(s => (s.available ? { running: true } : s)),
    stop: () => set({ running: false }),
    setSpeed: (n) => set({ speed: n }),
}));
