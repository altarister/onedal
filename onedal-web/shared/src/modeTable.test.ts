import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MODE_TABLE, networkCanAutoContract, otherContractingAuto } from './modeTable';
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

describe('자동은 한 폰만 — 지금 확정을 누를 수 있는 다른 폰이 있나 (reviews/48 가)', () => {
    const now = 1_000_000;
    const phone = (deviceId: string, mode: string, targetApp: string, agoMs = 1000, appliedMode?: string) => ({ deviceId, mode, appliedMode, targetApp, lastSeen: now - agoMs });
    it('배차망 셋의 «자동 확정 있음»이 표에 있다 — 픽커는 없음', () => {
        expect(Object.keys(MODE_TABLE.networks).sort()).toEqual([...TARGET_APPS].sort());
        expect(networkCanAutoContract('kakaopicker')).toBe(false);
        expect(networkCanAutoContract('insung')).toBe(true);
    });
    it('🔴 픽커 폰은 자동 명령이어도 셈하지 않는다 — 계약할 수 없는 폰이 인성 폰을 끌어내리지 않음', () => {
        expect(otherContractingAuto('S23', [phone('A24', 'AUTO', 'kakaopicker'), phone('S23', 'AUTO', 'insung')], now, 150_000)).toBe(false);
    });
    it('🔴 꺼진 폰(마지막 보고가 데드맨 시간 밖)은 셈하지 않는다', () => {
        expect(otherContractingAuto('S23', [phone('OLD', 'AUTO', 'insung', 200_000), phone('S23', 'AUTO', 'insung')], now, 150_000)).toBe(false);
    });
    it('🔴 넘기는 중 — 명령은 알람으로 옮겨졌어도 아직 «자동을 받았다»고 보고한 폰은 셈한다(틈 0)', () => {
        expect(otherContractingAuto('B', [phone('A', 'ALARM', 'insung', 1000, 'AUTO'), phone('B', 'AUTO', 'hwamul24')], now, 150_000)).toBe(true);
        expect(otherContractingAuto('B', [phone('A', 'ALARM', 'insung', 1000, 'ALARM'), phone('B', 'AUTO', 'hwamul24')], now, 150_000)).toBe(false);
    });
    it('살아 있는 계약 가능한 두 폰이 모두 자동이면 서로를 센다(둘 다 알람)', () => {
        const ps = [phone('A', 'AUTO', 'insung'), phone('B', 'AUTO', 'hwamul24')];
        expect(otherContractingAuto('A', ps, now, 150_000)).toBe(true);
        expect(otherContractingAuto('B', ps, now, 150_000)).toBe(true);
    });
});
