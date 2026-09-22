import { describe, it, expect } from 'vitest';
import { dialEffectOf } from './dialEffect';

/**
 * 🎚️ **눈금을 잘못 두면 «못 보는 것»이 생긴다 — 그런데 화면이 말을 안 했다**.
 *
 * ── 실제로 일어난 일 ──
 * 기사님이 모의 주행 눈금을 **정차 5초**로 두고 한 판을 도셨다. 그 판에서는 «정차» 상태가
 * **구조적으로 한 번도 안 나온다** — 관제웹의 주행/정차 판정이 «5km/h↓ 가 「굳는 시간」만큼
 * 이어져야 정차»라서, 정차 연기가 그보다 짧으면 조건이 성립할 길이 없다.
 * 그런데 화면은 5초를 **조용히 받았다.** 기사님 물음: *"그럼 앞으로 그 설정을 바꾸면 안되는거야?"*
 *
 * 🔴 **이 레포가 여러 번 당한 모양이다** — 「화면이 조용히 거짓말한다」.
 *    답은 «눈금을 잠그는 것»이 아니라 **«무엇을 못 보게 되는지 화면이 말하는 것»**이다
 *    (규칙 ① 콜의 주인은 기사님이다 — 정하는 것은 기사님이고, 사실을 알리는 것이 화면의 일).
 *
 * 🔴 **문턱을 이 파일에 적지 않는다.** 정차가 얼마여야 하는가는 ⚙️ 설정의 「굳는 시간」이
 *    답한다 — 그 값을 **넘겨받아** 견준다. 10 을 박아 두면 기사님이 1초로 바꾼 날
 *    화면이 옛 문턱으로 거짓말한다 (규칙 ③).
 */
const dial = { dwellSec: 12, approachKm: 1, slowFactor: 4, speed: 3, holdSec: 10,
               kmPerTick: 0.1, offRoadKm: 0.7 };

describe('연기 눈금 — 이 눈금으로 무엇을 못 보나', () => {

    /**
     * 🔴 **이 한 건이 이 파일을 만든 이유다** — 기사님이 실제로 두셨던 5초.
     *    정차 연기는 1초에 한 점씩 같은 자리를 내므로 **이어진 길이는 (점 수 − 1)초**다.
     */
    it('🔴 정차가 「굳는 시간」보다 짧으면 «정차를 못 본다»고 말한다', () => {
        const e = dialEffectOf({ ...dial, dwellSec: 5 });
        expect(e.dwellShort).toBe(true);
        expect(e.requiredDwellSec).toBe(11);       // 굳는 시간 10초 → 11초는 돼야 이어진다
    });

    /** ⚠️ **딱 같은 값은 1초가 모자란다** — 12 와 10 처럼 여유가 있을 때만 초록이다 */
    it('⚠️ 정차가 「굳는 시간」과 같으면 아직 모자라다', () => {
        expect(dialEffectOf({ ...dial, dwellSec: 10 }).dwellShort).toBe(true);
        expect(dialEffectOf({ ...dial, dwellSec: 11 }).dwellShort).toBe(false);
    });

    it('기본 눈금(12초)은 경고가 없다', () => {
        expect(dialEffectOf(dial).dwellShort).toBe(false);
    });

    /**
     * 🔴 **문턱은 설정에서 온다** — 「굳는 시간」을 1초로 줄이면 정차 3초도 충분하다.
     *    여기에 10 을 박아 뒀다면 이 검사가 빨간불이 된다.
     */
    it('🔴 「굳는 시간」을 줄이면 문턱도 함께 내려간다 (10 을 박아 두지 않았다)', () => {
        const e = dialEffectOf({ ...dial, dwellSec: 3, holdSec: 1 });
        expect(e.requiredDwellSec).toBe(2);
        expect(e.dwellShort).toBe(false);
    });

    /**
     * 📏 **걸음과 「닿는 거리」는 `simStep` 의 그 식이어야 한다.**
     *    식이 갈리면 «화면이 말하는 걸음»과 «시뮬이 걷는 걸음»이 달라진다 —
     *    그러면 진단 화면이 오진을 늘린다.
     */
    it('한 걸음은 배속에 곱해진다 · 서행은 나눈다', () => {
        const e = dialEffectOf({ ...dial, speed: 15, slowFactor: 4 });
        expect(e.cruiseKm).toBeCloseTo(1.5, 6);
        expect(e.slowKm).toBeCloseTo(0.375, 6);
        expect(e.slows).toBe(true);
    });

    it('서행 반경 0 이나 ÷1 이면 «서행 없음»이다', () => {
        expect(dialEffectOf({ ...dial, approachKm: 0 }).slows).toBe(false);
        expect(dialEffectOf({ ...dial, slowFactor: 1 }).slows).toBe(false);
    });

    /**
     * 🔴 **이탈폭은 배속에 딸려 줄지 않는다** (`simStep` 의 `reach`).
     *    걸음이 이탈폭보다 작아도 **최소한 이탈폭만큼은** 본다 — 물류센터가 도로에서
     *    601m 떨어져 있어 넣은 물리 상수이지 속도의 함수가 아니다.
     */
    it('🔴 닿는 거리 = max(걸음, 이탈폭) + 이탈폭', () => {
        expect(dialEffectOf({ ...dial, speed: 1 }).reachKm).toBeCloseTo(1.4, 6);   // 0.1 → 0.7+0.7
        expect(dialEffectOf({ ...dial, speed: 15 }).reachKm).toBeCloseTo(2.2, 6);  // 1.5 + 0.7
        expect(dialEffectOf({ ...dial, speed: 40 }).reachKm).toBeCloseTo(4.7, 6);  // 4.0 + 0.7
    });
});
