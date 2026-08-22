import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👁️ **필터가 왜 하나도 안 잡는지 화면이 말해 준다** (기사님 확정 2026-08-23)
 *
 * 기사님: *"앱에서 리스트는 돌아가고 있는데 관제웹에서는 **필터링이 잘되고 있는 건지
 * 알 수가 없어서** 답답하더라구. 지금은 16개 중 무조건 들어온다는 걸 알지만
 * **나중에 실전에서는 그렇지 못해서** 그래."*
 *
 * `수집:13` 은 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 안 말한다.
 * 그래서 기사님이 매번 물으셔야 했고, 답은 로그를 열어야만 있었다.
 *
 * 🔴 **앱은 이미 답을 알고 있다.** 매 스캔마다 축별로 판정한다:
 *
 *     🔍 차종=✅ 도착지(342중 진위면)=❌ 요금=✅ 상차지=✅ 블랙=✅
 *
 * 그 숫자가 서버로 안 올라올 뿐이다. 올리면 화면이 이렇게 말할 수 있다:
 *
 *     👁️ 방금 본 8건 → 통과 0 · 도착지 5 · 차종 2 · 요금 1
 *
 * *"도착지에서 5개"* 면 경유 반경을 넓힐 때고, *"요금에서만"* 이면 콜할인율을 만질 때다.
 *
 * ⚠️ **누적이 아니라 마지막 스캔의 스냅샷**이다. 누적은 *"어제부터 300개 떨어짐"* 이라
 *    지금 상태를 못 알려 준다. 질문은 *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 다.
 *
 * ⚠️ **한 콜은 첫 번째로 걸린 축에만 센다.** 여러 축에 걸린 콜을 다 세면 합이 본 수를
 *    넘고, *"이 축을 풀면 몇 개가 들어오나"* 를 못 읽는다 — 그게 이 숫자의 쓸모다.
 *
 * 🔴 **숨은 상태로 만들지 않는다.** 파서가 자기 안에 마지막 결과를 들고 있으면 언제
 *    갱신되는지가 호출 순서에 달린다. 호출자가 **그릇을 만들어 넘기고** 파서는 채우기만 한다.
 */

const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
const srv = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
const shared = () => readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8');
const client = (p: string) => readFileSync(join(__dirname, '../../../client-app/src', p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('👁️ 앱 — 축별로 몇 개가 떨어졌는지 센다', () => {
    it('🔴 담을 그릇이 있다 (본 수 · 통과 수 · 축별 탈락 수)', () => {
        const m = code(app('models/SharedModels.kt'));
        expect(m).toMatch(/class FilterTally/);
        for (const f of ['seen', 'passed', 'vehicle', 'region', 'fare', 'pickup', 'routeOrder']) {
            expect(m).toMatch(new RegExp(`var ${f}\\b`));
        }
    });

    /**
     * 🔴 파서가 자기 안에 들고 있으면 **언제 갱신되는지가 호출 순서에 달린다.**
     *    호출자가 그릇을 넘긴다 — 기본값 null 이라 옛 호출부는 그대로 돈다.
     */
    it('🔴 호출자가 그릇을 넘긴다 (파서가 숨겨 두지 않는다)', () => {
        expect(code(app('core/IScrapParser.kt'))).toMatch(/shouldClick\([^)]*tally[^)]*\)/);
        for (const p of ['plugins/insung/InsungParser.kt', 'plugins/hwamul24/Hwamul24Parser.kt']) {
            expect(code(app(p))).toMatch(/tally/);
        }
    });

    it('🔴 리스트 스캔이 매번 새 그릇으로 센다 (누적하지 않는다)', () => {
        const s = code(app('HijackService.kt'));
        const fn = s.split('private fun handleListScreen')[1]?.split('\n    private fun ')[0] ?? '';
        expect(fn).toMatch(/FilterTally\(\)/);
        expect(fn).toMatch(/shouldClick\(order, *tally\)/);
    });

    it('🔴 그 숫자를 서버로 보낸다 (앱 안에서만 알면 화면은 여전히 모른다)', () => {
        expect(code(app('core/TelemetryManager.kt'))).toMatch(/filterTally/);
        expect(code(app('models/SharedModels.kt'))).toMatch(/filterTally/);
    });
});

describe('👁️ 서버 — 받아서 기기 세션에 둔다', () => {
    it('🔴 기기 세션이 마지막 스캔 결과를 들고 있다', () => {
        expect(code(shared())).toMatch(/filterTally\?:/);
    });

    it('🔴 스크랩이 그 값을 세션에 옮긴다', () => {
        expect(code(srv('routes/scrap.ts')) + code(srv('routes/devices.ts'))).toMatch(/filterTally/);
    });

    /**
     * 🔴 **언제 온 숫자인지가 숫자만큼 중요하다** (기사님 지적 2026-08-23).
     *
     * 기사님: *"`방금 1건 → 통과 0 · 차종 1` 같은 게 나오니까 **멈춰 있는 것 같아.**
     * 보내온 마지막 시간을 쓰는 것이 더 좋을 것 같다."*
     *
     * `방금` 은 **다시 그려져야만 참인 말**이다. 폰이 끊기면 화면이 다시 안 그려지고,
     * 10분 전 숫자가 그대로 `방금` 이라고 적힌 채 남는다 — 문구가 같이 멈춘다.
     */
    it('🔴 언제 온 것인지도 들고 있다 (숫자만 있으면 멈춘 건지 알 수 없다)', () => {
        expect(code(shared())).toMatch(/filterTallyAt\?: *number/);
    });

    /**
     * 🔴 **찍는 시계는 서버 것이다.** 앱이 보낸 시각을 쓰면 폰 시계가 틀어졌을 때
     *    화면이 미래나 과거를 말한다. 서버가 **받은 순간**이 유일하게 확실한 사실이다.
     */
    it('🔴 서버가 받은 순간을 찍는다 — 앱 시계를 믿지 않는다', () => {
        const d = code(srv('routes/devices.ts'));
        expect(d).toMatch(/session\.filterTallyAt = Date\.now\(\)/);
        // 성적표가 실제로 온 스캔에서만 — 하트비트가 시각만 밀어 올리면 옛 숫자가 새것처럼 보인다
        expect(d).toMatch(/if \(filterTally\)[\s\S]{0,120}filterTallyAt/);
    });
});

/**
 * 🔴 **그 숫자의 주어는 "폰"이지 "필터"가 아니다** (기사님 지적 2026-08-23).
 *
 * 처음엔 필터 카드 한복판에 놓았다. 폰이 하나일 땐 맞아 보였지만 기사님이 바로 짚으셨다 —
 * *"이것이 필터에 들어가면 안 될 것 같아. 폰이 2개 이상이어도 상관없는 건가?
 * 1번 폰은 작동하는데 2번 폰은 작동하지 않는다면?"*
 *
 * 필터는 **서버가 만들어 모든 폰에 똑같이 내려보내는 한 벌**이고, 성적표는 **폰마다 다르다.**
 * 한 벌짜리 카드에 폰마다 다른 값을 놓으면 둘 중 하나를 골라야 하는데, 옛 코드는
 * `devices.filter(…).pop()` 으로 **배열 순서상 마지막 폰**을 집었다 —
 * 멀쩡한 1번 폰의 숫자가 멈춘 2번 폰을 가리는 화면이었다.
 */
describe('👁️ 관제웹 — 왜 안 잡는지 한 줄로 말한다 (폰마다)', () => {
    it('🔴 폰 카드가 **자기** 숫자를 그린다 — 주어가 붙는다', () => {
        expect(code(client('components/dashboard/DeviceControlPanel.tsx')))
            .toMatch(/summarizeTally\(\s*device\.filterTally\s*,/);
    });

    it('🔴 숫자 옆에 **언제**가 붙는다 — "방금"이라는 말은 쓰지 않는다', () => {
        const c = code(client('components/dashboard/DeviceControlPanel.tsx'));
        expect(c).toMatch(/device\.filterTallyAt/);
        expect(c).not.toMatch(/방금/);
    });

    it('🔴 필터 카드는 기기별 값을 읽지 않는다 (고르는 순간 화면이 거짓말한다)', () => {
        expect(code(client('components/dashboard/OrderFilterStatus.tsx'))).not.toMatch(/\.filterTally/);
    });
});
