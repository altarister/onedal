import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📜 **창이 화면보다 크면 손이 안 닿는다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"일단 필터 옵션창에 스크롤부터 넣어야겠다. 입력할 수가 없어."*
 *
 * 라이브에 필터를 넣으려는데 **입력칸에 닿지를 못했다.** 국면 탭이 다섯이라 세로가
 * 길고, 판정 기준 탭에는 그날 「배송 속도」 세 칸이 더 늘었다.
 *
 * ── 왜 스크롤이 안 걸렸나 ──
 * `overflow-y-auto` 는 **이미 있었다.** 두 가지가 빠져 있었다:
 *
 *   ① **창에 높이 제한이 없었다** — 내용만큼 자라니 넘칠 일이 없고, 바깥의
 *      `overflow-hidden` 이 화면 밖으로 나간 부분을 그대로 잘라 냈다
 *   ② **`min-h-0` 이 없었다** — flex 자식은 기본이 `min-height:auto` 라
 *      내용보다 작아지지 않는다. 그래서 `flex-1` 만으로는 스크롤이 안 걸린다
 *
 * 🔴 `dvh` 를 쓴다 — 관제앱은 **폰에서 보는 화면**이라 주소창이 접혔다 펴진다.
 *    `vh` 는 그때 잘린다.
 *
 * ⚠️ 이건 «화면이 조용히 거짓말한다» 의 사촌이다 — 값은 맞는데 **닿을 수가 없다.**
 *    운전 중에는 더더욱 못 만진다 (필드테스트 1회차의 가장 큰 소득).
 */
const SRC = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** 창 하나를 검사한다 — 높이 제한과 «줄어들 수 있는» 스크롤 영역이 둘 다 있어야 한다 */
function expectScrollable(rel: string) {
    const src = read(rel);
    // ① 창이 화면 안에 갇힌다
    expect(src).toMatch(/max-h-\[\d+dvh\]/);
    // ② 스크롤 영역이 flex 안에서 줄어들 수 있다
    expect(src).toMatch(/min-h-0[^"]*overflow-y-auto|overflow-y-auto[^"]*min-h-0/);
}

describe('설정 창은 화면 안에서 스크롤된다', () => {
    it('🔴 필터 옵션 창 — 국면 탭이 다섯이라 제일 길다', () => {
        expectScrollable('components/dashboard/OrderFilterModal.tsx');
    });

    it('🔴 사용자 설정 창 — 판정 기준 탭에 칸이 계속 는다', () => {
        expectScrollable('components/dashboard/SettingsModal.tsx');
    });

    it('🔴 vh 가 아니라 dvh 를 쓴다 — 폰 주소창이 접혔다 펴져도 안 잘린다', () => {
        for (const f of ['components/dashboard/OrderFilterModal.tsx',
                         'components/dashboard/SettingsModal.tsx']) {
            expect(read(f)).not.toMatch(/max-h-\[\d+vh\]/);
        }
    });
});
