import { readFileSync } from 'fs';
import { join } from 'path';
import { NETWORK_PAGES } from '@onedal/shared';

/**
 * 🚚 **손으로 나열한 차종 목록은 한 벌이다** (실측)
 *
 * 인성 화면은 차종을 한 글자로 쓴다 — 오·다·라·**승**·1t·5t…
 * 앱은 그 토큰을 **기준점**으로 삼아 카드를 묶고 요금을 읽는다.
 *
 * 🔴 **이 파일이 지키는 것은 한 문장이다** — 「`오|다|라…` 를 손으로 적은 자리가 레포에 한 곳뿐이다」.
 *    자리를 세거나 함수 이름을 적으면 그 함수가 옮겨질 때마다 이 검사가 낡는다.
 *
 * 그 목록이 두 벌로 갈라지면 한 쪽에서 «승»이 빠져도 모른다. 카드를 묶는 자리에서 빠지면
 * 그 카드는 그룹이 안 생기고, 그룹이 없으면 파싱 루프를 아예 안 탄다 →
 * **로그가 한 줄도 안 남는다.** 화면엔 떠 있는데 앱에서는 «아무 일도 없음»으로 보인다.
 *
 * 실측: 승용차 콜(문제지 ⑧⑨)이 빠지면 판정도 «요금 못 읽음»도 «이미 본 콜»도 안 남는다.
 * 그 침묵 때문에 원인을 엉뚱한 곳(지문 캐시)에서 찾게 된다.
 *
 * → 목록은 **한 곳** — shared 배차망 정의 표의 인성 `vehicleWords` 다. 원달앱은 gen:pages 로 받은 `InsungPages.vehicleWords` 에서
 *   `VEHICLE_TOKENS` 를 만든다(규칙 ③ · 기사님 «기준은 배차망 · 플러그인으로 맞춘다»).
 */
const PARSER = join(__dirname,
    '../../../../onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt');

describe('차종 토큰 — 목록은 한 벌이다', () => {
    const src = () => readFileSync(PARSER, 'utf8');

    /**
     * 🔴 **원달앱 파서에는 손으로 나열한 토큰이 없다** — 어느 함수가 목록을 따로 나열하든 여기서 걸린다.
     *    변이 검수: 어느 자리든 `Regex("^(오|다|라)$")` 처럼 손으로 쓰면 `literals.length` 가 1 이 되어 이 검사가 문다.
     */
    it('🔴 InsungParser 에 토큰을 손으로 나열한 자리가 없고 · 토큰은 표(InsungPages.vehicleWords)에서 만든다', () => {
        const literals = src().match(/오\|다\|라[^")]*/g) ?? [];
        expect(literals).toEqual([]);
        expect(src()).toMatch(/VEHICLE_TOKENS = InsungPages\.vehicleWords\.keys/);
    });

    it('🔴 그 표에 승(승용차)이 있다', () => {
        expect(NETWORK_PAGES.insung.vehicleWords?.find(w => w.word === '승')?.vehicle).toBe('승용차');
    });

    it('필터 매칭도 승용차를 «승» 으로 본다 (화면 표기와 같아야 한다)', () => {
        expect(src()).toMatch(/"승용차" -> p\.contains\("승"\)/);
    });
});
