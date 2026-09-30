import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📅 **예약콜 축 — 필터 칸 하나** (reviews/23 1단계 ① · 기사님 결정 «오늘 콜만»).
 *
 * 값 셋(`today` 오늘 콜만 · `tomorrowToo` 내일 콜도 · `tomorrowOnly` 내일 콜만) 가운데 지금은 `today` 하나만 쓴다 —
 * 내일 콜을 받을 그릇(예약 보관)이 서기 전에는 고를 수 없다. 읽는 곳은 원달앱 1차 필터 하나다.
 * 🔴 `FILTER_FIELDS`(슬라이더 표)에 넣지 않고 `route_mode` 처럼 따로 둔다 — 고르는 칸이 슬라이더로 서면 안 된다.
 * 🔴 저장·읽기가 둘 다 있어야 한다 — 하나가 빠지면 💾 가 안 남거나 재접속에 풀린다.
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(p, 'utf8');

describe('📅 예약콜 필터 칸', () => {
    it('user_filters 에 칸이 선다 — 기본 오늘 콜만', () => {
        expect(read(join(SRC, 'db.ts'))).toContain(`reservation_mode: "TEXT DEFAULT 'today'"`);
    });

    it('💾 저장과 재접속 읽기가 짝이다 — NULL(옛 행)은 오늘 콜만', () => {
        const fm = read(join(SRC, 'state/filterManager.ts'));
        expect(fm).toMatch(/route_mode = \?,\s*reservation_mode = \?/);
        expect(fm).toContain("b.reservationMode ?? 'today',");
        expect(read(join(SRC, 'state/userSessionStore.ts'))).toContain("reservationMode: filterRow.reservation_mode ?? 'today',");
    });

    it('shared 필터 타입에 값 셋이 있다', () => {
        const s = read(join(__dirname, '../../../shared/src/index.ts'));
        expect(s).toContain("export type ReservationMode = 'today' | 'tomorrowToo' | 'tomorrowOnly';");
        expect(s).toMatch(/reservationMode\?: ReservationMode;/);
    });

    it('관제웹 «어떤 콜» 칸에서 세 값을 고른다 — 예약 보관이 섰으니 연다 (reviews/23 B-4)', () => {
        const modal = read(join(__dirname, '../../../client-app/src/components/dashboard/OrderFilterModal.tsx'));
        expect(modal).toContain("RESERVATION_PICKS");
        for (const v of ["'today'", "'tomorrowToo'", "'tomorrowOnly'"]) expect(modal).toContain(v);
        expect(modal).toContain('updateFilter({ reservationMode: v })');
    });

    it('🔴 «오늘 값» 네 자리가 예약콜을 안다 — 저장 안 함 판단 · 되돌리기 · 💾 저장 (하나라도 빠지면 거짓말하거나 자정에 풀린다)', () => {
        const modal = read(join(__dirname, '../../../client-app/src/components/dashboard/OrderFilterModal.tsx'));
        expect(modal).toContain("if ((filter?.reservationMode ?? 'today') !== (baseFilter.reservationMode ?? 'today')) return true;");
        expect(modal).toContain("reservationMode: baseFilter.reservationMode ?? 'today',");
        expect(modal).toContain("reservationMode: filter?.reservationMode ?? 'today',");
    });
});

describe('📅 탈락 이유 «reservation» — 셋이 같은 낱말', () => {
    it('필터 성적표(shared) · 버린 콜 이유 글자 · 성적표 요약 축이 «reservation» 을 안다', () => {
        const s = read(join(__dirname, '../../../shared/src/index.ts'));
        const tally = s.slice(s.indexOf('export interface FilterTally'), s.indexOf('}', s.indexOf('export interface FilterTally')));
        expect(tally).toMatch(/reservation\?: number;/);
        const client = (p: string) => read(join(__dirname, '../../../client-app/src', p));
        expect(client('statusboard/callVerdict.ts')).toMatch(/reservation: '예약/);
        expect(client('lib/filterTally.ts')).toContain("['예약', 'reservation']");
    });
});
