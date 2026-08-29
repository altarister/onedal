import { create } from 'zustand';
import type { JudgmentConfig, CallOption } from '@onedal/shared';
import { DEFAULT_JUDGMENT, derivationInputsOf, dwellRatesOf } from '@onedal/shared';
import { socket } from '../lib/socket';

/**
 * 🎯 **판정 기준** — 서버가 집어 온 콜에 색을 매기는 값.
 *
 * 🔴 **콜 필터(`filterStore`)와 완전히 분리·격리된다.** 기사님 확정(2026-08-16):
 *    *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
 *
 *    | | 🔍 콜 필터 | 🎯 판정 기준 |
 *    |---|---|---|
 *    | 언제 | **앱이** 콜을 집기 **전** | **서버가** 집은 **뒤** |
 *    | 소켓 | `filter-init` · `filter-updated` | `judgment-init` · `judgment-updated` |
 *    | `오늘만` | ✅ 있다 | ❌ **없다** — 바꾸면 계속 적용 |
 *    | 스토어 | `filterStore` | 여기 |
 *
 *    스토어도 소켓 이벤트도 갈라 둔다. 한 페이로드에 태우면 갈라 놓은 의미가 없다.
 */
interface JudgmentState {
    judgment: JudgmentConfig;
    /**
     * 🎛️ **콜 옵션 — 화면의 칩과 그 분(分)** (2026-08-29 이음).
     *    통화 시트가 「수작업 10분」·「검수 60분」이라 그리는 값이 여기서 온다.
     *    🔴 **판정과 같은 표에서 온다** — 두 그릇이면 «화면 10분 / 판정 19분» 이 난다 (#71).
     */
    callOptions: CallOption[];
    /** 서버가 아직 안 보냈는가 (폼을 잠가 둔다) */
    loaded: boolean;
    set: (cfg: JudgmentConfig) => void;
    setOptions: (o: CallOption[]) => void;
}

export const useJudgmentStore = create<JudgmentState>((set) => ({
    judgment: JSON.parse(JSON.stringify(DEFAULT_JUDGMENT)),
    callOptions: [],
    loaded: false,
    set: (judgment) => set({ judgment, loaded: true }),
    setOptions: (callOptions) => set({ callOptions }),
}));

/**
 * ⏱️ **정차 값을 만드는 곳은 여기 하나다** (규칙 ③).
 *    화면 컴포넌트가 각자 `derivationInputsOf` 를 부르면 **콜 옵션을 빠뜨리기 쉽다** —
 *    2026-08-29 에 통화 시트가 정확히 그래서 판정과 갈렸다 (#71).
 */
export function useDerivation() {
    const judgment = useJudgmentStore(st => st.judgment);
    const options = useJudgmentStore(st => st.callOptions);
    return derivationInputsOf(judgment, dwellRatesOf(options));
}

/**
 * 🔴 **구독은 앱 전체에서 단 한 번.**
 *
 * 2026-08-14 에 `useFilterConfig` 를 부르는 컴포넌트가 5개였고 **훅마다 `socket.on` 을 걸어**
 * 서버가 1번 보낸 것을 관제웹이 **5번 처리**했다. 같은 실수를 여기서 되풀이하지 않는다.
 * (`filterStore.ensureFilterSocketSubscribed` 와 같은 방식)
 */
let subscribed = false;

export function ensureJudgmentSocketSubscribed(): void {
    if (subscribed) return;
    subscribed = true;

    const apply = (cfg: JudgmentConfig) => useJudgmentStore.getState().set(cfg);
    socket.on('judgment-init', apply);
    socket.on('call-options-init', (o: CallOption[]) => useJudgmentStore.getState().setOptions(o));
    socket.on('judgment-updated', apply);

    /**
     * 🔴 **서버의 첫 `judgment-init` 을 놓쳤을 수 있다.**
     *
     * 서버는 **소켓 접속 순간**에 한 번 보낸다. 그런데 이 구독은 기사님이
     * ⚙️ 설정 → 「판정 기준」 탭을 **여는 순간** 시작될 수도 있다 — 그러면 이미 지나갔고,
     * `loaded` 가 false 라 폼이 잠긴 채로 남는다 (2026-08-16 에 실제로 그랬다).
     *
     * 그래서 **아직 못 받았으면 달라고 한다.** 콜 필터의 `request-filter-init` 과 같은 방식이다.
     * 재접속에도 안전하다 — `connect` 마다 다시 물어본다.
     */
    const askIfEmpty = () => {
        if (!useJudgmentStore.getState().loaded) socket.emit('request-judgment');
    };
    askIfEmpty();
    socket.on('connect', askIfEmpty);
}

/**
 * 바꾼 값을 **한 번에** 서버로 보낸다.
 * 기사님 5번: *"수정을 요청받은 데이터셋은 **한 번에** DB에 넣는다."*
 * → 칸마다 저장하지 않는다. 서버가 트랜잭션 하나로 처리하고 `judgment-updated` 로 확정본을 돌려준다.
 */
export function saveJudgment(cfg: JudgmentConfig): void {
    socket.emit('save-judgment', cfg);
}

/**
 * 🎛️ **콜 옵션을 고쳐 저장한다** — 화면의 칩에 붙는 분(分).
 *
 * 🔴 **서버가 셋을 한 번에 한다** — ① DB ② **기억 버리기** ③ 세션·화면 갱신.
 *    ②를 빠뜨리면 화면만 새 값이 되고 **판정은 옛 값을 계속 쓴다** (버그 대장 #71 클래스).
 *    그래서 여기서는 낙관적으로 미리 바꾸지 않는다 — 서버가 `call-options-init` 로
 *    되돌려 주는 것을 받는다. 그래야 **화면이 곧 서버의 값**이다.
 */
export function saveCallOptions(changed: CallOption[]): void {
    socket.emit('save-call-options', changed);
}
