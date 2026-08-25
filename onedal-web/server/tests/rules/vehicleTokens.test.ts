import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🚚 **차종 토큰 목록은 한 벌이다** (실측 2026-08-25)
 *
 * 인성 화면은 차종을 한 글자로 쓴다 — 오·다·라·**승**·1t·5t…
 * 앱은 그 토큰을 **닻**으로 삼아 카드를 묶고 요금을 읽는다.
 *
 * 🔴 그 목록이 `InsungParser` 안에 **세 벌** 있었다:
 *      ① 요금 앵커링        `^(오|다|라|승|1t|…)$`
 *      ② 뭉친 텍스트 폴백    `(오|다|라|승|1t|…)\s*(\d+)`
 *      ③ `groupListNodes`   `^(오|다|라|1t|…)$`   ← **승이 빠져 있었다**
 *
 * ①의 주석은 *"두 정규식을 맞춘다"* 고 적혀 있었다 — 세 번째가 있는 줄 몰랐던 것이다.
 *
 * ③은 **카드를 묶는** 자리다. 여기서 빠지면 그 카드는 그룹이 안 생기고, 그룹이 없으면
 * 파싱 루프를 아예 안 탄다 → **로그가 한 줄도 안 남는다.** 화면엔 떠 있는데 앱에서는
 * «아무 일도 없음»으로 보인다.
 *
 * 실측: 문제지 ⑧⑨(승용차)를 세 판 내리 흘렸는데 판정도 «요금 못 읽음»도 «이미 본 콜»도
 * 없었다. 그 침묵 때문에 **지문 캐시를 의심하며 세 판을 버렸다.**
 *
 * → 목록은 **한 곳**에서만 쓴다 (규칙 ③ — 경유 4벌·상태목록 3벌과 같은 클래스).
 */
const PARSER = join(__dirname,
    '../../../../onedal-app/app/src/main/java/com/onedal/app/plugins/insung/InsungParser.kt');

describe('차종 토큰 — 목록은 한 벌이다', () => {
    const src = () => readFileSync(PARSER, 'utf8');

    it('🔴 토큰을 손으로 나열한 자리가 하나뿐이다', () => {
        // 「오|다|라」로 시작하는 나열이 곧 차종 토큰 목록이다
        const literals = src().match(/오\|다\|라[^")]*/g) ?? [];
        expect(literals.length).toBe(1);
    });

    it('🔴 그 목록에 승(승용차)이 있다', () => {
        const literals = src().match(/오\|다\|라[^")]*/g) ?? [];
        expect(literals[0]).toContain('승');
    });

    it('🔴 카드 묶기(groupListNodes)도 같은 목록을 쓴다 — 따로 나열하지 않는다', () => {
        const s = src();
        const fn = s.slice(s.indexOf('override fun groupListNodes'));
        expect(fn).not.toMatch(/오\|다\|라/);              // 자기 목록을 들지 않는다
        expect(fn).toMatch(/VEHICLE_(TOKENS|ONLY)/);       // 공용 목록에서 만든 것을 쓴다
    });

    it('필터 매칭도 승용차를 «승» 으로 본다 (화면 표기와 같아야 한다)', () => {
        expect(src()).toMatch(/"승용차" -> p\.contains\("승"\)/);
    });
});
