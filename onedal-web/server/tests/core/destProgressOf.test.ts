import { readFileSync } from 'fs';
import { join } from 'path';
import { destProgressOf, firstLoadFacts } from '../../src/core/engine/judgeFacts';
import { judge, CRITERIA, DEFAULT_JUDGMENT, cityCenter } from '@onedal/shared';

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🧭 **첫짐의 전진율을 서버가 실어 준다** (docs/기획/실전_콜_판정_설계.md §4-3)
 *
 * 무엇을 막나
 * - 세 점 중 하나가 없을 때 **지어내는 것** — 까닭을 적고 배수 1.0 이 되어야 한다 (규칙 ④ · ⑤-2)
 * - 못 쟀을 때 색이 🔴 가 되는 것 — 목적지를 안 정하셨다고 콜을 떨어뜨리지 않는다
 * - **목적지 반경 안에서 재는 것** — 이미 도착했으니 전진할 것이 없다. 관내콜이 방향으로 깎이면 안 된다
 * - 판정 사실에 전진율이 **안 실리는 것** — 안 실으면 배수가 영영 안 붙는다
 */
const 강남 = cityCenter('서울 강남구');
const 복정동 = { lng: 127.126, lat: 37.462 };     // 성남시 수정구
const 대치4동 = { lng: 127.062, lat: 37.494 };

describe('🧭 세 점이 다 있으면 전진율이 나온다', () => {
    it('🔴 복정동에서 대치4동으로 가면 강남 쪽으로 전진한다 (양수)', () => {
        const r = destProgressOf({ me: { x: 복정동.lng, y: 복정동.lat },
            dropoff: { x: 대치4동.lng, y: 대치4동.lat }, goalCity: '서울 강남구' });
        expect(r.unknownWhy).toBeNull();
        expect(r.ratio!).toBeGreaterThan(0.5);
    });

    it('🔴 거꾸로 가면 음수다', () => {
        const r = destProgressOf({ me: { x: 대치4동.lng, y: 대치4동.lat },
            dropoff: { x: 복정동.lng, y: 복정동.lat }, goalCity: '서울 강남구' });
        expect(r.ratio!).toBeLessThan(0);
    });
});

describe('🧭 못 쟀으면 까닭을 적는다 — 지어내지 않는다', () => {
    const 기본 = { dropoff: { x: 대치4동.lng, y: 대치4동.lat }, goalCity: '서울 강남구' };

    it('내 위치를 모를 때', () => {
        expect(destProgressOf({ ...기본, me: null })).toEqual({ ratio: null, unknownWhy: '내 위치를 모릅니다' });
    });

    it('목적지를 안 정하셨을 때', () => {
        expect(destProgressOf({ ...기본, me: { x: 복정동.lng, y: 복정동.lat }, goalCity: '' }).unknownWhy)
            .toBe('목적지 미설정');
    });

    it('하차지 좌표를 못 구했을 때', () => {
        expect(destProgressOf({ ...기본, me: { x: 복정동.lng, y: 복정동.lat }, dropoff: { x: null, y: null } }).unknownWhy)
            .toBe('하차지 좌표 미확인');
    });

    it('🔴 지도에 없는 시군구일 때 — 예외를 밖으로 던지지 않는다', () => {
        const r = destProgressOf({ ...기본, me: { x: 복정동.lng, y: 복정동.lat }, goalCity: '없는시' });
        expect(r.ratio).toBeNull();
        expect(r.unknownWhy).toContain('목적지 좌표 미확인');
    });

    it('🔴 목적지 반경 안이면 안 잰다 — 이미 도착했다', () => {
        const r = destProgressOf({ ...기본, me: { x: 강남.lng, y: 강남.lat }, destinationRadiusKm: 10 });
        expect(r.ratio).toBeNull();
        expect(r.unknownWhy).toContain('목적지 반경');
    });

    it('상차지와 하차지가 같은 자리일 때', () => {
        expect(destProgressOf({ ...기본, me: { x: 대치4동.lng, y: 대치4동.lat } }).unknownWhy)
            .toBe('상차지와 하차지가 같은 자리입니다');
    });
});

describe('🧭 판정까지 이어진다', () => {
    const 색 = (progress: ReturnType<typeof destProgressOf>) => judge(CRITERIA, firstLoadFacts({
        fare: 12_000, totalMinutes: 65, progress, excludedHits: [], tags: [],
    }), { ...DEFAULT_JUDGMENT, weights: { ...DEFAULT_JUDGMENT.weights, geography: 1 } });

    it('🔴 전진하는 첫짐이 꿀로 올라간다 — 돈만 보면 44점(보통)이다', () => {
        const 전진 = 색(destProgressOf({ me: { x: 복정동.lng, y: 복정동.lat },
            dropoff: { x: 대치4동.lng, y: 대치4동.lat }, goalCity: '서울 강남구' }));
        expect(전진.score!).toBeGreaterThan(44);
        expect(전진.color).toBe('꿀');
    });

    it('🔴 못 쟀으면 돈 점수 그대로이고 색이 🔴 가 아니다', () => {
        const 모름 = 색({ ratio: null, unknownWhy: '목적지 미설정' });
        expect(모름.score).toBe(44);
        expect(모름.color).toBe('보통');
        expect(모름.criteria.find(c => c.key === 'geography')!.outcome.why).toContain('목적지 미설정');
    });

    it('🔴 전진율을 안 넘기면 그 사실이 화면에 적힌다 — 조용히 1.0 이 되지 않는다', () => {
        const 안넘김 = judge(CRITERIA, firstLoadFacts({ fare: 12_000, totalMinutes: 65, excludedHits: [], tags: [] }),
            { ...DEFAULT_JUDGMENT, weights: { ...DEFAULT_JUDGMENT.weights, geography: 1 } });
        expect(안넘김.criteria.find(c => c.key === 'geography')!.outcome.why).toContain('안 넘겼습니다');
    });
});

/**
 * 🔴 **배선이 빠지면 배수가 영영 안 붙는다** — 함수는 멀쩡한데 아무도 안 부르면
 *    첫짐 점수가 조용히 «돈 하나»로 돌아간다. 그건 판정이 틀리는 것이라 여기서 문다.
 */
describe('🧭 첫짐 심사가 전진율을 싣는다 (배선)', () => {
    const ev = codeOnly(readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8'));

    it('🔴 첫짐 판정에 `progress` 를 넘긴다', () => {
        expect(ev).toMatch(/destProgressOf\(\{[\s\S]{0,400}?\}\)/);
        expect(ev).toMatch(/firstLoadFacts\(\{[\s\S]{0,300}?progress,/);
    });

    it('🔴 세 점을 지금 쓰는 자리에서 가져온다 — 따로 계산하지 않는다 (규칙 ③)', () => {
        expect(ev).toMatch(/me:\s*originOf\(session\)/);
        expect(ev).toMatch(/goalCity:\s*goalCityOf\(session, userId\)/);
        expect(ev).toMatch(/dropoff:\s*\{\s*x:\s*securedOrder\.dropoffX,\s*y:\s*securedOrder\.dropoffY\s*\}/);
    });
});
