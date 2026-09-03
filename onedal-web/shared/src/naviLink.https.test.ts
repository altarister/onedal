import { describe, it, expect } from 'vitest';
import { httpsUpgradeUrl } from './naviLink';

/**
 * 🔒 «위치를 못 읽는다»의 진짜 까닭이 http 일 때, 화면이 **옮겨 갈 곳**을 줄 수 있어야 한다.
 * 2026-09-03 실물: 기사님이 http 로 여셨는데 화면은 «권한을 허용해 주세요»라고만 했다.
 */
describe('httpsUpgradeUrl — http 로 열렸는가', () => {
    it('http 실주소면 https 주소를 준다', () => {
        expect(httpsUpgradeUrl('http://1dal.altari.com/navi'))
            .toBe('https://1dal.altari.com/navi');
    });

    it('이미 https 면 옮길 곳이 없다', () => {
        expect(httpsUpgradeUrl('https://1dal.altari.com/navi')).toBeNull();
    });

    it('localhost 는 http 여도 위치를 주므로 옮기지 않는다', () => {
        expect(httpsUpgradeUrl('http://localhost:3000/navi')).toBeNull();
        expect(httpsUpgradeUrl('http://127.0.0.1:3000/navi')).toBeNull();
    });

    it('포트를 지어내거나 지우지 않는다', () => {
        expect(httpsUpgradeUrl('http://192.168.0.7:3000/navi'))
            .toBe('https://192.168.0.7:3000/navi');
    });

    it('주소가 아니면 null — 터지지 않는다', () => {
        expect(httpsUpgradeUrl('그냥 글자')).toBeNull();
        expect(httpsUpgradeUrl('')).toBeNull();
    });
});
