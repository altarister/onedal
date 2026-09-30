import { describe, expect, it } from 'vitest';
import { deviceLabel } from './deviceLink';

/**
 * 📱 **폰 표시 이름 — 한 곳** (reviews/29 1단계 K · 04 · onedal-1f «가»).
 * 폰 id 가 긴 난수(d-UUID)가 되면 id 조각으로는 어느 폰인지 못 읽는다 — 이름(user_devices.device_name)을 보이고, 없으면 «이름 없는 폰·뒤 4자».
 */
describe('📱 deviceLabel', () => {
    it('🔴 이름이 있으면 이름 · 없으면 «이름 없는 폰·id 뒤 4자»', () => {
        expect(deviceLabel({ deviceName: '앱폰-SM-A245N', deviceId: 'd-6f1c2e7a-0000-4000-8000-00000000abcd' })).toBe('앱폰-SM-A245N');
        expect(deviceLabel({ deviceName: null, deviceId: 'd-6f1c2e7a-0000-4000-8000-00000000abcd' })).toBe('이름 없는 폰·abcd');
        expect(deviceLabel({ deviceName: '  ', deviceId: 'x' })).toBe('이름 없는 폰·x');
    });
});
