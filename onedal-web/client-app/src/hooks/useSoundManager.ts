import { useSyncExternalStore } from 'react';
import { soundManager } from '../lib/soundManager';

/**
 * SoundManager의 실시간 상태(재생 여부 등)를 구독하는 훅
 */
export function useSoundManager() {
    // React 18 공식 외부 스토어 구독 패턴 적용
    const isRinging = useSyncExternalStore(
        (callback) => soundManager.subscribe(callback),
        () => soundManager.getIsRinging(),
        // 노드에서 그려 보는 검사(regionsRender)도 같은 값을 읽는다 — 관제웹 화면에는 변화 없음
        () => soundManager.getIsRinging()
    );

    return {
        isRinging,
        stopAll: () => soundManager.stopAll()
    };
}
