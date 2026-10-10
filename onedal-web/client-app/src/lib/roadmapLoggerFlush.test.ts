import { describe, it, expect, vi } from 'vitest';
import { logRoadmapEvent } from './roadmapLogger';

/**
 * 📦 **보내는 중이면 새 요청을 출발시키지 않는다 — 한 번에 한 요청** (92판 · 24 리뷰 · 71 «가»).
 * 밀린 줄이 남은 동안 새 줄마다 flush 가 또 출발해 떠 있는 keepalive 합이 64KB 를 넘었다 — 둘째가 거절되고 물러섬이 30초까지 늘었다.
 * 못 잡는 것: 실제 브라우저 keepalive 상한 — 폰(관제앱 · 잠깐 끊은 뒤 서버 «🖥️ [관제웹 …]» 줄이 수 초 안에 다시 쌓임).
 */
describe('📦 한 번에 한 요청', () => {
    it('🔴 보내는 중에 줄이 더 들어와도 요청은 하나 · 풀리면 남은 묶음이 이어서 간다', async () => {
        const pending: Array<() => void> = [];
        const fetchMock = vi.fn(() => new Promise(resolve => { pending.push(() => resolve({ ok: true })); }));
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        for (let i = 0; i < 20; i++) logRoadmapEvent('화면', '웹', `줄 ${i}`);   // 20줄째에 첫 요청 출발
        expect(fetchMock).toHaveBeenCalledTimes(1);
        for (let i = 20; i < 45; i++) logRoadmapEvent('화면', '웹', `줄 ${i}`);   // 보내는 중에 25줄 더
        expect(fetchMock).toHaveBeenCalledTimes(1);
        pending.shift()!();
        await new Promise(r => setTimeout(r, 30));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        vi.unstubAllGlobals();
    });
});
