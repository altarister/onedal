import { useSyncExternalStore } from 'react';
import { soundManager } from '../lib/soundManager';

/**
 * SoundManager의 실시간 상태(재생 여부 등)를 구독하는 훅
 */
export function useSoundManager() {
    // React 18 공식 외부 스토어 구독 패턴 적용
    const isRinging = useSyncExternalStore(
        (callback) => soundManager.subscribe(callback),
        () => soundManager.getIsRinging()
    );

    return {
        isRinging,
        stopAll: () => soundManager.stopAll()
    };
}
