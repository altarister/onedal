import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📱 **관제앱(Capacitor 껍데기)의 안드로이드 설정** — 아무도 안 보던 자리다.
 *
 * 🔴 이 매니페스트는 **손으로 적은 것**인데, `npx cap sync` 나 `android/` 를 다시 만드는 일이 생기면
 *    거기 적어 둔 것이 통째로 기본값으로 돌아간다. 그래서 «있어야 하는 줄»을 여기서 못 박는다.
 * ⚠️ 스캐너 앱(`onedal-app`)의 매니페스트는 다른 파일이다 — `simDriverLocation` · `deviceMode` 가 그쪽을 본다.
 */
const MANIFEST = join(__dirname, '../../../client-app/android/app/src/main/AndroidManifest.xml');
const src = readFileSync(MANIFEST, 'utf8');

describe('📱 관제앱 안드로이드 설정', () => {
    it('🔴 세로로 고정한다 — 거치대에서 폰이 돌면 운전 중에 화면을 다시 잡아야 한다', () => {
        expect(src).toMatch(/android:screenOrientation="portrait"/);
    });

    it('🔴 화면을 켜 두는 권한이 있다 — 주행 중 대시보드가 꺼지면 아무것도 못 본다', () => {
        expect(src).toMatch(/android\.permission\.WAKE_LOCK/);
    });

    /**
     * 📞 전화는 «누르면 바로» 걸려야 한다 — 권한이 빠지면 다이얼러만 열려 **한 번 더** 눌러야 하고,
     *    그 한 번이 운전 중에 손이 가는 일이다. 거는 길은 `DirectCallPlugin` 한 곳.
     */
    it('🔴 바로 걸기 권한과 플러그인 등록이 함께 있다', () => {
        expect(src).toMatch(/android\.permission\.CALL_PHONE/);
        const main = readFileSync(join(__dirname, '../../../client-app/android/app/src/main/java/kr/co/onedal/dashboard/MainActivity.java'), 'utf8');
        expect(main).toMatch(/registerPlugin\(DirectCallPlugin\.class\)/);
    });
});
