import { describe, it, expect } from 'vitest';
import { pruneExcludedRegions, buildNet, netForGoal, lineZoneOf, quadTesterOf, buildFirstLegDemo, judgeTwoStage, judgeGoals, orderStopsGreedy, orderStopsInsert, cityCenter, dongList, buildLineNet, sggList, sidoList, sidoOf, isRegionExcluded, isWholeRegionExcluded, excludedLabel, mergeGoalNets, isLocalPhase, WAIT_PRESET, NET_SRC, NET_DST, GONJIAM_DROP, DONGWON_DROP, BORAM_DROP, ICHEON_DROP , legSound, foldChainOrder } from './callNet';

/**
 * 🧪 **그물 셋업의 계산이 ⑭ 검산과 같은가**
 *
 * 왜 있나: 동선 사각형이 상수 덤프에서 **실시간 계산**으로 바뀌었다 (2026-09-07).
 * 검산 값(노선_고르는_법 ⑭)은 스크립트로 잰 실측인데, 계산을 옮기며 수식이 어긋나면
 * **지도와 표가 같이 조용히 틀린다** — 그래서 검산의 숫자를 여기 못박는다.
 * 수식을 고치면 이 검사가 먼저 빨간불이어야 한다.
 * ⚠️ 집 좌표 교정(2026-09-07 저녁 · 폴리곤 평균 → 경로.md 실좌표, 남서 2.6km)으로
 * 숫자를 전부 다시 쟀다 — 48→53동, 부발읍은 «1° 탈락»에서 **진입(21.7°)**으로 뒤집혔다.
 */

const flat = (r: ReturnType<typeof buildNet>) => r.groups.flatMap(g => g.names);

describe('대기 프리셋 — «여주를 목적지로 느긋하게» (⑭ 검산 2026-09-07)', () => {
    const net = buildNet(WAIT_PRESET);

    it('꼭짓점 — 초월(집)에서 여주 시내까지 32.4km', () => {
        // 꼭짓점이 흔들리면 아래 전부가 의미를 잃는다 — 지도 재생성으로 좌표가 밀리면 여기서 먼저 잡힌다
        expect(NET_SRC.name).toBe('초월(집)');
        expect(NET_DST.name).toBe('여주 시내');
        expect(net.tri[0]).toEqual([+NET_SRC.lng.toFixed(5), +NET_SRC.lat.toFixed(5)]);
    });

    it('53동 — 여주 27 · 광주 14 · 이천 12', () => {
        expect(net.count).toBe(53);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([
            ['여주시', 27], ['광주시', 14], ['이천시', 12],
        ]);
    });

    it('길 위의 닻들이 든다 — 초월·곤지암·세종대왕면', () => {
        const names = flat(net);
        for (const d of ['초월읍', '곤지암읍', '세종대왕면']) expect(names).toContain(d);
    });

    it('🔴 「이천 시내」 표지는 이천 창전동에 찍힌다 — 마포·안성 창전동이 아니라', () => {
        // 창전동은 서울 마포·이천·안성 셋에 있다. 이름만으로 찾으면 파일 순서상 마포가 잡힌다
        const icheon = net.marks.find(m => m.name === '이천 시내');
        expect(icheon?.x).toBeGreaterThan(127.3);   // 이천 경도. 마포는 126.93
    });

    it('🔴 부발읍이 든다 — 목적지각 21.7° ≤ ±25° (집 좌표 교정으로 «1° 탈락»이 뒤집혔다)', () => {
        // 옛 집(폴리곤 평균·산자락)으로는 26°라 1° 차이로 빠졌다. 실좌표로 축이 돌며 3° 여유로 진입 —
        // 꼭짓점이 2.6km 만 밀려도 경계의 동은 운명이 갈린다. 좌표를 지어내면 안 되는 이유가 이것이다 (규칙 ④)
        const names = flat(net);
        expect(names).toContain('부발읍');
        for (const d of ['가남읍', '대신면', '북내면']) expect(names).not.toContain(d);
        expect(net.marks.find(m => m.name === '부발')?.inside).toBe(true);
        expect(net.marks.find(m => m.name === '곤지암')?.inside).toBe(true);
    });

    it('목적지 원을 지름 25km 로 키우면 가남읍·대신면·북내면이 들어온다 — 원은 각도와 무관하게 담는다', () => {
        const wider = buildNet({ ...WAIT_PRESET, dstDiamKm: 25 });
        const names = flat(wider);
        for (const d of ['가남읍', '대신면', '북내면']) expect(names).toContain(d);
    });

    it('출발지 각도를 30°(급함)로 조이면 53 → 45동', () => {
        expect(buildNet({ ...WAIT_PRESET, srcAngleDeg: 30 }).count).toBe(45);
    });

    /**
     * 🔴 **«서울은 뺀다»는 이제 필터가 한다** (기사님 2026-09-09:
     * *"필터에 서울이 없는데 서울 값들이 들어와야 할 것 같아"*).
     * 전에는 `collectDongs` 가 `region.startsWith('서울')` 로 몰래 뺐다 — 화면 어디에도 안 보였다.
     * ⑭ 의 판단은 그대로지만 **자리가 코드에서 «미리 눌린 제외지역»으로 옮겨졌다.**
     */
    it('그물 계산은 지리만 본다 — 각도가 맞으면 서울도 담는다', () => {
        const open = buildNet({ srcDiamKm: 60, srcAngleDeg: 170, dstAngleDeg: 170, dstDiamKm: 60, quadRadiusKm: 120 });
        expect(open.groups.some(g => g.region.startsWith('서울'))).toBe(true);
    });

    it('서울을 빼는 것은 제외지역이다 — 그 값을 주면 사라진다', () => {
        const open = buildNet({ srcDiamKm: 60, srcAngleDeg: 170, dstAngleDeg: 170, dstDiamKm: 60, quadRadiusKm: 120 });
        const merged = mergeGoalNets([open], { departed: false, myProgressKm: 0, excluded: ['S|서울'] });
        expect(merged.groups.some(g => g.region.startsWith('서울'))).toBe(false);
        expect(merged.count).toBeLessThan(open.count);
    });
});

describe('곤지암 판 — 곤지암성당(하차지) → 여주 (기사님 확정 2026-09-07)', () => {
    /**
     * 🔴 그물의 출발 꼭짓점은 현위치(모다아울렛)가 아니라 **잡은 콜의 하차지**다 —
     * 기사님: *"하차지에서 여주를 잇는 사각형이 되야지."* 이 검사가 그 규칙을 지킨다:
     * 누가 «현위치 기점»으로 되돌리면 아래 숫자(43동·부발읍 진입)가 전부 어긋난다.
     */
    const net = buildNet(WAIT_PRESET, GONJIAM_DROP);

    it('43동 — 여주 26 · 이천 14 · 광주 3', () => {
        expect(net.count).toBe(43);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([
            ['여주시', 26], ['이천시', 14], ['광주시', 3],
        ]);
    });

    it('🔵 부발읍이 이 판에서는 든다 — 하차지 기점으로 축이 옮겨져 목적지각 19°', () => {
        // 초월(집) 기점에서는 목적지각 26° 로 1° 차이 탈락이던 곳이다 (위 대기 판 검사)
        expect(flat(net)).toContain('부발읍');
        expect(net.marks.find(m => m.name === '부발')?.inside).toBe(true);
    });

    it('지나온 뒤(초월 서쪽)는 거의 안 남는다 — 광주는 초월·곤지암·도척 셋뿐', () => {
        const gwangju = net.groups.find(g => g.region === '광주시');
        expect(gwangju?.names.sort()).toEqual(['곤지암읍', '도척면', '초월읍'].sort());
    });
});

describe('동원대 판 — 둘째 콜(도로공사 경기광주지사→동원대) 뒤, 동원대(하차지) → 여주', () => {
    const net = buildNet(WAIT_PRESET, DONGWON_DROP);

    it('40동 — 여주 26 · 이천 13 · 광주 1. 그물이 닫힌다: 48 → 43 → 40', () => {
        expect(net.count).toBe(40);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([
            ['여주시', 26], ['이천시', 13], ['광주시', 1],
        ]);
    });

    it('지나온 초월읍(집)이 빠진다 — 출발지각 152°, «하루가 스스로 끝난다»의 시작', () => {
        expect(flat(net)).not.toContain('초월읍');
    });

    it('곤지암읍은 각도로는 뒤(131°)인데 든다 — 4.3km 라 출발지 원이 담는다', () => {
        // 원을 없애면(지름 0) 각도만 남아 곤지암읍이 떨어져야 한다 — 원의 존재 이유
        expect(flat(net)).toContain('곤지암읍');
        expect(flat(buildNet({ ...WAIT_PRESET, srcDiamKm: 0 }, DONGWON_DROP))).not.toContain('곤지암읍');
    });

    it('부발읍은 계속 든다 — 출발지각 19° · 목적지각 17°', () => {
        expect(flat(net)).toContain('부발읍');
    });
});

describe('보람여주 판 — 셋째 콜(르노 정비→보람여주장례식장) 뒤, 그물이 닫힌다', () => {
    const net = buildNet(WAIT_PRESET, BORAM_DROP);

    it('25동, 전부 여주 — 48 → 43 → 40 → 25, 하루가 스스로 끝난다', () => {
        expect(net.count).toBe(25);
        expect(net.groups.map(g => g.region)).toEqual(['여주시']);
    });

    it('부발·곤지암도 이제 지나온 곳 — 빠진다', () => {
        for (const d of ['부발읍', '곤지암읍', '초월읍']) expect(flat(net)).not.toContain(d);
    });
});

describe('이천병원 판 — 넷째 콜(세종대왕면 행정복지센터→이천병원) 뒤, 그물이 다시 열린다', () => {
    const net = buildNet(WAIT_PRESET, ICHEON_DROP);

    it('43동 — 여주 25 · 이천 18. 닫혔던 25동이 다시 열린다', () => {
        expect(net.count).toBe(43);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([['여주시', 25], ['이천시', 18]]);
    });

    it('하차지가 여주 반대편(서쪽)으로 가자 부발·이천 시내가 돌아온다', () => {
        for (const d of ['부발읍', '창전동', '신둔면']) expect(flat(net)).toContain(d);
    });
});

describe('필터 두 단계 — 영역(폭) 뒤에 거리(방향) (기사님 확정 2026-09-07)', () => {
    const MODA = { lng: 127.31259, lat: 37.36330 };            // 모다아울렛 (① 상차)
    const SEJONG_CENTER = { lng: 127.57350, lat: 37.30020 };   // 세종대왕면 행정복지센터 (④ 상차)

    it('① 콜(모다→곤지암성당)은 대기 국면에서 두 단계 다 통과한다', () => {
        const v = judgeTwoStage(WAIT_PRESET, NET_SRC, NET_DST, NET_SRC, MODA, GONJIAM_DROP);
        expect(v.dropInNet).toBe(true);
        expect(v.pickupNearMe).toBe(true);
        expect(v.dropBackward).toBe(false);
        expect(v.pickupBackward).toBe(false);
        expect(v.pass).toBe(true);
    });

    it('🔴 ④ 콜(세종대왕면→이천병원)은 ③국면에서 두 단계 모두에서 걸린다', () => {
        // 1단계: 하차지(이천)가 그물(25동 전부 여주) 밖 · 2단계: 하차 18.8km > 상차 6.9km — 하차 역주행
        const v = judgeTwoStage(WAIT_PRESET, BORAM_DROP, NET_DST, BORAM_DROP, SEJONG_CENTER, ICHEON_DROP);
        expect(v.dropInNet).toBe(false);
        expect(v.dropBackward).toBe(true);
        expect(v.pickupNearMe).toBe(true);          // 상차는 보람여주 옆 3.2km — 상차 쪽 문제가 아니다
        expect(v.pickupBackward).toBe(false);
        expect(v.pass).toBe(false);
    });

    it('상차 역주행 — 성당까지 와서 광주 시내 상차 콜을 잡으면 ②가 자른다 (볼트 7번 모양)', () => {
        const gwangjuPickup = { lng: 127.20, lat: 37.40 };      // 광주 시내쯤 — 여주에서 41km, 현위치(27.3km)보다 뒤
        const forwardDrop = { lng: 127.49, lat: 37.26 };        // 부발 근처 — 전진 방향
        const v = judgeTwoStage(WAIT_PRESET, GONJIAM_DROP, NET_DST, GONJIAM_DROP, gwangjuPickup, forwardDrop);
        expect(v.pickupBackward).toBe(true);
        expect(v.pass).toBe(false);
    });

    it('여유값 — 현위치보다 «조금» 뒤(상차 반경 안)의 상차는 살린다', () => {
        // 성당 국면에서 초월(집) 상차: 32.4km vs 현위치 27.3km — 5.1km 뒤지만 여유(7.5km) 안이다
        const v = judgeTwoStage(WAIT_PRESET, GONJIAM_DROP, NET_DST, GONJIAM_DROP, NET_SRC, { lng: 127.49, lat: 37.26 });
        expect(v.pickupBackward).toBe(false);
    });

    it('🔴 첫 콜 뒤 상차 영역 = 내 반경 ∩ 사각형 — 반경 안이라도 등 뒤 상차는 잘린다 (기사님 2026-09-07)', () => {
        // 내 위치 = 성당, 상차 = 모다아울렛(3.8km — 반경 안이지만 여주 반대쪽 뒤), 하차는 전진 방향.
        // ②의 여유값(7.5km)으로는 못 자르던 «옆 뒤 상차»를 ∩ 규칙이 자른다.
        const MODA_BEHIND = { lng: 127.31259, lat: 37.36330 };
        const forwardDrop = { lng: 127.49, lat: 37.26 };
        const waiting = judgeTwoStage(WAIT_PRESET, GONJIAM_DROP, NET_DST, GONJIAM_DROP, MODA_BEHIND, forwardDrop, false);
        const started = judgeTwoStage(WAIT_PRESET, GONJIAM_DROP, NET_DST, GONJIAM_DROP, MODA_BEHIND, forwardDrop, true);
        expect(waiting.pickupBackward).toBe(false);   // ② 여유 안 — 거리식은 못 자른다
        expect(waiting.pass).toBe(true);              // 대기 중(방향 없음)에는 살리는 게 맞다
        expect(started.pickupInNet).toBe(false);      // 사각형(성당→여주) 밖 — 등 뒤
        expect(started.pass).toBe(false);             // 첫 콜 뒤에는 ∩ 가 자른다
    });
});

describe('첫짐이 목적지 그 자체(초월→여주)인 두 판 — 사각형만으로는 구멍이 난다', () => {
    it('🕳️ 사각형만 — 하차지=목적지라 여주 원만 남는다: 25동, 전부 여주. 가는 길이 사라진다', () => {
        const hole = buildFirstLegDemo(false);
        expect(hole.count).toBe(25);
        expect(hole.groups.map(g => g.region)).toEqual(['여주시']);
        for (const d of ['곤지암읍', '초월읍', '신둔면']) expect(flat(hole)).not.toContain(d);
        expect(hole.tri).toHaveLength(0);                       // 사각형이 점으로 퇴화 — 그릴 것이 없다
    });

    it('🛣️ 길 양옆 ±5km(경유)를 합치면 가는 길이 돌아온다: 39동', () => {
        const filled = buildFirstLegDemo(true);
        expect(filled.count).toBe(39);
        for (const d of ['곤지암읍', '초월읍', '신둔면', '백사면']) expect(flat(filled)).toContain(d);
        expect(filled.tri).toHaveLength(5);                     // 경유 띠 직사각형(닫힌 5점)이 그려진다
    });
});

describe('∩ 의 예외 — 꼭짓점 자신은 각도를 잴 수 없다 (다섯 콜 이어 달리기 검산 2026-09-07)', () => {
    const BUBAL = { lng: 127.49054, lat: 37.26410 };            // 부발읍 중심 근사

    it('발밑 상차 — 부발에 서서 부발 상차(0km)는 각도 소음에 안 잘린다', () => {
        const me = { name: '부발(하차)', ...BUBAL };
        const v = judgeTwoStage({ ...WAIT_PRESET, srcAngleDeg: 100, dstAngleDeg: 100 }, me, NET_DST, BUBAL, BUBAL, { lng: 127.583, lat: 37.296 }, true);
        expect(v.pickupInNet).toBe(true);
        expect(v.pass).toBe(true);
    });

    it('목적지 원 안 상차 — 여주 시내 마무리 콜(연라동→단현동)은 방향을 안 잰다', () => {
        const me = { name: '세종대왕면(하차)', lng: 127.583, lat: 37.296 };
        const YEONRA = { lng: 127.637, lat: 37.284 }, DANHYEON = { lng: 127.663, lat: 37.264 };
        const v = judgeTwoStage({ ...WAIT_PRESET, srcAngleDeg: 100, dstAngleDeg: 100 }, me, NET_DST, { lng: me.lng, lat: me.lat }, YEONRA, DANHYEON, true);
        expect(v.pickupInNet).toBe(true);
        expect(v.pass).toBe(true);
    });

    it('아침의 차단 사례는 그대로 — 성당에서 모다(3.8km 뒤) 상차는 여전히 잘린다', () => {
        const MODA = { lng: 127.31259, lat: 37.36330 };
        const v = judgeTwoStage(WAIT_PRESET, GONJIAM_DROP, NET_DST, GONJIAM_DROP, MODA, { lng: 127.49, lat: 37.26 }, true);
        expect(v.pickupInNet).toBe(false);
        expect(v.pass).toBe(false);
    });
});

describe('경로 다시 짜기 — 가까운 곳 먼저, 하차는 제 상차 뒤 (기사님 2026-09-07)', () => {
    // 기사님 실험 그대로: ① 곤지암읍→신둔면 · ② 신둔면→진리동 (좌표는 동 중심점 근사)
    const GONJIAM = { lng: 127.3486, lat: 37.3462 };
    const SINDUN = { lng: 127.4060, lat: 37.3110 };
    const JINRI = { lng: 127.4550, lat: 37.2620 };

    it('출발(초월)에서 곤지암 상차 → 신둔면 → 진리동 순으로 짜인다', () => {
        const order = orderStopsGreedy(NET_SRC, [
            { pickup: GONJIAM, drop: SINDUN },
            { pickup: { lng: 127.4065, lat: 37.3105 }, drop: JINRI },   // ② 상차는 ① 하차 바로 옆
        ]);
        expect(order.map(s => `${s.call}${s.kind}`)).toEqual(['1상차', '1하차', '2상차', '2하차']);
    });

    it('상차 둘이 붙어 있으면 몰아서 싣는다 — 잡은 순서를 버린다', () => {
        // 콜1 하차가 멀고(여주), 콜2 상차가 콜1 상차 옆이면: 1상차 → 2상차 → …
        const order = orderStopsGreedy(NET_SRC, [
            { pickup: GONJIAM, drop: { lng: 127.6455, lat: 37.2774 } },
            { pickup: { lng: 127.3520, lat: 37.3480 }, drop: JINRI },
        ]);
        expect(order.slice(0, 2).map(s => s.kind)).toEqual(['상차', '상차']);
    });

    it('안 실은 짐은 못 내린다 — 하차가 상차보다 먼저 오지 않는다', () => {
        const order = orderStopsGreedy(NET_SRC, [
            { pickup: JINRI, drop: GONJIAM },                            // 상차가 멀고 하차가 가까운 심술 콜
            { pickup: GONJIAM, drop: SINDUN },
        ]);
        const picked = new Set<number>();
        for (const s of order) {
            if (s.kind === '하차') expect(picked.has(s.call)).toBe(true);
            else picked.add(s.call);
        }
    });
});

describe('관내 국면 — 목적지 원 안 + 출발지 원 밖이면 방향을 안 본다 (기사님 2026-09-07)', () => {
    it('여주 시내에 도착하면 관내다 · 출발 전 초월은 관내가 아니다', () => {
        expect(isLocalPhase(WAIT_PRESET, NET_SRC, NET_DST, NET_DST)).toBe(true);      // 여주 도착
        expect(isLocalPhase(WAIT_PRESET, NET_SRC, NET_DST, NET_SRC)).toBe(false);     // 아직 집 — 출발지 원 안
        // 복귀 판(목적지=집): 아침의 집은 목적지 원 안이지만 출발지 원 안이기도 하다 → 관내 아님
        expect(isLocalPhase(WAIT_PRESET, NET_SRC, NET_SRC, NET_SRC)).toBe(false);
    });

    it('관내 판정 — 원 안이면 역방향도 통과, 원을 벗어나면 탈락', () => {
        const YEONRA = { lng: 127.637, lat: 37.284 }, WOLSONG = { lng: 127.61, lat: 37.30 };
        const backward = judgeTwoStage(WAIT_PRESET, NET_DST, NET_DST, NET_DST, YEONRA, WOLSONG, true, true);
        expect(backward.pass).toBe(true);                     // 서쪽으로 가는 콜인데 원 안이라 통과
        const escape = judgeTwoStage(WAIT_PRESET, NET_DST, NET_DST, NET_DST, YEONRA, { lng: 127.43, lat: 37.28 }, true, true);
        expect(escape.pass).toBe(false);                      // 하차가 이천 — 원 밖
    });
});

/**
 * 🏘️ **«관내로 쟀는가»는 잰 쪽이 말한다** (기사님 지적 2026-09-09).
 *
 * 화면이 «관내 모드인가»만 보고 배지와 칩을 띄우다가 거짓말을 했다 —
 * 복귀로 목적지가 접히면 관내 규칙이 안 도는데도 «둘 다 원 안만»이라고 적었고,
 * 실제로는 「내 위치 반경 밖」인 것을 「상차 **원** 밖」이라고 읽혔다.
 */
/**
 * 📐 **마름모 반경 — 축에서 좌우로 몇 km** (기사님 확정 2026-09-09).
 * *"출발각 목적각 180 이면 안 되잖아.. 좌우를 목적지 출발지의 일직선과 평행하게 좌우에 둔다면"*
 */
/** 검사용 축 거리 — `lineZoneOf`(반경 r 띠)로 «r 안인가»를 물어 대신 잰다 */
const distToLineKmForTest = (pt: { lng: number; lat: number }, axis: Array<[number, number]>) =>
    lineZoneOf(axis, 10.5, null, { ...WAIT_PRESET, dstDiamKm: 0 }, NET_DST).pickupIn(pt) ? 0 : 999;

describe('📐 마름모 반경', () => {
    const P = (angle: number, r: number) => ({ srcDiamKm: 0, dstDiamKm: 0, srcAngleDeg: angle, dstAngleDeg: angle, quadRadiusKm: r });
    /** 초월(집)→여주 축에서 옆으로 벗어난 점 — 축 가운데쯤에서 북으로 약 11km */
    const mid = { lng: (NET_SRC.lng + NET_DST.lng) / 2, lat: (NET_SRC.lat + NET_DST.lat) / 2 + 0.10 };

    it('반경 안이면 든다', () => {
        expect(quadTesterOf(P(180, 20), NET_SRC, NET_DST)(mid)).toBe(true);
    });

    it('🔴 반경을 좁히면 각도가 아무리 넓어도 잘린다 — 폭을 막는 것이 이 값이다', () => {
        expect(quadTesterOf(P(180, 5), NET_SRC, NET_DST)(mid)).toBe(false);
    });

    /**
     * ✏️ **그리는 모양도 같은 셈법이어야 한다** (기사님 실측 2026-09-09 *"작동 안 해"*).
     * 각도 180 이면 옛 방식(두 광선의 교점)은 **평행이라 무한대**로 날아갔고, 그 좌표를 담으려
     * 지도가 통째로 튀었다. 그리고 그 모양은 «마름모 반경»도 안 봤다 — 판정만 잘리고 그림은 안 잘렸다.
     */
    it('🔴 각도 180 이어도 그리는 모양이 화면 안에 있다 — 무한대로 안 날아간다', () => {
        const net = buildNet({ ...P(180, 20), srcDiamKm: 15, dstDiamKm: 15 }, NET_SRC, NET_DST);
        expect(net.tri.length).toBeGreaterThan(4);
        for (const [lng, lat] of net.tri) {
            expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
            expect(Math.abs(lng - NET_SRC.lng)).toBeLessThan(3);   // 한반도 안 — 튀지 않는다
            expect(Math.abs(lat - NET_SRC.lat)).toBeLessThan(3);
        }
    });

    /**
     * 🔴 **180 을 넘으면 축 뒤쪽까지 담긴다 — 그림도 따라와야 한다** (기사님 확정 2026-09-09:
     * *"180도 이상은 더 그리지 않는 이유는 뭐야?"* → 그림만 안 커지고 **판정은 커지고 있었다**).
     */
    it('각도를 180 → 300 으로 올리면 그린 모양이 실제로 커진다', () => {
        const area = (tri: Array<[number, number]>) => {   // 신발끈 — 크기 비교에만 쓴다
            let a = 0;
            for (let i = 1; i < tri.length; i++) a += tri[i - 1][0] * tri[i][1] - tri[i][0] * tri[i - 1][1];
            return Math.abs(a) / 2;
        };
        const at180 = buildNet({ ...P(180, 30), srcDiamKm: 0, dstDiamKm: 0 }, NET_SRC, NET_DST);
        const at300 = buildNet({ ...P(300, 30), srcDiamKm: 0, dstDiamKm: 0 }, NET_SRC, NET_DST);
        expect(area(at300.tri)).toBeGreaterThan(area(at180.tri));
    });

    it('그리는 폭이 마름모 반경을 넘지 않는다 — 판정과 같은 모양이다', () => {
        const axis: Array<[number, number]> = [[NET_SRC.lng, NET_SRC.lat], [NET_DST.lng, NET_DST.lat]];
        const net = buildNet({ ...P(180, 10), srcDiamKm: 0, dstDiamKm: 0 }, NET_SRC, NET_DST);
        for (const [lng, lat] of net.tri) {
            expect(distToLineKmForTest({ lng, lat }, axis)).toBeLessThanOrEqual(10.5);   // 0.5 는 48등분 오차
        }
    });

    it('각도 180 이 쓸 수 있는 값이 된다 — 축 사이 직사각형', () => {
        const inQuad = quadTesterOf(P(180, 20), NET_SRC, NET_DST);
        expect(inQuad(mid)).toBe(true);                                   // 축 옆 — 든다
        // 출발지 «뒤» 는 각도 180 이어도 안 든다 (반평면 밖)
        expect(inQuad({ lng: NET_SRC.lng - 0.3, lat: NET_SRC.lat })).toBe(false);
    });
});

describe('🏘️ 관내로 쟀는가 — 판정이 스스로 말한다', () => {
    const A = { lng: 127.60, lat: 37.29 }, B = { lng: 127.61, lat: 37.30 };
    it('관내로 재면 local 이 참이다', () => {
        expect(judgeTwoStage(WAIT_PRESET, NET_DST, NET_DST, NET_DST, A, B, true, true).local).toBe(true);
    });
    it('관내가 아니면 거짓이다 — 화면이 관내 문구를 쓰면 안 된다', () => {
        expect(judgeTwoStage(WAIT_PRESET, NET_SRC, NET_DST, NET_SRC, A, B, false, false).local).toBe(false);
    });

    /** 🛣️ 라인으로 쟀는가도 같은 결 — 화면 칩이 «모드»를 따로 보면 갈린다 */
    it('띠(zone)를 주면 byLine 이 참, 안 주면 거짓이다', () => {
        const zone = lineZoneOf([[NET_SRC.lng, NET_SRC.lat], [NET_DST.lng, NET_DST.lat]], 5, null, WAIT_PRESET, NET_DST);
        expect(judgeTwoStage(WAIT_PRESET, NET_SRC, NET_DST, NET_SRC, A, B, false, false, zone).byLine).toBe(true);
        expect(judgeTwoStage(WAIT_PRESET, NET_SRC, NET_DST, NET_SRC, A, B, false, false).byLine).toBe(false);
    });

    it('관내로 재면 라인이 아니다 — 둘이 동시에 참일 수 없다', () => {
        const v = judgeTwoStage(WAIT_PRESET, NET_DST, NET_DST, NET_DST, A, B, true, true);
        expect(v.local).toBe(true);
        expect(v.byLine).toBe(false);
    });
});

describe('라인 띠 — 길 하나가 담는 동 (2026-09-07 카카오 실측 · 수식은 lineZoneOf 로 옮겼다)', () => {
    // 상수는 roadsYeoju.ts (생성 파일) — 여기서는 라인 띠 수식이 실측 그대로 동을 담는지 잠근다.
    // 🔴 길은 이름으로 찾는다 — «모든 길» 재생성(2026-09-07 저녁)으로 개수·순서가 바뀔 수 있다
    it('국도길(성남이천로·중부대로) 경유 띠 ±5km = 43동 — 이천 시내를 관통한다', async () => {
        const { YEOJU_ROADS } = await import('./roadsYeoju');
        const { buildLineNet } = await import('./callNet');
        const gukdo = YEOJU_ROADS.find(r => r.name.includes('성남이천로'))!;
        // lastDrop 이 없으면 «라인 ∪ 목적지 원» — 2026-09-09 이전 buildRoadNet 과 같은 식이다 (숫자가 같아야 한다)
        const net = buildLineNet(gukdo.line, 5, null, WAIT_PRESET, NET_DST);
        expect(net.count).toBe(43);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([
            ['여주시', 25], ['이천시', 12], ['광주시', 6],
        ]);
        expect(net.groups.flatMap(g => g.names)).toContain('창전동');   // 이천 시내
    });

    it('⛔ 고속길(광주원주) 경유 띠에는 산북면이 든다 — 길이 함정 옆을 지난다: 35동', async () => {
        const { YEOJU_ROADS } = await import('./roadsYeoju');
        const { buildLineNet } = await import('./callNet');
        const highway = YEOJU_ROADS.find(r => r.name.includes('광주원주'))!;
        const net = buildLineNet(highway.line, 5, null, WAIT_PRESET, NET_DST);
        expect(net.count).toBe(35);
        expect(net.groups.flatMap(g => g.names)).toContain('산북면');
        expect(net.groups.find(g => g.region === '이천시')).toBeUndefined();   // 이천을 건너뛴다
    });
});

describe('노선 — «라인 ∪ 남은 마름모» (기사님 확정 2026-09-09)', () => {
    /**
     * 기사님 시나리오 그대로다: 광주(초월)에서 파주를 목적지로 두고, 단가 좋은 첫 콜
     * **장지동 → 평촌**을 잡았다. 그러면 평촌까지는 **무조건 간다** — 그 구간은 길이 정해졌고,
     * 아직 안 정한 것은 «평촌 → 파주»뿐이다.
     *
     * 기사님: *"초월에서 하남 가는 콜은 필터를 통과하면 노이즈야."*
     */
    const ME = NET_SRC;                                        // 내 위치 — 초월(집)
    const JANGJI = { lng: 127.126, lat: 37.478 };              // 장지동 상차
    const PYEONGCHON = { lng: 126.964, lat: 37.392 };          // 평촌 하차 = 마지막 하차지
    const HANAM = { lng: 127.206, lat: 37.539 };               // 하남 — 라인에서 벗어난 쪽
    const PAJU = cityCenter('파주시');
    const LINE: Array<[number, number]> = [
        [ME.lng, ME.lat], [JANGJI.lng, JANGJI.lat], [PYEONGCHON.lng, PYEONGCHON.lat],
    ];
    const LAST_DROP = { name: '평촌(하차)', ...PYEONGCHON };
    const zone = lineZoneOf(LINE, 5, LAST_DROP, WAIT_PRESET, PAJU);

    it('초월 → 하남 콜은 걸러진다 — 라인 밖이고 «평촌→파주» 마름모에도 없다', () => {
        expect(zone.dropIn(HANAM)).toBe(false);
    });

    it('🔴 마름모를 내 위치에서 시작하면 그 하남이 들어온다 — 기점을 옮기는 이유가 이것이다', () => {
        const fromMe = lineZoneOf([], 5, { ...ME, name: '내 위치' }, WAIT_PRESET, PAJU);
        expect(fromMe.dropIn(HANAM)).toBe(true);
    });

    it('광주 → 파주 직행 콜은 산다 — 상차는 라인 위, 하차는 마름모 안', () => {
        expect(zone.pickupIn({ lng: ME.lng, lat: ME.lat })).toBe(true);
        expect(zone.dropIn(PAJU)).toBe(true);
    });

    it('상차는 라인 위만 본다 — 마름모 안(파주 쪽)이어도 상차지로는 안 친다', () => {
        expect(zone.dropIn(PAJU)).toBe(true);
        expect(zone.pickupIn(PAJU)).toBe(false);
    });

    it('🔴 마지막 하차지 둘레에는 원을 안 두른다 — 평촌 남쪽 6km 는 지나온 뒤라 안 담는다', () => {
        // 기사님 지적 2026-09-09: *"중간 기착지인 평촌동도 점선 라인과 영역에 지역들을 가지고 있는데 이걸 빼야 해"*
        // 🔴 자리를 **꼭짓점 원 안**(반경 7.5km)에 잡아야 이 검사가 뜻을 갖는다 — 원 밖에 잡으면
        //    원을 두르든 안 두르든 거짓이라 **아무것도 안 잡는다** (처음에 10km 로 잡아 그렇게 됐다).
        const SOUTH_OF_PYEONGCHON = { lng: 126.980, lat: 37.338 };   // 평촌에서 남쪽 6.2km — 라인(5km) 밖, 원(7.5km) 안
        expect(zone.dropIn(SOUTH_OF_PYEONGCHON)).toBe(false);
    });

    /**
     * 🔴 **라인은 목적지에서 나오지 않는다 — 잡은 콜들에서 나온다** (기사님 지적 2026-09-09).
     *
     * 화면에서 잡으셨다: *"복귀콜로 집에 가는 중인데 이 모습은 첫짐의 동선과 같다.
     * 노선의 동선이 되어야 할 것 같은데."* 라인을 **노선 목적지에만** 걸어 뒀더니,
     * 복귀콜을 잡아 목적지가 «집»으로 접히는 순간 **라인이 통째로 빠지고** 넓은 마름모만 남았다.
     */
    it('🔴 목적지가 집으로 바뀌어도 라인은 그대로다 — 마름모만 갈린다', () => {
        const HOME = { name: '초월(집)', lng: NET_SRC.lng, lat: NET_SRC.lat };
        const toPaju = lineZoneOf(LINE, 5, LAST_DROP, WAIT_PRESET, PAJU);
        const toHome = lineZoneOf(LINE, 5, LAST_DROP, WAIT_PRESET, HOME);
        // 라인 위 상차지는 **목적지와 무관하게** 둘 다 통과한다 — 달릴 길은 하나뿐이다
        expect(toPaju.pickupIn(JANGJI)).toBe(true);
        expect(toHome.pickupIn(JANGJI)).toBe(true);
        // 갈리는 것은 마름모뿐이다 — 집으로 갈 때 파주는 그물 밖이다
        expect(toPaju.dropIn(PAJU)).toBe(true);
        expect(toHome.dropIn(PAJU)).toBe(false);
    });

    /**
     * 🔴 **이 갈림이 화면 안에 있어서 아무 검사도 못 봤다** (2026-09-09).
     * 그래서 `netForGoal` 로 꺼냈다 — 여기서 잠근다.
     * 구별법: 마름모 그물은 원이 **둘**(출발 꼭짓점 + 목적지), 라인 그물은 **하나**(목적지만)다.
     */
    it('🔴 라인이 있으면 목적지가 무엇이든 라인 그물이다 — 복귀도 예외가 아니다', () => {
        const HOME = { name: '초월(집)', lng: NET_SRC.lng, lat: NET_SRC.lat };
        const o = { line: LINE, lineRadiusKm: 5, lastDrop: LAST_DROP, params: WAIT_PRESET, anchor: { ...ME, name: '내 위치' } };
        expect(netForGoal(PAJU, o).circles).toHaveLength(1);
        expect(netForGoal(HOME, o).circles).toHaveLength(1);   // ← 복귀도 라인 그물
    });

    it('라인이 없으면 마름모 그물이다 — 원이 둘(내 위치 + 목적지)', () => {
        const o = { line: null, lineRadiusKm: 5, lastDrop: LAST_DROP, params: WAIT_PRESET, anchor: { ...ME, name: '내 위치' } };
        expect(netForGoal(PAJU, o).circles).toHaveLength(2);
    });

    it('라인이 비면 라인 판정은 전부 거짓이다 — 경로가 오기 전에는 마름모가 판단한다', () => {
        const noLine = lineZoneOf([], 5, LAST_DROP, WAIT_PRESET, PAJU);
        expect(noLine.pickupIn({ lng: JANGJI.lng, lat: JANGJI.lat })).toBe(false);
    });
});

describe('판(목적지) 그룹 경로 — 콜마다 잡을 당시 목적지를 기억한다 (기사님 설계 2026-09-08)', () => {
    /**
     * 기사님: *"콜마다 콜을 잡을 당시의 목적지를 가지고 있다면 그것들끼리만 최적 경로로 바꾸면
     * 되는 거 아닌가"* — 그리고 이게 중요한 이유: *"콜 많은 곳에서 다음 갈 콜을 미리 잡아 둔다는
     * 점에서 공백을 줄이는 좋은 방법."* 실측 사고(2026-09-08): 복귀 콜들이 잡은 순서대로 뒤에
     * 붙어 장암동(북) → 광주(남) → 상계동(북) → 매산동(남) 요요가 나왔다.
     */
    const GYEONGAN = { lng: 127.255, lat: 37.399 }, JANGAM = { lng: 127.046, lat: 37.700 };
    const MANGWOL = { lng: 127.221, lat: 37.567 }, CHOWOL_PT = { lng: 127.294, lat: 37.377 };
    const SANGGYE = { lng: 127.073, lat: 37.660 }, MAESAN = { lng: 127.298, lat: 37.362 };

    /**
     * 🔴 **재배치는 «가는 길에 하나 더»다** (기사님 순서 ④⑫ 2026-09-08:
     * *"콜에 있는 모든 좌표를 가지고 우리 시스템이 최적경로를 찾은 후 최적경로순으로 재배치해"*,
     * *"첫 콜을 완전히 끝내고 두 번째를 하러 갑니다 — 그렇게 하려면 왜 합짐을 해"*).
     *
     * 방식은 **가장 싸게 끼워 넣기**: 콜을 잡은 순서대로, 그 콜의 상차·하차를 지금 순서의
     * 어느 자리에 끼울 때 총 거리가 가장 짧은지로 넣는다. 잡은 콜들의 **상대 순서는 그대로**
     * 두므로 이미 정한 순서가 흔들리지 않고, 되돌아가는 삽입은 비싸서 안 골린다.
     */
    it('🔴 가는 길 합짐 — 첫 콜 하차 전에 둘째를 끼운다 («다 끝내고 다음»이 아니다)', () => {
        const calls = [
            { pickup: GYEONGAN, drop: JANGAM, destName: '파주 시내' },
            { pickup: MANGWOL, drop: SANGGYE, destName: '파주 시내' },
        ];
        expect(orderStopsInsert(GYEONGAN, calls, []).map(s => `${s.call}${s.kind}`))
            .toEqual(['1상차', '2상차', '2하차', '1하차']);
        // 순차(1상,1하,2상,2하)면 76.2km — 끼워 넣으면 40.6km. 실측으로 확인함
    });

    it('🔴 실측 사고 그대로 — 요요가 없다: 장암(북) 뒤에 광주로 되내려오지 않는다', () => {
        const calls = [
            { pickup: GYEONGAN, drop: JANGAM, destName: '파주 시내' },
            { pickup: MANGWOL, drop: CHOWOL_PT, destName: '초월(집) — 복귀' },
            { pickup: SANGGYE, drop: MAESAN, destName: '초월(집) — 복귀' },
        ];
        expect(orderStopsInsert(GYEONGAN, calls, [{ call: 1, kind: '상차' }]).map(s => `${s.call}${s.kind}`))
            .toEqual(['1상차', '3상차', '1하차', '2상차', '2하차', '3하차']);
        // 83.4km — 판을 갈라 넣던 옛 방식(83.7km)보다 짧다
    });

    it('🔴 판이 달라도 «가는 길»이면 섞는다 — 판 그룹으로 가르면 157.3km, 끼워 넣으면 83.4km', () => {
        const calls = [
            { pickup: GYEONGAN, drop: JANGAM, destName: '파주 시내' },
            { pickup: MANGWOL, drop: CHOWOL_PT, destName: '초월(집) — 복귀' },
            { pickup: SANGGYE, drop: MAESAN, destName: '파주 시내' },
        ];
        expect(orderStopsInsert(GYEONGAN, calls, []).map(s => `${s.call}${s.kind === '상차' ? '상' : '하'}`))
            .toEqual(['1상', '3상', '1하', '2상', '2하', '3하']);
    });

    it('하차는 제 상차보다 뒤 — 짐을 싣기 전에 내릴 수 없다', () => {
        const calls = [
            { pickup: GYEONGAN, drop: JANGAM, destName: '파주 시내' },
            { pickup: MANGWOL, drop: SANGGYE, destName: '파주 시내' },
            { pickup: CHOWOL_PT, drop: MAESAN, destName: '파주 시내' },
        ];
        const o = orderStopsInsert(GYEONGAN, calls, []);
        for (const n of [1, 2, 3]) {
            expect(o.findIndex(s => s.call === n && s.kind === '상차'))
                .toBeLessThan(o.findIndex(s => s.call === n && s.kind === '하차'));
        }
    });

    it('방문한 정거장은 그 순서 그대로 고정 — 재계산해도 안 흔들린다 (안정성)', () => {
        const calls = [
            { pickup: GYEONGAN, drop: JANGAM, destName: '파주 시내' },
            { pickup: MANGWOL, drop: CHOWOL_PT, destName: '초월(집) — 복귀' },
            { pickup: SANGGYE, drop: MAESAN, destName: '초월(집) — 복귀' },
        ];
        const full = orderStopsInsert(GYEONGAN, calls, [{ call: 1, kind: '상차' }]);
        const later = orderStopsInsert(GYEONGAN, calls, full.slice(0, 3).map(s => ({ call: s.call, kind: s.kind })));
        expect(later.map(s => `${s.call}${s.kind}`)).toEqual(full.map(s => `${s.call}${s.kind}`));
    });
});


describe('⑮ 동선의 기준 — 목적지 하나당 마름모 하나 (기사님 확정 2026-09-08)', () => {
    /**
     * 기준(노선_고르는_법 ⑮):
     *   · 목적지 = 마름모 하나. 내 위치는 공유 꼭짓점, 목적지마다 자기 원
     *   · 목적지는 «의도»라 콜을 다 해도 안 죽는다
     *   · 그물 = 살아 있는 마름모들의 합집합 · 판정은 각각 · 하나라도 통과하면 통과
     *   · 둘 다 통과하면 복귀가 이긴다
     *   · homeCaught / ∩ 전환 특례는 **폐기** — 목적지는 각자 제 마름모로 살아 있을 뿐
     */
    const PAJU = cityCenter('파주시');
    const HOME = { ...NET_SRC, name: '복귀(집)' };
    const ME = { name: '중간(하남쯤)', lng: 127.19, lat: 37.52 };
    const NEAR_ME = { lng: 127.19, lat: 37.51 };
    const TO_PAJU = { lng: 126.95, lat: 37.63 };
    const TO_HOME = { lng: 127.26, lat: 37.42 };

    it('목적지 하나 — 마름모 하나 (기존 판정과 같다)', () => {
        const v = judgeGoals(WAIT_PRESET, ME, [PAJU], ME, NEAR_ME, TO_PAJU);
        expect(v.results).toHaveLength(1);
        expect(v.pass).toBe(true);
        expect(v.wonGoal?.name).toBe(PAJU.name);
    });

    it('목적지 둘 — 파주 방향 콜은 파주 판, 집 방향 콜은 복귀 판', () => {
        const toPaju = judgeGoals(WAIT_PRESET, ME, [PAJU, HOME], ME, NEAR_ME, TO_PAJU);
        expect(toPaju.wonGoal?.name).toBe(PAJU.name);
        const toHome = judgeGoals(WAIT_PRESET, ME, [PAJU, HOME], ME, NEAR_ME, TO_HOME);
        expect(toHome.wonGoal?.name).toBe(HOME.name);
    });

    it('🔴 둘 다 통과하면 복귀가 이긴다 — 목록 순서와 무관하게', () => {
        // 두 목적지가 **같은 방향**(이천·집 모두 남동)이라 한 콜이 양쪽 다 통과한다
        const ICHEON = cityCenter('이천시');
        const ME2 = { name: '집 북서쪽', lng: 127.20, lat: 37.45 };
        const PK = { lng: 127.21, lat: 37.445 }, DR = { lng: 127.29, lat: 37.38 };
        const a = judgeGoals(WAIT_PRESET, ME2, [ICHEON, HOME], ME2, PK, DR, { preferName: HOME.name });
        const b = judgeGoals(WAIT_PRESET, ME2, [HOME, ICHEON], ME2, PK, DR, { preferName: HOME.name });
        expect(a.results.every(r => r.verdict.pass)).toBe(true);   // 전제가 참인지 먼저 못박는다
        expect(a.wonGoal?.name).toBe(HOME.name);
        expect(b.wonGoal?.name).toBe(HOME.name);                   // 순서가 바뀌어도 같은 답
    });

    it('어느 목적지로도 안 되면 탈락', () => {
        const far = { lng: 128.6, lat: 35.9 };          // 대구쯤 — 둘 다 밖
        const v = judgeGoals(WAIT_PRESET, ME, [PAJU, HOME], ME, NEAR_ME, far);
        expect(v.pass).toBe(false);
        expect(v.wonGoal).toBeNull();
    });

    it('🔴 목적지는 넘긴 만큼 그대로 잰다 — 스스로 떨어뜨리지 않는다 (⑮ 기준 2)', () => {
        // 목적지를 셋 넘기면 결과도 셋. 판정이 «이 목적지는 볼 필요 없다»고 빼는 일이 없어야 한다
        const ICHEON = cityCenter('이천시');
        const v = judgeGoals(WAIT_PRESET, ME, [PAJU, HOME, ICHEON], ME, NEAR_ME, TO_PAJU);
        expect(v.results.map(r => r.goal.name)).toEqual([PAJU.name, HOME.name, ICHEON.name]);
    });

    it('첫 콜 뒤 ∩ — 짐 실은 목적지는 등 뒤 상차를 자른다 (pass 로 확인)', () => {
        const behind = { lng: 127.26, lat: 37.50 };     // 반경 안 · 파주 원뿔 밖(뒤)
        const idle = judgeGoals(WAIT_PRESET, ME, [PAJU], ME, behind, TO_PAJU, { loadedNames: [] });
        expect(idle.results[0].verdict.pickupNearMe).toBe(true);   // 반경은 들어온다
        expect(idle.pass).toBe(true);                              // 안 실었으면 산다
        const loaded = judgeGoals(WAIT_PRESET, ME, [PAJU], ME, behind, TO_PAJU, { loadedNames: [PAJU.name] });
        expect(loaded.results[0].verdict.pickupInNet).toBe(false);
        expect(loaded.pass).toBe(false);                           // 실었으면 잘린다
    });

    it('🔴 실은 짐이 없는 목적지는 ∩ 를 안 건다 — 복귀 대기의 미리 잡기 (2026-09-08 회귀)', () => {
        // 실측 사고: 파주 짐을 싣고 가는 중 복귀를 켰는데, 집 4.2km 하차 콜이 «상차 사각형 밖»으로 잘렸다
        const W = { lng: 127.12, lat: 37.53 };          // 반경 안 · 집 원뿔 밖
        const v = judgeGoals(WAIT_PRESET, ME, [PAJU, HOME], ME, W, TO_HOME,
            { loadedNames: [PAJU.name], preferName: HOME.name });
        const home = v.results.find(r => r.goal.name === HOME.name)!;
        expect(home.verdict.pass).toBe(true);           // 복귀는 짐이 없으니 원 전체
        expect(v.wonGoal?.name).toBe(HOME.name);
        // 파주는 짐을 실었으니 그 상차가 뒤면 잘린다 (같은 콜, 다른 목적지)
        expect(v.results.find(r => r.goal.name === PAJU.name)!.verdict.pass).toBe(false);
    });
});

describe('judgeGoals 의 배선 — 화면이 읽는 값과 목적지별 콜백 (2026-09-08 리뷰: 변이가 안 잡혔다)', () => {
    const PAJU2 = cityCenter('파주시');
    const HOME2 = { ...NET_SRC, name: '복귀(집)' };
    const ME3 = { name: '집 북서쪽', lng: 127.20, lat: 37.45 };
    const PK3 = { lng: 127.21, lat: 37.445 }, DR3 = { lng: 127.29, lat: 37.38 };

    it('🔴 won 은 «이긴 목적지»의 판정이다 — 첫 결과가 아니다 (화면 판정 카드가 이걸 읽는다)', () => {
        const ICHEON = cityCenter('이천시');
        const v = judgeGoals(WAIT_PRESET, ME3, [ICHEON, HOME2], ME3, PK3, DR3, { preferName: HOME2.name });
        expect(v.wonGoal?.name).toBe(HOME2.name);
        const home = v.results.find(r => r.goal.name === HOME2.name)!.verdict;
        // 「판 복귀(집)」 배지 밑에 이천 숫자가 깔리면 안 된다 — 승자의 값이어야 한다
        expect(v.won).toBe(home);
        expect(v.won?.distDropKm).toBe(home.distDropKm);
    });

    it('🔴 isLocal 을 주면 그 목적지는 관내 규칙(방향 안 봄)으로 잰다', () => {
        // 목적지 원 밖·뒤쪽 하차 — 일반 규칙이면 탈락, 관내 규칙이면 «둘 다 원 안»만 보므로 결과가 갈린다
        const behindDrop = { lng: 127.34, lat: 37.34 };
        const normal = judgeGoals(WAIT_PRESET, ME3, [PAJU2], ME3, PK3, behindDrop);
        const local = judgeGoals(WAIT_PRESET, ME3, [PAJU2], ME3, PK3, behindDrop, { isLocal: () => true });
        expect(normal.results[0].verdict.dropBackward).toBe(true);    // 일반: 방향을 본다
        expect(local.results[0].verdict.dropBackward).toBe(false);    // 관내: 방향을 안 본다
    });

    it('🔴 zoneOf 를 주면 그 판정기로 1단계를 잰다 (노선 길 띠)', () => {
        // 무엇이든 통과시키는 띠 ↔ 무엇도 통과 못 시키는 띠 — 결과가 갈려야 배선이 살아 있다
        const yes = { dropIn: () => true, pickupIn: () => true };
        const no = { dropIn: () => false, pickupIn: () => false };
        const far = { lng: 128.6, lat: 35.9 };                        // 그물 밖 하차
        expect(judgeGoals(WAIT_PRESET, ME3, [PAJU2], ME3, PK3, far, { zoneOf: () => yes }).results[0].verdict.dropInNet).toBe(true);
        expect(judgeGoals(WAIT_PRESET, ME3, [PAJU2], ME3, PK3, DR3, { zoneOf: () => no }).results[0].verdict.dropInNet).toBe(false);
    });
});

/**
 * 🏘️ **제외지역이 두 층이라 세 칸이 필요하다** (기사님 2026-09-09 «도 · 시·군·구 · 보기»).
 * 강화군은 **군 통째**, 남양주는 **수동면 하나**만 뺀다 — 그래서 읍·면·동까지 내려간다.
 */
describe('🏘️ 도 → 시·군·구 → 읍·면·동', () => {
    it('시도 목록에 경기와 인천이 따로 있다', () => {
        const s = sidoList();
        expect(s).toContain('경기');
        expect(s).toContain('인천');
    });

    it('🔴 인천의 시·군·구에 강화군이 있다 — 여기 없으면 미리 눌러 둔 여덟 곳을 되살릴 길이 없다', () => {
        expect(sggList('인천')).toContain('인천 강화군');
        expect(sggList('경기')).not.toContain('인천 강화군');
    });

    it('시·군·구의 읍·면·동을 이름순으로 낸다', () => {
        const d = dongList('남양주시');
        expect(d).toContain('수동면');
        expect(d).toContain('화도읍');
        expect([...d]).toEqual([...d].sort());
    });

    it('없는 시·군·구는 빈 배열 — 지어내지 않는다', () => {
        expect(dongList('없는시')).toEqual([]);
    });

    it('🔴 시도 이름을 주면 빈 배열 — 시·군·구 칸으로 거르는지 잠근다', () => {
        expect(dongList('경기')).toEqual([]);
    });
});

/**
 * ⛔ **제외 키 세 층** (기사님 2026-09-09 *"원래 내가 원한 건 서울을 빼는 거였는데"* —
 * 서울을 빼려고 구 25개를 하나씩 누르고 계셨다).
 * 읽는 곳이 화면과 아웃풋 둘이라 **판정은 여기 한 벌**이다.
 */
describe('⛔ 제외 — 도 · 시·군·구 · 읍·면·동', () => {
    it('시·군·구가 속한 도를 안다', () => {
        expect(sidoOf('서울 강남구')).toBe('서울');
        expect(sidoOf('가평군')).toBe('경기');
        expect(sidoOf('없는시')).toBe('');
    });

    it('🔴 도를 빼면 그 안의 동이 전부 빠진다 — 구 25개를 누르지 않아도 된다', () => {
        expect(isRegionExcluded(['S|서울'], '서울 강남구', '역삼동')).toBe(true);
        expect(isRegionExcluded(['S|서울'], '가평군', '가평읍')).toBe(false);
    });

    it('시·군·구 통째와 읍·면·동 하나가 따로 논다', () => {
        expect(isRegionExcluded(['R|가평군'], '가평군', '가평읍')).toBe(true);
        expect(isRegionExcluded(['D|남양주시|수동면'], '남양주시', '수동면')).toBe(true);
        expect(isRegionExcluded(['D|남양주시|수동면'], '남양주시', '화도읍')).toBe(false);
    });

    it('🔴 «통째»는 도와 시·군·구만이다 — 읍·면·동 하나로 그 시가 통째 빠지면 안 된다', () => {
        expect(isWholeRegionExcluded(['D|남양주시|수동면'], '남양주시')).toBe(false);
        expect(isWholeRegionExcluded(['S|서울'], '서울 강남구')).toBe(true);
    });

    it('키를 사람이 읽는 이름으로 옮긴다', () => {
        expect(excludedLabel('S|서울')).toBe('서울 전체');
        expect(excludedLabel('R|가평군')).toBe('가평군 전체');
        expect(excludedLabel('D|남양주시|수동면')).toBe('수동면');
    });
});

/**
 * 🕸️ **그물 합치기** — 겹침·지나온 곳·통째 제외를 한 곳에서 한다.
 * 화면(지도 점·「그물 N동」)과 아웃풋이 **이 결과 하나**를 읽는다.
 */
describe('🕸️ 목적지별 그물 합치기', () => {
    const pt = (name: string, region: string, progressKm?: number) => ({ x: 0, y: 0, name, region, progressKm });
    const opt = { departed: false, myProgressKm: 0, excluded: [] as string[] };

    it('두 목적지에 같은 동이 들면 한 번만 센다', () => {
        const r = mergeGoalNets([{ pass: [pt('역삼동', '서울 강남구')] }, { pass: [pt('역삼동', '서울 강남구')] }], opt);
        expect(r.count).toBe(1);
    });

    it('이름이 같아도 시·군·구가 다르면 다른 동이다', () => {
        const r = mergeGoalNets([{ pass: [pt('중앙동', '가평군'), pt('중앙동', '이천시')] }], opt);
        expect(r.count).toBe(2);
    });

    it('🔴 지나온 동은 뺀다 — 진행도 숫자 비교 하나로', () => {
        const pass = [pt('뒤', '광주시', 3), pt('앞', '이천시', 20), pt('마름모', '여주시')];
        expect(mergeGoalNets([{ pass }], { ...opt, departed: true, myProgressKm: 10 }).pass.map(p => p.name))
            .toEqual(['앞', '마름모']);   // 진행도 없는 동(마름모)은 라인과 무관하니 그대로 둔다
    });

    it('출발 전에는 지나온 동을 안 뺀다 — 아직 아무 데도 안 갔다', () => {
        const pass = [pt('뒤', '광주시', 3)];
        expect(mergeGoalNets([{ pass }], { ...opt, myProgressKm: 10 }).count).toBe(1);
    });

    it('🔴 통째로 뺀 지역은 그물에서 **사라진다** — 지도에 ✕ 수백 개가 덮이면 안 된다', () => {
        const pass = [pt('역삼동', '서울 강남구'), pt('부발읍', '이천시')];
        const r = mergeGoalNets([{ pass }], { ...opt, excluded: ['S|서울'] });
        expect(r.pass.map(p => p.name)).toEqual(['부발읍']);
        expect(r.groups).toEqual([{ region: '이천시', names: ['부발읍'] }]);
    });

    it('🔴 콕 집어 뺀 읍·면·동은 **남는다** — 지도에 ⛔ 로 그려 «여기 가지 마세요»를 말한다', () => {
        const pass = [pt('수동면', '남양주시')];
        expect(mergeGoalNets([{ pass }], { ...opt, excluded: ['D|남양주시|수동면'] }).count).toBe(1);
    });

    it('시·군·구별 명단은 많은 순이다 — 표가 그 순서로 그려진다', () => {
        const pass = [pt('a', '이천시'), pt('b', '광주시'), pt('c', '광주시')];
        expect(mergeGoalNets([{ pass }], opt).groups.map(g => g.region)).toEqual(['광주시', '이천시']);
    });
});

/**
 * 🔴 **복귀 마름모의 동이 «지나온 곳»으로 지워지던 것** (기사님 2026-09-10 · 지도 스크린샷).
 *
 * 기사님: *"파주 목표로 콜을 수행해서 목적지 영역에 들어갔다. 이후 복귀콜을 클릭했는데
 * **과천·안양·군포·경기광주에 포인트가 없어.** 영역 안에 지역들이 있어야 하는데.."*
 *
 * 진행도(`progressKm`)는 **라인 띠로 들어온 동**의 값이다 — «내가 이미 지난 길인가»를 재는 것.
 * 그런데 `buildLineNet` 이 **마름모·목적지 원으로 들어온 동에까지** 그 값을 붙이고 있었다
 * (실측 691/691). 마름모 동은 라인에 **수직으로 멀리** 있어 진행도가 작게 나오고,
 * 파주까지 달려온 기사님의 진행도가 크니 **앞으로 갈 곳이 통째로 «지나온 곳»으로 지워졌다.**
 */
describe('🏠 복귀 마름모는 진행도로 자르지 않는다', () => {
    const params = { srcDiamKm: 10, srcAngleDeg: 110, dstAngleDeg: 110, dstDiamKm: 15, quadRadiusKm: 25 };
    const paju = cityCenter('파주시');
    /** 집 → 파주 로 달린 라인. 복귀를 누르면 목적지가 집이라 마름모는 «파주 → 집» */
    const line: Array<[number, number]> = [[NET_SRC.lng, NET_SRC.lat], [paju.lng, paju.lat]];
    const net = buildLineNet(line, 6, paju, params, NET_SRC);
    const of = (name: string) => net.pass.find(p => p.name === name);

    it('마름모로만 든 동에는 진행도가 없다 — 라인 띠 밖이라 «지났나»를 물을 값이 아니다', () => {
        for (const nm of ['별양동', '비산동', '금정동']) {   // 과천 · 안양 · 군포
            expect(of(nm), nm).toBeDefined();
            expect(of(nm)?.progressKm, nm).toBeUndefined();
        }
    });

    it('라인 띠에 든 동에는 진행도가 있다 — 그건 잘라야 한다', () => {
        const onLine = net.pass.filter(p => p.progressKm != null);
        expect(onLine.length).toBeGreaterThan(0);
        expect(onLine.length).toBeLessThan(net.pass.length);   // 전부에 붙으면 그게 이 버그다
    });

    it('🔴 파주까지 달려온 뒤에도 과천·안양·군포가 남는다', () => {
        const merged = mergeGoalNets([net], { departed: true, myProgressKm: 50, excluded: [] });
        for (const nm of ['별양동', '비산동', '금정동']) {
            expect(merged.pass.some(p => p.name === nm), nm).toBe(true);
        }
    });
});

describe('legSound — 같은 점 구간은 «잴 것 없음»이지 «못 잼»이 아니다 (2026-09-11 오송발 세 콜)', () => {
    const pt = { x: 127.3, y: 36.6 };
    it('보통 구간(2점 이상)은 성하다', () => {
        expect(legSound({ distKm: 41.8, line: [pt, pt] })).toBe(true);
    });
    it('같은 점 구간(1점 · 0km)은 성하다 — 오송→오송이 경로를 옛 계보로 밀지 않는다', () => {
        expect(legSound({ distKm: 0, line: [pt] })).toBe(true);
    });
    it('failed 구간은 못 잰 것이다', () => {
        expect(legSound({ failed: true, distKm: 0, line: [pt] })).toBe(false);
    });
    it('1점인데 거리를 모르면(null) 못 잰 것이다', () => {
        expect(legSound({ distKm: null, line: [pt] })).toBe(false);
    });
    it('점이 하나도 없으면 못 잰 것이다', () => {
        expect(legSound({ distKm: 0, line: [] })).toBe(false);
    });
});

describe('netForGoal — 라인이 있으면 anchor 를 안 읽는다 (2026-09-11 · 매 틱 그물 재계산을 끊은 근거)', () => {
    it('anchor 가 NaN 이어도 라인 그물이 정상으로 나온다', () => {
        const line: Array<[number, number]> = [[NET_SRC.lng, NET_SRC.lat], [NET_DST.lng, NET_DST.lat]];
        const net = netForGoal(NET_DST, {
            line, lineRadiusKm: 6, lastDrop: null, params: WAIT_PRESET,
            anchor: { name: '무사용', lng: NaN, lat: NaN },
        });
        expect(net.pass.length).toBeGreaterThan(0);
        for (const p of net.pass) expect(Number.isFinite(p.x)).toBe(true);
    });
});

describe('foldChainOrder — 순번을 chain 으로 접는다 (수술 4단계 · 2026-09-11)', () => {
    const P = (n: number) => ({ lng: 127 + n / 100, lat: 36 + n / 100 });
    const calls = [
        { pickup: P(1), drop: P(2) },
        { pickup: P(3), drop: P(4) },
        { pickup: P(5), drop: P(6) },
    ];
    const labels = ['①상차', '②상차', '②하차', '③상차', '①하차', '③하차'];   // chain 이 정한 순서
    it('지나온 것 + chain 잔여 그대로 — 다시 섞지 않는다', () => {
        const out = foldChainOrder(labels, calls, [], 0)!;
        expect(out.map(v => `${v.call}${v.kind}`)).toEqual(['1상차', '2상차', '2하차', '3상차', '1하차', '3하차']);
        expect(out[0].pt).toEqual(P(1));
    });
    it('동결 뒤 지나간 만큼(cut) 잘라 붙인다', () => {
        const visited = [{ call: 1, kind: '상차' as const }, { call: 2, kind: '상차' as const }];
        const out = foldChainOrder(labels, calls, visited, 2)!;
        expect(out.map(v => `${v.call}${v.kind}`)).toEqual(['1상차', '2상차', '2하차', '3상차', '1하차', '3하차']);
    });
    it('남은 집합이 «전체−지나온 것»과 어긋나면 null — 옛 재배치로 물러난다 (취소 재측정 전 창)', () => {
        const visited = [{ call: 1, kind: '상차' as const }];
        expect(foldChainOrder(labels, calls, visited, 0)).toBeNull();   // ①상차가 잔여에도 남아 겹침
    });
    it('라벨이 못 읽히면 null', () => {
        expect(foldChainOrder(['①상차', null, '②하차'], calls, [], 0)).toBeNull();
        expect(foldChainOrder(['⑨상차'], calls, [], 0)).toBeNull();     // 콜 범위 밖
    });
    it('cut 이 범위 밖이면 null', () => {
        expect(foldChainOrder(labels, calls, [], -1)).toBeNull();
        expect(foldChainOrder(labels, calls, [], 7)).toBeNull();
    });
});

/**
 * 🚫 **제외 지역을 빼는 자리는 하나다** (이식 C2 · 2026-09-11 · 명세 §3).
 *
 * 실험실은 `buildAppFilterOutput` 안에서 직접 걸렀고, 서버는 아예 제외를 몰랐다.
 * 실물에 칸을 파면서 **판별 규칙을 또 쓰지 않게** 빼는 일 자체를 여기로 모은다 (규칙 ③) —
 * «화면은 뺐는데 판정은 안 뺐다» 는 이 레포가 이미 한 번 당한 모양이다.
 */
describe('pruneExcludedRegions — 제외를 빼는 자리는 한 곳 (이식 C2)', () => {
    const GROUPED = {
        '파주시': ['금촌동', '문산읍', '조리읍'],
        '고양시': ['행신동', '화정동'],
        '강화군': ['강화읍'],
    };

    it('제외가 없으면 그대로 낸다 (없는 일을 하지 않는다)', () => {
        const r = pruneExcludedRegions(GROUPED, []);
        expect(r.grouped).toEqual(GROUPED);
        expect(r.flat).toEqual(['강화읍', '금촌동', '문산읍', '조리읍', '행신동', '화정동']);
    });

    it('동 하나 제외 — 그 동만 빠지고 나머지는 남는다', () => {
        const r = pruneExcludedRegions(GROUPED, ['D|파주시|금촌동']);
        expect(r.grouped['파주시']).toEqual(['문산읍', '조리읍']);
        expect(r.flat).not.toContain('금촌동');
        expect(r.flat).toContain('문산읍');
    });

    it('시·군·구 통째 제외 — 그 묶음이 통째로 사라진다 (빈 배열로 남기지 않는다)', () => {
        const r = pruneExcludedRegions(GROUPED, ['R|강화군']);
        expect(r.grouped['강화군']).toBeUndefined();
        expect(r.flat).not.toContain('강화읍');
    });

    /** 🔴 도 한 층이 없어서 기사님이 **서울 구 25개를 하나씩** 누르고 계셨다 (2026-09-09) */
    it('도 제외 — 그 도의 시·군·구가 전부 빠진다', () => {
        const anySeoulSgg = sggList('서울')[0];
        expect(anySeoulSgg).toBeTruthy();
        const withSeoul = { ...GROUPED, [anySeoulSgg]: ['어느동'] };
        const r = pruneExcludedRegions(withSeoul, ['S|서울']);
        expect(r.grouped[anySeoulSgg]).toBeUndefined();
        expect(r.grouped['파주시']).toEqual(GROUPED['파주시']);   // 다른 도는 그대로
    });

    it('한 시·군·구의 동을 다 빼면 그 묶음도 사라진다 (빈 묶음을 남기지 않는다)', () => {
        const r = pruneExcludedRegions(GROUPED, ['D|고양시|행신동', 'D|고양시|화정동']);
        expect(r.grouped['고양시']).toBeUndefined();
    });

    /** 🔴 같은 이름의 동이 여러 시에 있다 — 시군구까지 봐야 한다 (수도권에만 97개) */
    it('동명이인은 시·군·구로 가른다', () => {
        const two = { '파주시': ['신촌동'], '서대문구': ['신촌동'] };
        const r = pruneExcludedRegions(two, ['D|서대문구|신촌동']);
        expect(r.grouped['파주시']).toEqual(['신촌동']);
        expect(r.grouped['서대문구']).toBeUndefined();
        expect(r.flat).toEqual(['신촌동']);
    });

    it('flat 은 중복 없이 정렬된다 (앱이 그대로 읽는 목록이다)', () => {
        const dup = { '가시': ['같은동'], '나시': ['같은동', '다른동'] };
        const r = pruneExcludedRegions(dup, []);
        expect(r.flat).toEqual(['같은동', '다른동']);
    });
});
