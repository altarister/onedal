import { normalizeVehicleType, defaultCargoByVehicle } from '@onedal/shared';

/**
 * 🚚 **배차망은 «톤»으로 적는다 — 판정도 그걸 읽어야 한다**
 *
 * ── 왜 ──
 *
 * 화물24시 파서는 화면 글자를 **원문 그대로** 올린다 (`Hwamul24Parser` 의
 * `(\d+\.?\d*톤)(?:/([가-힣/]+))?` — «2.5톤/윙» · «1톤/카/윙»).
 * 그런데 판정이 쓰는 `normalizeVehicleType` 은 `1t`·`2.5t` 와 줄임말(«승»·«다»)만 알아
 * «톤» 표기를 **못 읽고 `null`** 을 냈다.
 *
 * 🔴 차종을 못 읽으면 **두 기준이 같이 죽는다** —
 *   · 📦 공간: 적재 정원을 몰라 자리를 못 잰다
 *   · ⏰ 약속: 상차 방법을 몰라 정차가 일반값 15분으로 부풀고 «정차 미확인» 딱지가 붙는다
 *     (실측: 다마스 소박스 1개는 4분인데 15분으로 잡힌다 — 합짐 우회가 과대평가된다)
 *
 * ── 어떻게 ──
 *
 * 🔴 **모르는 차종은 그대로 `null`** 이다 (규칙 ④) — 사전에 없는 톤수를 지어내지 않는다.
 *
 * ⚠️ **앱에도 같은 다리가 있다** (`Hwamul24Parser` 의 «크로스 매칭: 서버 1t ↔ 파싱 1톤»).
 *    일부러 둔 두 벌이다 — 앱 쪽은 **서버가 죽어도 콜을 걸러야** 해서 자기 판단을 든다
 *    (루트 README.md 규칙 ③ «앱의 기본값은 예외»).
 */

describe('🚚 «톤» 표기를 읽는다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 화물24시가 올리는 글자 그대로 */
    it('🔴 «2.5톤/윙» 같은 원문을 읽는다', () => {
        expect(normalizeVehicleType('1톤')).toBe('1t');
        expect(normalizeVehicleType('2.5톤/윙')).toBe('2.5t');
        expect(normalizeVehicleType('1톤/카/윙')).toBe('1t');
        expect(normalizeVehicleType('3.5톤/전체')).toBe('3.5t');
    });

    it('큰 차도 읽는다', () => {
        expect(normalizeVehicleType('11톤')).toBe('11t');
        expect(normalizeVehicleType('25톤')).toBe('25t');
    });

    it('띄어쓰기를 봐준다 — 화면은 제각각이다', () => {
        expect(normalizeVehicleType('1 톤')).toBe('1t');
        expect(normalizeVehicleType(' 2.5톤 ')).toBe('2.5t');
    });

    /** 🔴 없는 톤수를 지어내지 않는다 (규칙 ④) */
    it('🔴 사전에 없는 톤수는 못 읽은 것이다 — 가까운 값으로 때우지 않는다', () => {
        expect(normalizeVehicleType('1.5톤')).toBeNull();
        expect(normalizeVehicleType('8톤')).toBeNull();
        expect(normalizeVehicleType('톤')).toBeNull();
        expect(normalizeVehicleType('')).toBeNull();
        expect(normalizeVehicleType(null)).toBeNull();
    });

    it('옛 표기는 그대로 돈다 — 이 판이 아무것도 안 깬다', () => {
        expect(normalizeVehicleType('1t')).toBe('1t');
        expect(normalizeVehicleType('2.5')).toBe('2.5t');
        expect(normalizeVehicleType('승')).toBe('승용차');
        expect(normalizeVehicleType('다마스')).toBe('다마스');
    });

    /** 🔴 이게 고쳐지는 이유 — 두 기준이 같이 살아난다 */
    it('🔴 «톤» 표기로도 적재·상차 방법이 나온다', () => {
        const v = defaultCargoByVehicle('2.5톤/윙');
        expect(v).not.toBeNull();
        expect(v!.handling).toBeTruthy();
        expect(v!.quantity).toBeGreaterThan(0);
        expect(defaultCargoByVehicle('2.5톤/윙')).toEqual(defaultCargoByVehicle('2.5t'));
    });
});
