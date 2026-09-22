import { describe, it, expect } from 'vitest';
import { buildKakaoNaviUrl, type NaviStop } from './index';

/**
 * 🧭 **카카오내비 링크 — QR 안에 들어가는 글자 한 줄**
 *
 * 기사님 폰에서 실측으로 알아낸 것들을 여기서 잠근다. **문서에 없는 값들이라
 * 코드가 되돌아가면 아무도 모른다** — QR 은 그냥 네모라 화면으로는 안 보인다.
 *
 * 🔴 **틀린 이름을 보내도 에러가 안 난다.** 경유지만 조용히 사라지고 멀쩡해 보이는
 *    경로가 나온다 (실측: `viaPoints` 로 보내니 마커가 없어졌다).
 *    **이 검사가 유일한 방어다.**
 */
const KEY = 'testkey0000000000000000000000000';
const ORG = 'https://1dal.altari.com';
/** 09-03 실제 정거장 — geocode_cache 실측값 */
const chowol: NaviStop = { name: '초월읍', x: 127.298238, y: 37.374409 };
const yeosu:  NaviStop = { name: '여수동', x: 127.122541, y: 37.422620 };

/** URL 안의 `param` JSON 을 도로 꺼낸다 */
function paramOf(url: string): any {
    const m = url.match(/[?&]param=([^&]+)/);
    return m ? JSON.parse(decodeURIComponent(m[1])) : null;
}

describe('🧭 카카오내비 링크', () => {
    it('스킴과 필수 칸이 실린다', () => {
        const url = buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!;
        expect(url.startsWith('kakaonavi-sdk://navigate?')).toBe(true);
        expect(url).toContain(`appkey=${KEY}`);
        expect(url).toContain('apiver=1.0');
    });

    /**
     * 🔴 **기본이 `katec` 이다.** 안 넣으면 우리 wgs84 좌표를 katec 으로 읽어
     *    **조용히 엉뚱한 데로 안내한다** (공식 레퍼런스).
     */
    it('coord_type 이 반드시 wgs84 로 실린다', () => {
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!);
        expect(p.option.coord_type).toBe('wgs84');
    });

    /**
     * 🔴 **좌표를 뒤집지 않는다.** 같은 파일의 `kakaomap://` 은 «위도,경도»로 뒤집는데
     *    카카오내비는 JSON `x`=경도 `y`=위도 — **우리 DB 차례 그대로**다.
     *    한 파일에 반대 규칙 둘이 살아서 섞이기 쉽다.
     */
    it('좌표를 안 뒤집는다 — x 는 경도, y 는 위도', () => {
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!);
        expect(p.destination.x).toBe(127.298238);   // 경도
        expect(p.destination.y).toBe(37.374409);    // 위도
    });

    it('이름이 실린다 — 카카오내비는 좌표만으로 안 된다', () => {
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!);
        expect(p.destination.name).toBe('초월읍');
    });

    it('출처(origin)가 extras 에 실린다 — 콘솔에 등록한 주소와 같아야 한다', () => {
        const url = buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!;
        const m = url.match(/[?&]extras=([^&]+)/)!;
        expect(decodeURIComponent(m[1])).toContain(`origin/${ORG}`);
    });

    /**
     * 🔴 **실측으로만 알아낸 것** (기사님 폰):
     *    `via_list` 는 「경유 1」 마커가 찍히고, `viaPoints` 는 **조용히 무시된다.**
     */
    it('🔴 경유지는 via_list 라는 이름으로 나간다 (viaPoints 가 아니다)', () => {
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: yeosu, via: [chowol] })!);
        expect(p.via_list).toEqual([{ name: '초월읍', x: 127.298238, y: 37.374409 }]);
        expect(p.viaPoints).toBeUndefined();
    });

    /** 🔴 우리는 «다음 한 곳»만 보낸다 — 경유지를 안 쓰는 것이 기본이다 */
    it('경유지를 안 주면 via_list 칸이 아예 없다', () => {
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol })!);
        expect('via_list' in p).toBe(false);
    });

    /** ⚠️ 카카오내비 한도는 3개다 — 넘으면 앞에서 끊는다 */
    it('경유지가 3개를 넘으면 앞에서 끊는다', () => {
        const many = [1, 2, 3, 4, 5].map(i => ({ name: `${i}`, x: 127 + i / 100, y: 37 + i / 100 }));
        const p = paramOf(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: chowol, via: many })!);
        expect(p.via_list).toHaveLength(3);
        expect(p.via_list[0].name).toBe('1');
    });

    /** 🔴 못 만들면 «없다»가 낫다 — 깨진 QR 을 띄우느니 버튼을 안 보이게 (규칙 ④) */
    it('키가 없으면 안 만든다', () => {
        expect(buildKakaoNaviUrl({ key: '', origin: ORG, dest: chowol })).toBeNull();
    });
    it('이름이 비면 안 만든다', () => {
        expect(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: { name: '', x: 127, y: 37 } })).toBeNull();
    });
    it('좌표가 숫자가 아니면 안 만든다', () => {
        expect(buildKakaoNaviUrl({ key: KEY, origin: ORG, dest: { name: 'x', x: NaN, y: 37 } })).toBeNull();
    });
});

/**
 * 🔴 **`via` 를 넘겼는데 안 받는 일이 실제로 났다**.
 *
 * 목업이 `{...qrArgs}` 로 펼쳐 넘겼는데 받는 쪽 `Props` 에 `via` 가 없었다.
 * **펼침 연산자는 남는 칸을 타입 검사가 안 잡는다** — 컴파일은 통과하고
 * **경유지만 조용히 사라졌을** 것이다. `via_list` 를 틀린 이름으로 보낸 것과 같은 병이다.
 */
describe('🧭 경유지를 넘기면 실제로 실린다 — 조용히 사라지지 않는다', () => {
    const yeosu2: NaviStop = { name: '여수동', x: 127.122541, y: 37.422620 };
    const seoksu: NaviStop = { name: '석수동', x: 126.904770, y: 37.429537 };
    const gasan:  NaviStop = { name: '가산동', x: 126.883619, y: 37.468967 };

    it('경유 3개 + 도착 1 = 네 곳이 한 URL 에 담긴다', () => {
        const url = buildKakaoNaviUrl({
            key: KEY, origin: ORG, dest: gasan, via: [chowol, yeosu2, seoksu],
        })!;
        const m = url.match(/[?&]param=([^&]+)/)!;
        const p = JSON.parse(decodeURIComponent(m[1]));
        expect(p.via_list.map((v: any) => v.name)).toEqual(['초월읍', '여수동', '석수동']);
        expect(p.destination.name).toBe('가산동');
    });

    /** ⚠️ QR 이 촘촘해지면 카메라가 못 읽는다 — 길이를 눈으로 재 둔다 */
    it('네 곳을 담아도 QR 이 읽히는 길이다 (오류정정 L 한도 ~2,900자)', () => {
        const url = buildKakaoNaviUrl({
            key: KEY, origin: ORG, dest: gasan, via: [chowol, yeosu2, seoksu],
        })!;
        expect(url.length).toBeLessThan(1200);
    });
});
