import { readFileSync } from 'fs';
import { join } from 'path';
import { DEVICE_LINK_ERRORS, BLE_KINDS, BLE_MAX_WRITE, BLE_BREATH_MS, BLE_SILENT_MS, BLE_UUIDS, SUPPLY_EVENTS, SUPPLY_NAMESPACE } from '@onedal/shared';

/**
 * 📶 **관제앱 자바 `BleProtocol.java` = shared `bleProtocol.ts`** (reviews/50 ①-2).
 * 자바는 jest 가 글자로 읽는다 — 한쪽만 고치면 관제앱이 서버 사건을 못 듣거나, 스캔폰과 칸 · 종류 바이트가 갈라져 블루투스로 아무것도 안 간다.
 * 서버가 공급 소켓을 거절하는 글(authSocket · webAccountGate)도 관제앱 `SupplyService.AUTH_REJECTS` 에 다 있어야 한다 — 빠지면 관제앱이 거절된 토큰으로 끝없이 다시 붙는다.
 * 원달앱(코틀린) `BleFrames.kt` 도 같은 값을 쓴다(①-3).
 * 못 잡는 것: 실제 블루투스로 오가는지(폰 시험).
 */
const java = readFileSync(join(__dirname, '../../../client-app/android/app/src/main/java/kr/co/onedal/dashboard/BleProtocol.java'), 'utf8');
const str = (name: string) => java.match(new RegExp(`static final String ${name} = "([^"]+)"`))?.[1];
const uuid = (name: string) => java.match(new RegExp(`static final UUID ${name} = UUID\\.fromString\\("([^"]+)"\\)`))?.[1];
const num = (name: string) => Number(java.match(new RegExp(`static final (?:byte|int|long) ${name} = (\\d+)`))?.[1]);

describe('📶 관제앱 BleProtocol.java = shared bleProtocol.ts', () => {
    it('🔴 공급 소켓 이름공간 · 사건 이름', () => {
        expect(str('SUPPLY_NAMESPACE')).toBe(SUPPLY_NAMESPACE);
        expect(str('EVENT_SUPPLY')).toBe(SUPPLY_EVENTS.supply);
        expect(str('EVENT_DECISION')).toBe(SUPPLY_EVENTS.decision);
        expect(str('EVENT_DECISION_ACK')).toBe(SUPPLY_EVENTS.decisionAck);
        expect(str('EVENT_FOLD')).toBe(SUPPLY_EVENTS.fold);
        expect(str('EVENT_STATUS')).toBe(SUPPLY_EVENTS.status);
    });

    it('🔴 블루투스 서비스 · 칸 셋', () => {
        expect(uuid('SERVICE')).toBe(BLE_UUIDS.service);
        expect(uuid('SMALL')).toBe(BLE_UUIDS.small);
        expect(uuid('BIG')).toBe(BLE_UUIDS.big);
        expect(uuid('NOTIFY')).toBe(BLE_UUIDS.notify);
    });

    it('🔴 종류 바이트 · 한 번 쓰기 · 숨', () => {
        for (const [k, v] of Object.entries(BLE_KINDS)) expect([k, num(k)]).toEqual([k, v]);
        expect(num('MAX_WRITE')).toBe(BLE_MAX_WRITE);
        expect(num('BREATH_MS')).toBe(BLE_BREATH_MS);
        expect(num('SILENT_MS')).toBe(BLE_SILENT_MS);
    });

    it('🔴 서버의 공급 소켓 거절 글이 관제앱 거절 목록에 다 있다', () => {
        const service = readFileSync(join(__dirname, '../../../client-app/android/app/src/main/java/kr/co/onedal/dashboard/SupplyService.java'), 'utf8');
        const rejects = [...(service.match(/AUTH_REJECTS = \{([^}]*)\}/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]);
        const auth = readFileSync(join(__dirname, '../../src/socket/authSocket.ts'), 'utf8');
        const serverRejects = [...auth.matchAll(/new Error\('([^']+)'\)/g)].map(m => m[1]);
        expect(serverRejects.length).toBeGreaterThan(0);
        for (const why of [...serverRejects, DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED]) expect([why, rejects.includes(why)]).toEqual([why, true]);
    });

    it('🔴 원달앱 BleFrames.kt 의 칸 · 종류 바이트 · 한 번 쓰기 · 끊김 시간도 shared 와 같다', () => {
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/core/BleFrames.kt'), 'utf8');
        const kuuid = (name: string) => kt.match(new RegExp(`val ${name}: UUID = UUID\\.fromString\\("([^"]+)"\\)`))?.[1];
        const knum = (name: string) => Number(kt.match(new RegExp(`const val ${name}(?:: Byte)? = (\\d+)`))?.[1]);
        expect(kuuid('SERVICE')).toBe(BLE_UUIDS.service);
        expect(kuuid('SMALL')).toBe(BLE_UUIDS.small);
        expect(kuuid('BIG')).toBe(BLE_UUIDS.big);
        expect(kuuid('NOTIFY')).toBe(BLE_UUIDS.notify);
        for (const [k, v] of Object.entries(BLE_KINDS)) expect([k, knum(k)]).toEqual([k, v]);
        expect(knum('MAX_WRITE')).toBe(BLE_MAX_WRITE);
        expect(Number(kt.match(/const val SILENT_MS = (\d+)L/)?.[1])).toBe(BLE_SILENT_MS);
    });

    it('🔏 주고받기 증명 셈이 관제앱 · 원달앱 같다 — HMAC-SHA256 · 열쇠는 짝 서명 · 16진 앞 32자 · 서명은 공중에 안 보냄', () => {
        const service = readFileSync(join(__dirname, '../../../client-app/android/app/src/main/java/kr/co/onedal/dashboard/SupplyService.java'), 'utf8');
        const kt = readFileSync(join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app/core/BleFrames.kt'), 'utf8');
        expect(service).toContain('javax.crypto.Mac.getInstance("HmacSHA256")');
        expect(service).toContain('return hex.substring(0, 32);');
        expect(kt).toContain('javax.crypto.Mac.getInstance("HmacSHA256")');
        expect(kt).toContain('.take(32)');
        expect(service).not.toContain('optString("sig"');
        // 🔴 두 방향 머리말 — 같으면 HELLO 를 PROOF 로 되비춘다
        expect(service).toContain('mac(sig, "hello|" + l.myNonce)');
        expect(service).toContain('mac(sig, "proof|" + l.helloNonce)');
        expect(kt).toContain('mac(pairSig, "hello|$appNonce")');
        expect(kt).toContain('mac(pairSig, "proof|$phoneNonce")');
    });

    it('🔴 관제앱 서비스는 내려가면 블루투스 일을 다시 하지 않는다 — 검색 · 연결 · 보내기 · 다시 찾기', () => {
        const service = readFileSync(join(__dirname, '../../../client-app/android/app/src/main/java/kr/co/onedal/dashboard/SupplyService.java'), 'utf8');
        const onDestroy = service.slice(service.indexOf('public void onDestroy() {'), service.indexOf('public IBinder onBind('));
        const mark = onDestroy.indexOf('destroyed = true;');
        expect(mark).toBeGreaterThanOrEqual(0);
        expect(mark).toBeLessThan(onDestroy.indexOf('closeLink('));
        expect(onDestroy.indexOf('h.removeCallbacksAndMessages(null);')).toBeGreaterThan(onDestroy.indexOf('closeLink('));
        for (const gate of ['if (destroyed || scanning ||', 'if (destroyed) return;', 'if (destroyed || !l.ready || l.writing || l.gatt == null) return;'])
            expect(service).toContain(gate);
    });
});
