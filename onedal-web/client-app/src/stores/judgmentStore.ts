import { create } from 'zustand';
import type { JudgmentConfig } from '@onedal/shared';
import { DEFAULT_JUDGMENT } from '@onedal/shared';
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
    /** 서버가 아직 안 보냈는가 (폼을 잠가 둔다) */
    loaded: boolean;
    set: (cfg: JudgmentConfig) => void;
}

export const useJudgmentStore = create<JudgmentState>((set) => ({
    judgment: JSON.parse(JSON.stringify(DEFAULT_JUDGMENT)),
    loaded: false,
    set: (judgment) => set({ judgment, loaded: true }),
}));

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
    socket.on('judgment-updated', apply);
}

/**
 * 바꾼 값을 **한 번에** 서버로 보낸다.
 * 기사님 5번: *"수정을 요청받은 데이터셋은 **한 번에** DB에 넣는다."*
 * → 칸마다 저장하지 않는다. 서버가 트랜잭션 하나로 처리하고 `judgment-updated` 로 확정본을 돌려준다.
 */
export function saveJudgment(cfg: JudgmentConfig): void {
    socket.emit('save-judgment', cfg);
}
