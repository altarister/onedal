import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODE_TABLE } from './modeTable';
import { modeForPhone } from './allowance';
import { DEVICE_MODES, DEVICE_MODE_LABEL, TARGET_APPS } from './index';

/**
 * 🎛️ **네 모드 표 — 서버 쪽 짝** (reviews/44).
 * 응답이 있는 줄은 서버가 내려주는 모드(`phone`)가 `modeForPhone(명령, 허락, 관제웹)`과 같고, 단추 글자가 `DEVICE_MODE_LABEL` 과 같다.
 * 표 JSON 이 원달앱 검사가 읽을 수 있는 엄격한 JSON 이다.
 * 못 잡는 것: 원달앱이 표대로 도는지(원달앱 `ModeTablePairTest`) · 서버 재시작 뒤 관제웹 소켓이 실제로 언제 다시 붙는지(폰 · 관제웹 시험).
 */
describe('네 모드 표 — 서버 쪽', () => {
    it('🔴 응답이 있는 줄은 서버가 내려주는 모드가 modeForPhone 과 같다 — 관제웹이 없거나 다른 폰도 자동이면 자동만 알람', () => {
        for (const s of MODE_TABLE.situations) {
            expect(s.phone === null, `${s.id} — 응답이 없는 줄만 phone 이 비었다`).toBe(!(s.replied && s.reachable));
            if (!s.phone) continue;
            for (const cmd of DEVICE_MODES) {
                expect(modeForPhone(cmd, s.autoLive, s.webAttached, s.otherAuto), `${s.id} · ${cmd}`).toBe(s.phone[cmd]);
            }
        }
    });

    it('명령 넷 · 배차망 이름 · 단추 글자가 shared 낱말과 같다', () => {
        for (const s of MODE_TABLE.situations) {
            expect(TARGET_APPS, s.id).toContain(s.network);
            expect(Object.keys(s.running).sort(), s.id).toEqual([...DEVICE_MODES].sort());
        }
        expect(Object.keys(MODE_TABLE.acts).sort()).toEqual([...DEVICE_MODES].sort());
        for (const m of DEVICE_MODES) expect(MODE_TABLE.acts[m].label, m).toBe(DEVICE_MODE_LABEL[m]);
    });

    it('«덜 자동»만 — 알람 · 직접 · 체험 명령은 서버 답이 온 뒤 어느 줄에서도 그대로', () => {
        for (const s of MODE_TABLE.situations.filter(x => x.replied)) {
            for (const cmd of ['ALARM', 'MANUAL', 'SIMULATION'] as const) expect(s.running[cmd], `${s.id} · ${cmd}`).toBe(cmd);
            expect(['AUTO', 'ALARM'], s.id).toContain(s.running.AUTO);
        }
    });

    it('원달앱이 읽는 JSON 표시 사이가 엄격한 JSON 이다', () => {
        const ts = readFileSync(join(__dirname, 'modeTable.ts'), 'utf8');
        const body = /\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//.exec(ts)?.[1];
        expect(body, 'JSON 표시 둘').toBeTruthy();
        expect(JSON.parse(body!)).toEqual(MODE_TABLE);
    });
});
