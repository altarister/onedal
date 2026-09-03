import { describe, it, expect } from 'vitest';
import { buildKakaoRouteUrl, KAKAO_MAX_VIA } from './index';

/**
 * 🧭 **내비 링크 — 개인 폰으로 보내는 카카오맵 경로** (기사님 기획 2026-08-19 · 확인 2026-09-03)
 *
 * 기사님: *"내비게이션만 볼 내 개인 폰에서 받아서 링크를 클릭해 내비를 작동하려는 기획이야.
 * 그래야 이 폰으로는 관제웹을 계속 트래킹할 수 있으니까."*
 *
 * 폰 셋의 역할이 갈린다 — **A24 스캔 · S23 관제 · 아이폰 내비.**
 * 아이폰에는 **아무것도 안 깐다** — 링크를 누르면 카카오맵이 열린다(iOS 도 같은 스킴).
 *
 * 형식(공식 문서 2026-09-03 확인):
 * ```
 * kakaomap://route?sp=출발위도,출발경도&vp=경유1&vp2=경유2&…&ep=도착위도,도착경도&by=car
 * 경유지는 vp·vp2~vp5 로 최대 5개 · 좌표만으로 된다(이름 불필요)
 * ```
 * 🔴 **좌표 차례가 «위도,경도»다** — 우리 DB 는 x=경도·y=위도라 뒤집어 넣어야 한다.
 *    섞으면 엉뚱한 나라로 안내한다.
 */
describe('🧭 카카오맵 경로 링크', () => {
    const pt = (x: number, y: number) => ({ x, y });

    it('경유지가 없으면 출발·도착만 — by=car', () => {
        const url = buildKakaoRouteUrl(pt(127.0, 37.5), [pt(126.8, 37.57)]);
        expect(url).toBe('kakaomap://route?sp=37.5,127&ep=37.57,126.8&by=car');
    });

    it('🔴 위도,경도 차례다 — DB 의 x(경도)·y(위도)를 뒤집어 넣는다', () => {
        const url = buildKakaoRouteUrl(pt(127.298238, 37.374409), [pt(126.807692, 37.572971)]);
        expect(url).toContain('sp=37.374409,127.298238');
        expect(url).toContain('ep=37.572971,126.807692');
    });

    it('가운데 pt은 vp·vp2… 로 붙는다 (마지막은 ep)', () => {
        const url = buildKakaoRouteUrl(pt(127.3, 37.37), [
            pt(127.12, 37.42), pt(126.9, 37.43), pt(126.88, 37.47), pt(126.8, 37.57),
        ]);
        expect(url).toContain('vp=37.42,127.12');
        expect(url).toContain('vp2=37.43,126.9');
        expect(url).toContain('vp3=37.47,126.88');
        expect(url).toContain('ep=37.57,126.8');
        expect(url).not.toContain('vp4=');
    });

    it('pt이 없으면 링크를 만들지 않는다 — 빈 경로로 내비를 켜지 않는다 (규칙 ④)', () => {
        expect(buildKakaoRouteUrl(pt(127, 37.5), [])).toBeNull();
    });

    it('출발지를 모르면 만들지 않는다 — 지금 위치 없이 «어디서부터»가 없다', () => {
        expect(buildKakaoRouteUrl(null, [pt(126.8, 37.57)])).toBeNull();
    });

    /**
     * 🔴 카카오 한도는 경유지 **5개**다. 6콜을 실으면 pt이 12곳이라 넘는다.
     *    넘치면 **앞에서부터 끊는다** — 가까운 곳부터 가면 되고, 도착하면 다시 보낸다.
     *    조용히 뒷부분을 버리면 «마지막 pt»이 진짜 도착지가 아니게 되므로,
     *    끊었다는 사실을 함께 돌려준다.
     */
    it('경유지가 5개를 넘으면 앞에서부터 끊고 «끊었다»를 알린다', () => {
        const many = Array.from({ length: 9 }, (_, i) => pt(127 - i * 0.01, 37.5 + i * 0.01));
        const url = buildKakaoRouteUrl(pt(127.1, 37.4), many);
        expect(url).toContain(`vp${KAKAO_MAX_VIA}=`);
        expect(url).not.toContain(`vp${KAKAO_MAX_VIA + 1}=`);
        // 끊은 뒤의 도착지는 **6번째 pt**이다 (경유 5 + 도착 1) — 7번째부터는 안 실린다
        const sixth = many[KAKAO_MAX_VIA];
        expect(url).toContain(`ep=${sixth.y},${sixth.x}`);
        const seventh = many[KAKAO_MAX_VIA + 1];
        expect(url).not.toContain(`${seventh.y},${seventh.x}`);
    });

    it('한도 안이면 «vp» 는 번호 없이 시작한다 (vp1 이 아니다)', () => {
        const url = buildKakaoRouteUrl(pt(127, 37.5), [pt(126.9, 37.5), pt(126.8, 37.5)]);
        expect(url).toContain('vp=37.5,126.9');
        expect(url).not.toContain('vp1=');
    });
});
