import { describe, it, expect } from 'vitest';
import { sheetStatus, sheetStatusLine, textWidth, departureDue } from './sheetStatus';

/**
 * 🎬 **시트 상태바 — 경우마다 그 경우의 말을 한다** (기사님 확정 2026-09-13).
 *
 * 기사님: *"시트 상태바가 너무 불친절해. 지금 상태가 달리고 있는건지 멈춘건지
 * 출발한건지 어디까지 몇km 남은건지 등등이 표시 되면 좋겠어."*
 * + *"경우의 수 만큼만 if문 만들자 그래야 친절한 멘트를 구사할수 있다."*
 *
 * ── 왜 갈랐나 ──
 * 예전에는 **요소를 하나씩** 돌려주고(기호·번호·지명·분·꼬리) 화면이 조립했다.
 * 그래서 어느 경우에나 **같은 말투**가 나왔다 — «⏸ 1 초월읍 ~30분 2번 콜 · 상차».
 * 달릴 때 궁금한 것과 서 있을 때 궁금한 것이 **다른데** 한 모양으로 말한 것이다.
 *
 * 🔴 **경우가 일곱이다.** 각 경우가 제 문장을 만든다:
 *      대기 · 판정중 · 사이클끝 · 도착 · 찾기 · 주행 · 정차
 * 🔴 **아코디언을 열면 지도가 통째로 가려진다**(규칙 L5). 그때 이 한 줄이 **지도 대신**이라
 *    경우별로 가장 쓸모 있는 것을 말해야 한다 (기사님이 «불친절»이라 하신 자리).
 *
 * ── 기사님이 정한 경우별 말 ──
 * | 경우 | 무엇을 말하나 | 왜 그것인가 |
 * |---|---|---|
 * | 주행 | **몇 시 도착** | 달리는 중에 궁금한 것은 «언제 닿나»다 |
 * | 정차 | **얼마 남았나** | 서 있을 때 궁금한 것은 «얼마나 더 가야 하나»다 |
 * | 찾기 | **몇 m 전** | 눈으로 찾는 거리다. 100m 눈금으로 센다 |
 * | 도착 | **다음은 어디** | 닿았으면 그다음 일을 준비한다 |
 *
 * 🔴 **거리가 두 가지다** (규칙 ⑤-4 ⑤ — 한 낱말이 두 질문에 답하지 않게):
 *    · 먼 거리(45km) → **도로 기준**이어야 뜻이 있다. 직선이면 산을 뚫고 간다.
 *      서버가 아직 안 주므로 **모르면 그 조각을 뺀다** (규칙 ④)
 *    · 가까운 거리(400m) → **직선이 맞다.** 근접은 눈으로 찾는 거리이고 서버 도착 감지도
 *      직선 500m 다
 * 🔴 **«도착»의 방아쇠는 위치다 — 타이머가 아니다.** 다녀온 정거장의 도착 반경 안에
 *    서 있으면 «도착»이고, 떠나면 저절로 «주행/정차»로 넘어간다. 기억을 두지 않는다.
 *    ⚠️ 반경 100m 를 «서버가 도착을 찍는 조건»으로 쓰지 않는다 — 그건 500m+정지 30초다.
 *       두 개가 다른 것을 말하면 «화면은 도착인데 단계는 안 넘어감»이 된다.
 */
const gonjiam = { visitNo: 1, name: '곤지암성당', callNo: 2, stop: '하차' as const };
const icheon = { visitNo: 3, name: '이천물류센터', callNo: 3, stop: '상차' as const };

describe('🎬 시트 상태바 — 일곱 경우', () => {

    it('대기 — 콜이 없으면 기다린다고 말한다', () => {
        const s = sheetStatus({ idle: true });
        expect(s.kind).toBe('idle');
        expect(sheetStatusLine(s)).toContain('새 콜');
    });

    it('판정중 — 갈 곳이 없고 판정 중일 때만', () => {
        expect(sheetStatus({ judging: true }).kind).toBe('judging');
    });

    /** 🔴 판정 중이어도 **갈 곳이 있으면** 갈 곳을 말한다 (B3 — 달리면서 보는 줄이다) */
    it('🔴 판정 중이어도 갈 곳이 있으면 갈 곳을 말한다', () => {
        const s = sheetStatus({ judging: true, moving: true, next: gonjiam, etaHhmm: '08:00' });
        expect(s.kind).toBe('moving');
        expect(sheetStatusLine(s)).toContain('곤지암');
    });

    it('사이클끝 — 콜은 있는데 갈 곳이 없다', () => {
        expect(sheetStatus({}).kind).toBe('done');
    });

    /** 🗓️ **사이클 = 하루** (기사님 결정 2026-09-15) — 콜 사이 빈 차마다 «사이클을 마쳤다»가 뜨면 거짓말이다. 오늘 한 일을 센다 (화면규칙 E12) */
    it('🔴 갈 곳이 없으면 «오늘 N콜 마침 · 새 콜 대기»', () => {
        expect(sheetStatusLine(sheetStatus({ doneToday: 3 }))).toBe('오늘 3콜 마침 · 새 콜 대기');
        expect(sheetStatusLine(sheetStatus({}))).not.toMatch(/사이클/);
    });

    /** ▶ 달릴 때 궁금한 것은 «언제 닿나» 다 */
    it('주행 — 도착 예정 시각을 말한다', () => {
        const s = sheetStatus({ moving: true, next: gonjiam, etaHhmm: '08:00' });
        expect(s.kind).toBe('moving');
        expect(sheetStatusLine(s)).toContain('08:00');
    });

    /** 🔴 시각을 모르면 그 조각을 뺀다 — 지어내지 않는다 (규칙 ④) */
    it('🔴 주행 — 시각을 모르면 시각을 안 적는다', () => {
        const line = sheetStatusLine(sheetStatus({ moving: true, next: gonjiam }));
        expect(line).toContain('곤지암');
        expect(line).not.toContain('도착예정');
    });

    /** ⏸ 서 있을 때 궁금한 것은 «얼마나 더» 다 */
    it('정차 — 남은 거리를 말한다', () => {
        const s = sheetStatus({ moving: false, next: gonjiam, remainKm: 45 });
        expect(s.kind).toBe('stopped');
        expect(sheetStatusLine(s)).toContain('45km');
    });

    /**
     * 🔴 **도로 기준 남은 거리를 서버가 아직 안 준다** — 그러면 그 조각만 뺀다.
     *    직선으로 재서 채우지 않는다 (*"직선 거리는 우리가 아는 값 중 가장 부정확했다"*).
     */
    it('🔴 정차 — 남은 거리를 모르면 직선으로 지어내지 않는다', () => {
        const line = sheetStatusLine(sheetStatus({ moving: false, next: gonjiam }));
        expect(line).toContain('정차');
        expect(line).not.toContain('km');
    });

    /** 🔍 400m 안이면 «찾는 중»이다 — 100m 눈금 */
    it('찾기 — 400m 안이면 몇 m 전인지 100m 눈금으로 말한다', () => {
        const s = sheetStatus({ moving: true, next: gonjiam, nearMeters: 340 });
        expect(s.kind).toBe('near');
        expect(sheetStatusLine(s)).toContain('300m');
    });

    /** 🔴 400m 밖이면 찾기가 아니다 — 경계를 못박는다 */
    it('🔴 400m 밖이면 찾기가 아니다', () => {
        expect(sheetStatus({ moving: true, next: gonjiam, nearMeters: 520, etaHhmm: '08:00' }).kind)
            .toBe('moving');
    });

    /** ✅ 도착 — 다음 갈 곳을 미리 말한다 */
    it('도착 — 다음 갈 곳을 함께 말한다', () => {
        const s = sheetStatus({ arrivedHere: gonjiam, next: icheon, moving: false });
        expect(s.kind).toBe('arrived');
        const line = sheetStatusLine(s);
        expect(line).toContain('도착');
        expect(line).toContain('이천');
    });

    it('도착 — 다음이 없으면 마지막이라고 말한다', () => {
        const line = sheetStatusLine(sheetStatus({ arrivedHere: gonjiam, moving: false }));
        expect(line).toContain('마지막');
    });

    /**
     * 🔴 **색과 번호가 같은 자리에서 나온다** (규칙 ⑤-3 · 화면규칙 L6).
     *
     * 🔴 **«도착» 경우가 이 검사의 이유다.** 그때 번호는 **다녀온 정거장**인데, 화면이
     *    `next.callNo` 로 색을 칠하면 색은 **다음 콜**이 된다 — «색 = 번호»가 깨진다.
     *    색만 보고 1~2초에 누르는 화면에서 그 둘이 어긋나는 것이 가장 큰 사고다.
     */
    it('🔴 색과 번호가 같은 정거장을 가리킨다 (도착 경우)', () => {
        const s = sheetStatus({ arrivedHere: gonjiam, next: icheon, moving: false });
        expect(s.no).toBe(gonjiam.visitNo);
        expect(s.callNo).toBe(gonjiam.callNo);      // ← icheon(3번)이 아니다
        expect(s.stopKind).toBe('dropoff');
    });

    it('색과 번호가 같은 정거장을 가리킨다 (주행·정차·찾기)', () => {
        for (const s of [
            sheetStatus({ moving: true, next: icheon, etaHhmm: '08:00' }),
            sheetStatus({ moving: false, next: icheon }),
            sheetStatus({ moving: true, next: icheon, nearMeters: 200 }),
        ]) {
            expect(s.no).toBe(icheon.visitNo);
            expect(s.callNo).toBe(icheon.callNo);
            expect(s.stopKind).toBe('pickup');
        }
    });

    /** 🔴 갈 곳이 없으면 색도 없다 — 지어내지 않는다 (규칙 ④) */
    it('🔴 한 문장만 나가는 경우엔 색이 없다', () => {
        for (const s of [sheetStatus({ idle: true }), sheetStatus({ judging: true }), sheetStatus({})]) {
            expect(s.callNo).toBeNull();
            expect(s.stopKind).toBeNull();
        }
    });

    /**
     * 🔴 **폰 한 줄(약 56칸)을 넘지 않는다** (B5). 경우마다 말이 길어졌으니 다시 잰다 —
     *    넘치면 달리면서 1~2초에 읽을 수 없다.
     */
    it('🔴 모든 경우가 56칸 안이다', () => {
        const longName = { visitNo: 10, name: '경기광주자연앤자이점', callNo: 9, stop: '상차' as const };
        const cases = [
            sheetStatus({ idle: true }),
            sheetStatus({ judging: true }),
            sheetStatus({}),
            sheetStatus({ moving: true, next: longName, etaHhmm: '08:00' }),
            sheetStatus({ moving: false, next: longName, remainKm: 145 }),
            sheetStatus({ moving: true, next: longName, nearMeters: 340 }),
            sheetStatus({ arrivedHere: longName, next: longName, moving: false }),
            sheetStatus({ moving: false, next: longName, remainKm: 145, due: departureDue(-125, '08:00') }),
            sheetStatus({ judging: true, due: departureDue(20, '08:00') }),
        ];
        for (const s of cases) {
            const w = textWidth(sheetStatusLine(s));
            expect(`${s.kind} ${w}칸`).toBe(`${s.kind} ${w <= 56 ? w : '넘침'}칸`);
        }
    });

    /**
     * 🚩 **출발 카운트다운은 상태바 한 조각이다** (기사님 2026-09-15 · 여섯 번째 바퀴).
     *    *"~ 출발 시각이 지났습니다 이 영역이 너무 두꺼워서 컨텐츠를 모두 가린다. 박스는 지우고 내용은 시트 현황 바에 넣어줘 (몇분 지각 / 몇시 출발)"*
     */
    describe('🚩 출발 조각', () => {
        it('늦었으면 «N분 지각» · 아니면 «HH:MM 출발»', () => {
            expect(departureDue(-12, '10:40')).toBe('12분 지각');
            expect(departureDue(20, '10:40')).toBe('10:40 출발');
            expect(departureDue(0, '10:40')).toBe('10:40 출발');
        });
        it('상태바가 그 조각을 싣는다 — 어느 경우든 (갈 곳이 없어도)', () => {
            expect(sheetStatus({ moving: false, next: icheon, remainKm: 3, due: '12분 지각' }).due).toBe('12분 지각');
            expect(sheetStatus({ judging: true, due: '10:40 출발' }).due).toBe('10:40 출발');
            expect(sheetStatusLine(sheetStatus({ moving: false, next: icheon, due: '12분 지각' }))).toMatch(/12분 지각/);
        });
        it('출발 조각이 없으면 없다 — 지어내지 않는다', () => {
            expect(sheetStatus({ moving: false, next: icheon }).due).toBeNull();
        });
    });
});
