import { describe, it, expect } from 'vitest';
import { screenChangeLines } from './screenChangeLines';

/**
 * 🖥️ **관제웹이 화면 바뀜을 받은 시각을 한 줄로** — 서버 «🖥️ [화면 바뀜]» 시각과 빼서 «서버 → 관제웹» 지연을 잰다.
 * 화면이 바뀐 폰만 · 처음 받은 폰은 직전을 모르니 안 적는다 · 이름은 폰 줄 배지와 같은 이름.
 */
const phone = (screenContext: string, screenPage?: string, screenOverlay?: string, deviceId = 'dev-a24') =>
    ({ deviceId, deviceName: 'A24', status: 'ONLINE', lastSeen: 1, mode: 'ALARM', targetApp: 'kakaopicker',
       screenContext, screenPage, screenOverlay, stats: { polled: 0, grabbed: 0, canceled: 0 } }) as any;

describe('🖥️ 화면 바뀜 받은 줄', () => {
    it('🔴 페이지가 바뀐 폰만 한 줄 — 배지 이름으로', () => {
        const lines = screenChangeLines([phone('LIST', '신규 리스트'), phone('LIST', '신규 리스트', undefined, 'dev-b')],
                                        [phone('NETWORK_MENU', '메뉴'), phone('LIST', '신규 리스트', undefined, 'dev-b')]);
        expect(lines).toEqual(['🟢 [웹 수신] 화면 A24 · 신규 리스트 → 메뉴']);
    });
    it('🔴 같은 화면이면 없다 (lastSeen 만 바뀐 1초 방송)', () => {
        expect(screenChangeLines([phone('LIST', '신규 리스트')], [{ ...phone('LIST', '신규 리스트'), lastSeen: 2 }])).toEqual([]);
    });
    it('🔴 덧칸이 바뀌어도 적는다', () => {
        expect(screenChangeLines([phone('NETWORK_MENU', '메뉴')], [phone('NETWORK_MENU', '메뉴', '정렬 시트')]))
            .toEqual(['🟢 [웹 수신] 화면 A24 · 메뉴 → 메뉴 · 정렬 시트']);
    });
    it('🔴 처음 받은 폰은 안 적는다', () => {
        expect(screenChangeLines([], [phone('LIST', '신규 리스트')])).toEqual([]);
    });
});
