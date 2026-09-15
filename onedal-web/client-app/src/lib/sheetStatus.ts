import { shortStopLabel } from './routeUtils';

/**
 * 🎬 **시트 상태바 문장 — 경우마다 그 경우의 말을 한다** (기사님 확정 2026-09-13).
 *
 * 기사님: *"시트 상태바가 너무 불친절해. 지금 상태가 달리고 있는건지 멈춘건지 출발한건지
 * 어디까지 몇km 남은건지 등등이 표시 되면 좋겠어."*
 * + *"경우의 수 만큼만 if문 만들자 그래야 친절한 멘트를 구사할수 있다."*
 *
 * ── 왜 갈랐나 ──
 * 예전에는 **요소를 하나씩** 돌려주고 화면이 조립했다(기호·번호·지명·분·꼬리). 그래서 어느
 * 경우에나 **같은 말투**가 나왔다 — «⏸ 1 초월읍 ~30분 2번 콜 · 상차». 그런데 달릴 때
 * 궁금한 것과 서 있을 때 궁금한 것이 **다르다.**
 *
 * 🔴 **아코디언을 열면 지도가 통째로 가려진다**(화면규칙 L5). 그때 이 한 줄이 **지도 대신**이라
 *    경우별로 가장 쓸모 있는 것을 말해야 한다 — 기사님이 «불친절»이라 하신 자리다.
 *
 * ── 경우가 일곱이다 (기사님이 정한 말) ──
 * | 경우 | 무엇을 말하나 | 왜 그것인가 |
 * |---|---|---|
 * | 대기 | 새 콜을 기다린다 | 할 일이 없다 |
 * | 판정중 | 판정하고 있다 | 갈 곳이 **없을 때만** (B3) |
 * | 사이클끝 | 마쳤다 | 갈 곳이 없다 ≠ 콜이 없다 (B4) |
 * | **도착** | **다음은 어디** | 닿았으면 그다음 일을 준비한다 |
 * | **찾기** | **몇 m 전** | 눈으로 찾는 거리다. 100m 눈금 |
 * | **주행** | **몇 시 도착** | 달리는 중에 궁금한 것은 «언제 닿나» |
 * | **정차** | **얼마 남았나** | 서 있을 때 궁금한 것은 «얼마나 더» |
 *
 * ── 기사님이 정한 다이어트는 그대로다 ──
 * | | 무엇을 | 왜 |
 * |---|---|---|
 * | ㉮ | 지명을 **6자에서 자른다** | 09-03 자료 72종 중 평균 3.5자인데 `경기광주자연앤자이점`(10자)이 섞인다 |
 * | ㉯ | «이동»·«정차»를 **기호로** | ▶ ⏸ 🔍 ✅ 로 칸을 던다 |
 * | ㉰ | **«어디서»를 뺀다** | 다녀온 곳은 콜 헤더의 진행 점과 지도의 흰 링이 말한다 |
 * |  | ⚠️ **«도착»만 예외다** — 지도가 가려진 순간이라 흰 링을 볼 수 없고, 기사님이 그 모양을 직접 주셨다 (`곤지암성당(하)도착 → 3 이천물류(상)`) |
 *
 * 🔴 **거리가 두 가지다** (규칙 ⑤-4 ⑤ — 한 낱말이 두 질문에 답하지 않게):
 *    · 먼 거리(45km) → **도로 기준**이어야 뜻이 있다. 직선이면 산을 뚫고 간다.
 *      서버가 아직 안 주므로(`sectionDistKm` 없음) **모르면 그 조각을 뺀다** (규칙 ④)
 *    · 가까운 거리(400m) → **직선이 맞다.** 눈으로 찾는 거리이고 서버 도착 감지도 직선이다
 *
 * 🔴 **«도착»의 방아쇠는 위치다 — 타이머가 아니다.** 다녀온 정거장 곁에 서 있으면 «도착»이고
 *    떠나면 저절로 넘어간다. 기억(ref·타이머)을 두지 않으므로 «끄는 것을 잊는» 일이 없다.
 *    ⚠️ 이 반경을 «서버가 도착을 찍는 조건»으로 쓰지 않는다 — 그건 500m + 정지 30초다.
 *       두 개가 다른 것을 말하면 «화면은 도착인데 단계는 안 넘어감»이 된다 (2026-09-12 그 모양).
 *
 * 🔬 검사는 `sheetStatus.test.ts` — 일곱 경우와 경계(400m)·«모르면 뺀다»·56칸을 문다.
 */

/** 🔍 이 안에 들면 «찾는 중»이다 (기사님 확정) — 직선 m */
export const NEAR_METERS = 400;
/** 🔍 남은 거리를 이 눈금으로 센다 (기사님 확정: *"100m 단위로 남을때마다"*) */
export const NEAR_STEP_M = 100;

export type SheetStatusKind =
    'idle' | 'judging' | 'done' | 'arrived' | 'near' | 'moving' | 'stopped';

interface StopRef {
    visitNo: number;
    name: string;
    callNo?: number | null;
    stop?: '상차' | '하차';
}

export interface SheetStatusInput {
    /** 진행 중인 콜이 하나도 없나 */
    idle?: boolean;
    /** 새 콜을 판정하는 중인가 */
    judging?: boolean;
    /** 달리는 중인가 (아니면 서 있다) */
    moving?: boolean;
    /** 다음 정거장 — 없으면 갈 곳이 없는 것이다 */
    next?: StopRef | null;
    /** ✅ 지금 곁에 서 있는 **다녀온** 정거장 — 없으면 null */
    arrivedHere?: StopRef | null;
    /** 🔍 다음 정거장까지 **직선** m — 근접만 답한다. 모르면 null */
    nearMeters?: number | null;
    /** 🕐 다음 정거장 도착 예정 시각 `HH:MM` — 모르면 null */
    etaHhmm?: string | null;
    /** 🛣️ **도로 기준** 남은 km — 서버가 줘야 한다. 모르면 null (지어내지 않는다) */
    remainKm?: number | null;
    /** 🛣️ **도로 기준** 남은 분 — 시각을 모를 때의 폴백 */
    driveMinutes?: number | null;
    /** 🚩 **출발 조각** — `departureDue()` 가 만든 «N분 지각» · «HH:MM 출발». 출발 전이 아니면 null */
    due?: string | null;
    /** 🗓️ 오늘 하차를 마친 콜 수 — «오늘 N콜 마침» (사이클 = 하루 · 2026-09-15). 모르면 없다 */
    doneToday?: number;
}

export interface SheetStatus {
    /** 어느 경우인가 — 화면이 색·기호를 이 값으로 고른다 */
    kind: SheetStatusKind;
    /** ▶ ⏸ 🔍 ✅ — 낱말 대신 기호로 (㉯) */
    mark: string;
    /** 읽어 주는 말 (화면에는 기호만 나갈 수도) */
    state: string;
    /** 정거장 번호 (없으면 null) — 화면이 콜 색 동그라미 안에 넣는다 */
    no: number | null;
    /**
     * 🎨 **그 번호가 어느 콜의 것인가 — 색을 여기서 고른다** (규칙 ⑤-3 · 규칙 ③).
     *
     * 🔴 화면이 `next.callNo` 로 칠하면 안 된다. «도착» 경우에는 번호가 **다녀온 정거장**인데
     *    색은 **다음 콜**이 되어 «색 = 번호»가 깨진다 — 색만 보고 1~2초에 누르는 화면에서
     *    그 둘이 어긋나는 것이 가장 큰 사고다. 번호와 색이 **같은 자리**에서 나와야 한다.
     */
    callNo: number | null;
    /** 🎨 상차·하차 — 색이 갈린다 (같은 콜도 상차와 하차가 다른 색이다) */
    stopKind: 'pickup' | 'dropoff' | null;
    /** 잘린 지명 (㉮) */
    name: string;
    /** 가운데 붙는 조각 — 경우마다 다르다 */
    lead: string;
    /** 오른쪽에 붙는 꼬리 */
    tail: string;
    /** 갈 곳이 없을 때의 한 문장 */
    notice: string | null;
    /**
     * 🚩 **출발 조각** — 어느 경우든 붙는다 (기사님 2026-09-15: *"박스는 지우고 내용은 시트 현황 바에 넣어줘 (몇분 지각 / 몇시 출발)"*).
     *    예전엔 시트 맨 위 두 줄 상자(`DepartureCountdown`)였는데 두꺼워 콘텐츠를 가렸다. 근거(주행·정차·약속)는 화면이 `title` 로 든다.
     */
    due: string | null;
}

const none = { mark: '', state: '', no: null, callNo: null, stopKind: null, name: '', lead: '', tail: '', notice: null } as const;

/** 🎨 상차·하차를 색이 아는 낱말로 — 옮기는 곳을 한 군데로 둔다 */
const kindOf = (stop?: '상차' | '하차'): 'pickup' | 'dropoff' | null =>
    stop === '상차' ? 'pickup' : stop === '하차' ? 'dropoff' : null;

export function sheetStatus(i: SheetStatusInput): SheetStatus {
    return { ...sheetStatusCase(i), due: i.due ?? null };
}

/**
 * 🚩 **출발 조각의 말** — 늦었으면 «N분 지각», 아니면 «HH:MM 출발» (기사님 2026-09-15).
 *    `leftMin` 은 출발 시각까지 남은 분(`minutesUntil`), `atHhmm` 은 그 시각. 계산은 `useDepartureDue` 한 곳이다.
 */
export function departureDue(leftMin: number, atHhmm: string): string {
    return leftMin < 0 ? `${-leftMin}분 지각` : `${atHhmm} 출발`;
}

function sheetStatusCase(i: SheetStatusInput): Omit<SheetStatus, 'due'> {
    /**
     * ✅ **도착 — 가장 구체적인 사실이 이긴다.** 콜이 하나도 안 남았어도(마지막 하차)
     *    «대기»보다 «도착»이 먼저다. 떠나면 저절로 «대기»로 넘어간다.
     */
    if (i.arrivedHere) {
        const a = i.arrivedHere;
        const n = i.next;
        return {
            ...none, kind: 'arrived', mark: '✅', state: '도착',
            no: a.visitNo, name: shortStopLabel(a.name),
            callNo: a.callNo ?? null, stopKind: kindOf(a.stop),
            lead: a.stop ? `${a.stop} 도착` : '도착',
            tail: n
                ? `→ ${n.visitNo} ${shortStopLabel(n.name)}${n.stop ? ` ${n.stop}` : ''}`
                : '마지막입니다',
        };
    }

    /** 🈳 대기 — 할 일이 없다 */
    if (i.idle) return { ...none, kind: 'idle', notice: '진행 중인 콜이 없습니다 · 새 콜을 기다립니다' };

    /**
     * 🪧 판정중 — **갈 곳이 없을 때만** 이 말을 한다 (B3 · 2026-09-05 정정).
     *    주행 중에 합짐이 오면 달리면서 보는 줄에서 «다음 갈 곳»이 사라지면 안 된다.
     *    판정은 판정 영역이 말한다.
     */
    if (i.judging && !i.next) return { ...none, kind: 'judging', notice: '새 콜을 판정하고 있습니다' };

    /**
     * 🏁 갈 곳이 없다 — 오늘 한 일이 있다. «대기»(오늘 아무것도 없음)와 다른 말이다 (B4).
     * 🗓️ 2026-09-15 — 사이클 = 하루라 콜 사이 빈 차마다 «사이클을 마쳤습니다»가 뜨면 거짓말이다 (화면규칙 E12).
     */
    if (!i.next) return { ...none, kind: 'done', notice: i.doneToday ? `오늘 ${i.doneToday}콜 마침 · 새 콜 대기` : '새 콜 대기' };

    const n = i.next;
    const base = { no: n.visitNo, name: shortStopLabel(n.name),
                   callNo: n.callNo ?? null, stopKind: kindOf(n.stop) };

    /**
     * 🔍 찾기 — 눈으로 찾는 거리다. **직선이 맞다**(위 주석 참조).
     *    100m 눈금으로 내림해 «300m 전»처럼 말한다 — 매 미터 바뀌면 읽을 수 없다.
     */
    if (i.nearMeters != null && i.nearMeters <= NEAR_METERS) {
        const step = Math.max(NEAR_STEP_M, Math.floor(i.nearMeters / NEAR_STEP_M) * NEAR_STEP_M);
        return {
            ...none, ...base, kind: 'near', mark: '🔍', state: '찾는 중',
            lead: `${step}m 전`,
            tail: n.stop ? `${n.stop} · 곧 도착` : '곧 도착',
        };
    }

    /**
     * ▶ 주행 — 달리는 중에 궁금한 것은 «언제 닿나»다.
     *    시각 → 분 → 아무것도. **모르면 지어내지 않고 조각을 뺀다** (규칙 ④).
     */
    if (i.moving) {
        return {
            ...none, ...base, kind: 'moving', mark: '▶', state: '이동 중',
            lead: i.etaHhmm ? `${i.etaHhmm} 도착예정`
                : i.driveMinutes != null ? `~${i.driveMinutes}분 뒤` : '가는 중',
            tail: [n.callNo != null ? `${n.callNo}번 콜` : null, n.stop].filter(Boolean).join(' · '),
        };
    }

    /**
     * ⏸ 정차 — 서 있을 때 궁금한 것은 «얼마나 더»다.
     *    🔴 **도로 기준 km 가 없으면 그 조각만 뺀다** — 직선으로 채우지 않는다.
     */
    return {
        ...none, ...base, kind: 'stopped', mark: '⏸', state: '정차 중',
        lead: i.remainKm != null ? `${i.remainKm}km 남음` : '',
        /* 🚩 출발 조각이 붙으면 «정차 중»을 뺀다 — ⏸ 기호가 이미 말한다(㉯) · 한 줄 56칸 (B5) */
        tail: [n.stop, i.due ? null : '정차 중'].filter(Boolean).join(' · '),
    };
}

/** 한글 2칸 · 그 밖 1칸으로 센 폭 — 폰 400px·13px 한 줄이 약 56칸이다 */
export function textWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! > 0x1100 ? 2 : 1;
    return w;
}

/** 화면에 실제로 나가는 한 줄 (길이를 재기 위한 것 — 그리기는 화면이 한다) */
export function sheetStatusLine(s: SheetStatus): string {
    if (s.notice) return [s.notice, s.due].filter(Boolean).join(' ');
    return [s.mark, s.no != null ? `${s.no}` : '', s.name, s.lead, s.tail, s.due].filter(Boolean).join(' ');
}
