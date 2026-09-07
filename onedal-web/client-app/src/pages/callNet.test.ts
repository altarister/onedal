import { describe, it, expect } from 'vitest';
import { buildNet, buildFirstLegDemo, judgeTwoStage, orderStopsGreedy, isLocalPhase, WAIT_PRESET, NET_SRC, NET_DST, GONJIAM_DROP, DONGWON_DROP, BORAM_DROP, ICHEON_DROP } from './callNet';

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

    it('서울은 각도가 맞아도 담지 않는다 (⑭ «서울은 뺀다»)', () => {
        // 목적지 각도를 한껏 열어도 서울 동은 0 — 필터가 각도보다 먼저다
        const open = buildNet({ srcDiamKm: 60, srcAngleDeg: 170, dstAngleDeg: 170, dstDiamKm: 60 });
        expect(open.groups.some(g => g.region.startsWith('서울'))).toBe(false);
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

    it('상차 역주행 — 성당까지 와서 광주 시내 상차 콜을 잡으면 ②가 자른다 (볼첨지 7번 모양)', () => {
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

describe('∩ 의 예외 — 꼭짓점 자신은 각도를 잴 수 없다 (다섯 콜 사슬 검산 2026-09-07)', () => {
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

describe('길 경유 띠 — «길을 잡아서 작동하는 노선» (기사님 확정 2026-09-07 · 카카오 실측)', () => {
    // 상수는 roadsYeoju.ts (생성 파일) — 여기서는 경유 띠 수식이 실측 그대로 동을 담는지 잠근다.
    // 🔴 길은 이름으로 찾는다 — «모든 길» 재생성(2026-09-07 저녁)으로 개수·순서가 바뀔 수 있다
    it('국도길(성남이천로·중부대로) 경유 띠 ±5km = 43동 — 이천 시내를 관통한다', async () => {
        const { YEOJU_ROADS } = await import('./roadsYeoju');
        const { buildRoadNet } = await import('./callNet');
        const gukdo = YEOJU_ROADS.find(r => r.name.includes('성남이천로'))!;
        const net = buildRoadNet(gukdo.line, NET_DST, WAIT_PRESET.dstDiamKm);
        expect(net.count).toBe(43);
        expect(net.groups.map(g => [g.region, g.names.length])).toEqual([
            ['여주시', 25], ['이천시', 12], ['광주시', 6],
        ]);
        expect(net.groups.flatMap(g => g.names)).toContain('창전동');   // 이천 시내
    });

    it('⛔ 고속길(광주원주) 경유 띠에는 산북면이 든다 — 길이 함정 옆을 지난다: 35동', async () => {
        const { YEOJU_ROADS } = await import('./roadsYeoju');
        const { buildRoadNet } = await import('./callNet');
        const highway = YEOJU_ROADS.find(r => r.name.includes('광주원주'))!;
        const net = buildRoadNet(highway.line, NET_DST, WAIT_PRESET.dstDiamKm);
        expect(net.count).toBe(35);
        expect(net.groups.flatMap(g => g.names)).toContain('산북면');
        expect(net.groups.find(g => g.region === '이천시')).toBeUndefined();   // 이천을 건너뛴다
    });
});
