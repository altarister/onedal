import { describe, expect, it } from 'vitest';
import { handBandOf } from './handBand';

/**
 * 🚧 **«손 필요» 띠는 까닭이 그대로인 동안 유지 · 풀리면 지움** (onedal-1f).
 * 서버는 까닭이 바뀔 때만 알림을 보낸다 — 알림 10초로 띠를 끄면 까닭이 그대로여도 다시 안 뜬다.
 * 그래서 띠는 1초마다 오는 기기 상태(`lastOpenBlocked` · 목록 화면 · 통과 수)로 그린다.
 */
const dev = (o: Record<string, unknown>) => ({ deviceId: 'd1', lastSeen: 0, screenContext: 'LIST', filterTally: { seen: 4, passed: 2, vehicle: 0, region: 0 }, ...o }) as any;

describe('🚧 손 필요 띠', () => {
    it('🔴 목록에서 까닭이 «손 필요»면 띠 — 통과 수는 지금 기기 상태', () => {
        expect(handBandOf(dev({ lastOpenBlocked: 'tabBar' }), '픽커 '))
            .toBe('픽커 필터 통과 2건 — 앱이 못 열었습니다: 맨 아래 줄이라 안 누름 — 직접 여십시오');
    });
    it('🔴 까닭이 풀리거나(없음) 곧 풀리는 까닭이면 띠 없음', () => {
        expect(handBandOf(dev({}), '픽커 ')).toBeNull();
        expect(handBandOf(dev({ lastOpenBlocked: 'listMoving' }), '픽커 ')).toBeNull();
    });
    it('🔴 목록이 아니면(상세 등) 띠 없음 — 옛 까닭이 상세 위에 남지 않게', () => {
        expect(handBandOf(dev({ lastOpenBlocked: 'tabBar', screenContext: 'DETAIL_PRE_CONFIRM' }), '픽커 ')).toBeNull();
    });
});
