import { readFileSync } from 'fs';
import { join } from 'path';
import { BLE_KINDS, BLE_MAX_WRITE, BLE_BREATH_MS, BLE_SILENT_MS, BLE_UUIDS, SUPPLY_EVENTS, SUPPLY_NAMESPACE } from '@onedal/shared';

/**
 * 📶 **관제앱 자바 `BleProtocol.java` = shared `bleProtocol.ts`** (reviews/50 ①-2).
 * 자바는 jest 가 글자로 읽는다 — 한쪽만 고치면 관제앱이 서버 사건을 못 듣거나, 스캔폰과 칸 · 종류 바이트가 갈라져 블루투스로 아무것도 안 간다.
 * 못 잡는 것: 원달앱(코틀린) 쪽 짝(①-3 에서 원달앱 검사가 같은 shared 를 읽는다) · 실제 블루투스로 오가는지(폰 시험).
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
});
