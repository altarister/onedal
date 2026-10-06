import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🛑 **관제웹이 없으면 폰에 «자동»을 내려주지 않는다** (reviews/44 1단계 · 표는 shared `modeTable.ts`).
 * 결재할 관제웹이 없으면 원달앱이 자동으로 잡은 콜은 전부 안전취소로 끝난다 — 인성은 그것도 취소 횟수다.
 * 보고 응답의 모드는 «이 기사의 관제웹 소켓이 지금 붙어 있나»를 저장하지 않고 그때그때 읽는다(규칙 ③).
 * 못 잡는 것: 관제웹 탭이 소리 없이 죽은 뒤 소켓이 끊겼다고 서버가 알기까지(socket.io 기본값) · 원달앱이 응답을 받기 전에 정한 확정(원달앱 3단계).
 */
const scrap = readFileSync(join(__dirname, '../../src/routes/scrap.ts'), 'utf8');
const sockets = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');

describe('🛑 관제웹이 없으면 자동을 내려주지 않는다', () => {
    it('🔴 보고 응답 모드에 관제웹 소켓 사실을 넘긴다 — 세션의 activeWebSession', () => {
        expect(scrap).toContain('const webAttached = !!session.activeWebSession;');
        expect(scrap).toContain('mode: modeForPhone(deviceMode, autoLive, webAttached)');
    });

    it('바뀔 때만 한 줄 — 관제웹 때문에 자동을 알람으로 내려준 기기', () => {
        expect(scrap).toContain("slog('통신', `🛑 [관제웹 없음] ${deviceLabelOf(deviceId)} 자동 명령을 알람으로 내려줌 — 결재할 관제웹이 없다`)");
        expect(scrap).toContain("slog('통신', `✅ [관제웹 붙음] ${deviceLabelOf(deviceId)} 자동 그대로`)");
    });

    it('🔴 관제웹 소켓이 끊길 때 같은 창 번호의 살아 있는 탭이 있으면 그 소켓으로 넘긴다(탭 복제) — 없을 때만 비운다', () => {
        expect(sockets).toContain('clientSessionOf(other) === clientSessionId');
        expect(sockets).toContain('session.activeWebSession = twin ? { ...session.activeWebSession, socketId: twin.id } : null;');
    });
});
