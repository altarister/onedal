/**
 * 시간 — 정차 · 도착 · 여유 · 마감을 **한 파일에서** 다룬다.
 *
 * [2026-08-12 리팩토링] 예전에는 시간 계산이 네 파일에 흩어져 있었다.
 *   `cargoTags.ts`  에 여유 계산이 (성질 파일인데)
 *   `cargoUnits.ts` 에 정차 시간과 시각 슬롯이 (단위 파일인데)
 *   `callSteps.ts`  에 남은 주행 시간이
 *   `deadlines.ts`  에 마감이
 * 어디를 고쳐야 하는지 찾는 데만 시간이 들었고, 같은 계산이 두 곳에서 복제됐다.
 *
 * 이 파일이 **시간에 관한 유일한 자리**다. 단위(`cargoUnits`)와 성질(`cargoTags`)은
 * 각자의 것만 남기고, 여기서 그 값을 읽어 시간으로 환산한다. 의존은 한 방향뿐이다.
 */
import { unitPoints } from './cargoUnits';
import { protectionMinutes, afterworkMinutes, AFTERWORK_MINUTES } from './cargoUnits';
import type { CargoReport } from './index';
import { parseCargoHints } from './cargoHints';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상하차 소요 시간 (dwell time)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 상하차에 걸리는 시간(분).
 *
 * 🔴 지금까지 경로 시간은 **주행 시간만** 셌다. 수작업 상하차 두 번이면 한 시간이 그냥 사라지는데
 *    그걸 무시하고 "우회 +20분이면 양호"라고 판정했다. 실제로는 +20분이 아니라 +80분이었다.
 *
 * 점수 축은 **라면박스**다 (2026-08-17 · 1박스=1점 · 파레트=40점).
 * 지금 계수는 아래 블록(`DWELL_BASE`·`DWELL_PER_POINT`)에 있다 — **여기 숫자를 또 적지 않는다.**
 *
 * ⚠️ 예전 이 자리에는 `기본 10~15분 + 점수×0.1125/0.375` 라는 **네 개의 계수**가
 *    현재형으로 적혀 있었다. 2026-08-18 에 «기본 시간을 0 으로» 갈라낸 뒤로 코드에
 *    없는 값이었는데, 계수를 확인하러 오는 첫 눈길이 닿는 자리라 그대로 믿기 쉬웠다
 *    (2026-08-29 정정). 지금 값으로 같은 예를 다시 들면:
 *      지게차 파레트 2개(80점)  → 80 × 0.05  = **4분**
 *      수작업 라면박스 30개     → 30 × 1/3   = **10분**  (기사님이 든 다마스 예시)
 */
/**
 * 🔴 **축을 다시 갈랐다** (기사님 확정 2026-08-18).
 *    방법 = *"짐을 손으로 내리거나 싣는 행위만"* · 보호 = 안전 조치(`PROTECTION_MINUTES`).
 *    기사님: *"지게차 19 · 수작업 45 … 그때는 안전이라는 값이 없었으니 두리뭉실 넣은 값이야."*
 *
 *    그래서 **기본 시간을 0 으로 없앴다** — 찾기·대기 명목으로 붙어 있던 10~20분이다.
 *    수량에만 비례시키면 값이 저절로 도출된다:
 *      수작업 박스당 20초 → 다마스 30박스 = **10분** (기사님이 든 예시 그대로)
 *      지게차 파레트당 2분(박스당 3초) → 1t 파레트 2개 = **4분**
 *    검수는 **하차의 후작업**으로 옮겼다 (기사님 2026-08-18) — 방법에는 이제 둘뿐이다.
 */
export const DWELL_BASE: Record<string, number> = { '지게차': 0, '수작업': 0 };
export const DWELL_PER_POINT: Record<string, number> = { '지게차': 0.05, '수작업': 1 / 3 };   // 박스당 분 — 지게차 3초(파레트 2분) · 수작업 20초

/**
 * 방법을 모를 때 쓰는 **일반값** — 상차와 하차가 다르다 (기사님 확정 2026-08-15).
 *
 * 🔴 예전에는 둘 다 `20분` 이었고 주석이 *"낙관하지 않는다"* 며 **비관을 명시**했다.
 *    상차 20 + 하차 20 = 40분이 주행 시간에 얹혀, `+6분` 짜리 콜이 `+46분` 이 되어 똥이 됐다.
 *
 *    기사님: *"**일반적인 값**을 넣어두고 미확인으로 표시하면 좋을 듯. 그럼 계산은 일반값으로
 *    하면 꿀콜이 되어 **잡은 후 내가 전화하여 확정**하면 되니까."* (규칙 ⑤-2)
 *
 *    상차가 더 걸리는 이유도 기사님 말이다 — **상차에는 결박이 붙는다.**
 */
export const DWELL_UNKNOWN_PICKUP_MINUTES = 15;    // 찾기 + 상차 + 결박
export const DWELL_UNKNOWN_DROPOFF_MINUTES = 10;   // 찾기 + 하차

/**
 * 모를 때 쓸 일반값을 **밖에서 넘길 수 있다** (2026-08-16).
 * 안 넘기면 아래 상수를 쓴다 — 그 상수는 `user_judgment` 테이블의 `DEFAULT` 와 같은 값이다.
 * 기사님이 관제웹에서 값을 바꾸면 **서버가 DB 값을 여기로 넘긴다.**
 */
export interface DwellUnknown {
    pickupDwellMin: number;
    dropoffDwellMin: number;
    /**
     * 📦 **박스 하나에 걸리는 시간(분)** — 판정 기준 탭에서 온다 (2026-08-29 화면으로 올림).
     *    안 실려 오면 아래 `DWELL_PER_POINT` 상수를 쓴다 (되돌리는 길).
     */
    perBoxMin?: { forkliftMin: number; manualMin: number };
    /** 🧹 후작업 시간(분) — 「검수」가 붙이는 60분이 여기 산다 */
    afterworkMin?: Record<string, number>;
}

export function dwellMinutes(
    handling?: string | null,
    points = 0,
    /** 어느 정거장인가 — 모를 때 쓰는 일반값이 다르다. 안 넘기면 상차(더 긴 쪽)로 본다 */
    stop: 'pickup' | 'dropoff' = 'pickup',
    unk?: DwellUnknown,
    /** 🔒 보호(상차) — 묶는 자리 · 🧹 후작업(하차) — 내린 뒤의 일. 정거장에 따라 하나만 붙는다 */
    protections?: readonly string[] | null,
    afterworks?: readonly string[] | null,
): number {
    const unknown = stop === 'dropoff'
        ? (unk?.dropoffDwellMin ?? DWELL_UNKNOWN_DROPOFF_MINUTES)
        : (unk?.pickupDwellMin ?? DWELL_UNKNOWN_PICKUP_MINUTES);
    if (!handling) return unknown;
    const base = DWELL_BASE[handling];
    if (base == null) return unknown;
    /**
     * 🔴 **수량은 늘 있다** (기사님 2026-08-18): *"콜이 들어왔다는 건 어떤 차종의 짐을
     *    부른 것이라는 걸 무조건 알 수밖에 없다."* 신고가 없으면 차종 정원이 들어온다
     *    (`defaultCargoByVehicle` — 화면도 서버도 같은 값). 그래서 수량 0 방어를 뒀다가 지웠다.
     *    다만 **차종조차 못 읽은 콜**은 여전히 있을 수 있어(P3 무결성), 그때만 일반값으로 돈다.
     */
    if (points <= 0) return unknown;
    const extra = stop === 'pickup' ? protectionMinutes(protections) : afterworkMinutes(afterworks, unk?.afterworkMin);
    /** 🔴 판정 기준 탭 값이 있으면 그것, 없으면 옛 상수 (되돌리는 길) */
    const 박스당 = handling === '지게차' ? unk?.perBoxMin?.forkliftMin
                 : handling === '수작업' ? unk?.perBoxMin?.manualMin
                 : undefined;
    return Math.round(base + points * (박스당 ?? DWELL_PER_POINT[handling] ?? 1) + extra);
}

export interface StopTiming {
    /** 상차 정차 시간(분) */
    pickupDwell: number;
    /** 하차 정차 시간(분) */
    dropoffDwell: number;
    /** 상차 + 하차 */
    totalDwell: number;
    /** 방법을 몰라 기본값으로 때운 정거장이 있는가 */
    hasUnknown: boolean;
}

/**
 * 한 콜의 상·하차 정차 시간.
 * 하차 방법을 따로 안 물었으면 상차와 같다고 본다 (지게차로 실었으면 대개 지게차로 내린다).
 */
export function computeStopTiming(
    pickup: { handling?: string | null; unit?: string | null; quantity?: number | null; protections?: string[] | null } | undefined,
    dropoff: { handling?: string | null; afterworks?: string[] | null } | undefined,
    unk?: DwellUnknown,
): StopTiming {
    const points = unitPoints(pickup?.unit, pickup?.quantity);
    const pickupDwell = dwellMinutes(pickup?.handling, points, 'pickup', unk, pickup?.protections);
    const dropoffDwell = dwellMinutes(dropoff?.handling ?? pickup?.handling, points, 'dropoff', unk, null, dropoff?.afterworks);
    return {
        pickupDwell,
        dropoffDwell,
        totalDwell: pickupDwell + dropoffDwell,
        hasUnknown: !pickup?.handling || !(dropoff?.handling ?? pickup?.handling),
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시각 선택 — "몇 시까지 오시면 되요"
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 기사님: *"지금부터 몇 시간인지는 상하차지에서는 관심이 없고 **'몇 시까지 오시면 되요'**
 * 이것이 더 직관적일 듯. 그래서 버튼에 예상 시간이 표시되는 것이 좋을 듯."*
 *
 * 그래서 `[+2시간]` 이 아니라 `[16시]` 를 보여준다. 통화 상대가 말하는 그대로다.
 * 도착 예상 시각(주행+정차)을 넘겨주면 **가장 이른 현실적인 시각부터** 시작한다 —
 * 도착도 못 하는 시각을 고르게 두면 안 된다.
 */
export interface ArrivalSlot {
    /** 정시 ISO */
    iso: string;
    /** 버튼에 찍을 글자 (예: "16시") */
    label: string;
    /** 지금 기준 몇 분 뒤인가 */
    minutesFromNow: number;
}

/**
 * [2026-08-12] 도착 예상 시각부터 **30분 간격**으로 고를 수 있게 한다.
 *
 * 기사님이 실제로 하는 통화:
 *   *"거기까지 가는데 28분 걸려서 **08:39에 도착**하는데, 여기 일을 마무리하고 가야 해서
 *     **9:39에 가도 될까요?**"* → 승낙되면 그 한 시간이 통째로 **합짐 시간**이 된다.
 *   *"아니 빨리 오셔야 해요"* → *"그럼 **9:09**까지 갈게요"* → 30분 여유.
 *
 * 그래서 첫 칸은 **가장 이른 도착 시각 그대로**(여유 0)이고, 그 뒤로 30분씩 늘어난다.
 * 정시(1시간) 단위로는 이 협상이 안 된다 — 30분을 깎는 대화가 실제로 오간다.
 *
 * ⚠️ 버튼에 `여유 N분` 을 따로 쓰지 않는다. 기사님: *"여유 x분은 화면에서 지워도 될 듯."*
 *    첫 칸이 곧 여유 0 이므로 **몇 번째 칸인가가 곧 여유**다. 숫자를 두 벌 두면 읽는 데 시간이 든다.
 *
 * @param minMinutes 지금부터 가장 이른 도착까지 걸리는 시간(분) — **주행만.**
 *                   상하차 정차는 도착 **이후**의 일이라 여기 들어가면 안 된다.
 */
export function buildArrivalSlots(nowMs: number, minMinutes: number, count = 5, stepMin = 30): ArrivalSlot[] {
    const slots: ArrivalSlot[] = [];
    /**
     * 📏 **첫 칸은 "지킬 수 있는 가장 이른 시각"이다** — 여유가 늘 같아야 한다.
     *
     * 🔴 한때 `:00 / :30` 경계로 올렸다가 되돌렸다 (2026-08-19). 중복 칸을 없애려던
     *    것이었는데(버그 대장 #23), 경계로 올리면 **여유가 제멋대로 변한다** —
     *    도착 예상이 17:02 면 여유 28분, 17:29 면 **1분**이다.
     *    기사님: *"격자로 하면 여유 시간의 디폴트 값이 막 변화하는 거잖아."*
     *
     *    중복의 진짜 원인은 격자의 눈금이 아니라 **기준점이 열 때마다 달라진 것**이었다.
     *    그건 호출부가 **저장된 약속을 기준점으로** 넘겨서 푼다 (StopCallSheet).
     */
    const step = stepMin * 60_000;
    const base = nowMs + minMinutes * 60_000;

    for (let i = 0; i < count; i++) {
        const t = new Date(base + i * step);
        t.setSeconds(0, 0);
        slots.push({
            iso: t.toISOString(),
            label: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`,
            minutesFromNow: Math.round((t.getTime() - nowMs) / 60000),
        });
    }
    return slots;
}

/**
 * 🔄 **격자 밑값의 수명** (2026-08-22 실측 — 자정을 걸친 문산읍 콜).
 *
 * 도착시간 격자의 밑값은 **저장된 도착 예상**이다 — 시트는 계산하지 않고, 분 틱에
 * 흔들리지 않는다 (arrivalSlotStability 의 안정성 규칙). 그런데 약속이 깨진 채
 * 자정을 넘기면 다섯 칸이 **전부 과거**가 되어 재약속을 잡을 칸이 없다 —
 * 통화로 확정하는 것이 이 제품의 순서인데 통화의 도구가 죽는다.
 *
 * 그래서 수명을 정한다: **누를 칸이 하나라도 살아 있으면 저장된 밑값 그대로**,
 * 전부 과거가 된 격자만 "지금 + 남은 주행"으로 다시 편다 (죽은 격자에는 지킬
 * 안정성이 남아 있지 않다). 저장된 약속은 지우지 않는다 — ⓘ 로 함께 보인다.
 */
export function slotBaseMs(predictedIso: string, nowMs: number,
                           driveMin?: number | null, count = 5, stepMin = 30): number {
    const base = Date.parse(predictedIso);
    if (base + (count - 1) * stepMin * 60_000 >= nowMs) return base;   // 살아 있는 격자 — 그대로
    return nowMs + Math.max(0, driveMin ?? 0) * 60_000;                // 재약속 모드 — 지금 지킬 수 있는 가장 이른 시각
}

/**
 * 이 짐을 마감까지 배달하고 **남는 시간**(분).
 *
 *   여유 = 마감 시각 − (지금 + 남은 주행 시간)
 *
 * 기사님 예시: 14:00 에 잡았고 마감이 17:00, 남은 주행이 60분이면 → 여유 120분.
 * 그 120분 안에서만 우회할 수 있다.
 *
 * 마감을 모르면 `null` — **모르는 것을 여유가 많다고 가정하면 지각한다.**
 */
export function computeSlackMinutes(
    deadlineAt: string | undefined | null,
    remainingDriveMinutes: number,
    nowMs: number,
): number | null {
    if (!deadlineAt) return null;
    const deadline = new Date(deadlineAt).getTime();
    if (!Number.isFinite(deadline)) return null;
    return Math.round((deadline - nowMs) / 60000) - remainingDriveMinutes;
}

/**
 * 지금 실린 짐들을 고려해 **추가로 허용되는 우회 시간**(분).
 *
 * 하나라도 지각하면 안 되므로 **가장 촉박한 짐 기준**이다.
 * 마감을 아는 짐이 하나도 없으면 `null` → 호출부가 기존 고정 상수로 폴백한다.
 */
/**
 * 🔴 **세 경우를 섞지 않는다** (2026-08-15 기사님 확정).
 *
 *   `null`  마감을 **아무도 모른다**      → 호출부가 일반값(90분)을 쓴다
 *   양수     여유가 이만큼 있다
 *   음수     마감을 정했는데 **이미 늦었다** → 호출부가 합짐을 막는다
 *
 * 예전에는 `Math.max(0, …)` 로 **음수를 0 으로 깎았다.** 그 0 이 곧 한계로 쓰여
 * *"0분 안에 다녀와라"* 가 되었고, `+0분` 짜리 콜조차 똥이 됐다.
 * 실측(2026-08-15): 요금 99,000원 · 우회 `+1.1km` · 주행 `+6분` 짜리가 🟡 로 떴다.
 *
 * **0 은 "한계 0분"이 아니라 "모른다" 또는 "늦었다" 였다.** 뭉개면 둘을 구분할 수 없다.
 */
export function allowedDetourMinutes(slacks: Array<number | null>): number | null {
    const known = slacks.filter((v): v is number => v !== null);
    if (known.length === 0) return null;
    return Math.min(...known);   // 음수를 그대로 돌려준다 — 지각은 지각이라고 말한다
}

/** 여유를 사람이 읽는 말로. 관제탑에 그대로 띄운다 */
export function describeSlack(slack: number | null): { text: string; level: 'none' | 'tight' | 'ok' | 'ample' } {
    if (slack === null) return { text: '약속 미확인', level: 'none' };
    if (slack < 0) return { text: `${-slack}분 지각 예상`, level: 'tight' };
    if (slack < 30) return { text: `여유 ${slack}분 — 촉박`, level: 'tight' };
    if (slack < 90) return { text: `여유 ${slack}분`, level: 'ok' };
    const h = Math.floor(slack / 60);
    return { text: `여유 ${h}시간 ${slack % 60}분 — 합짐 여력 있음`, level: 'ample' };
}

/**
 * **영업일 경계 — 자정.** 기사님 결정(2026-08-12): *"그냥 하차시간을 기준으로 24시를 기준으로."*
 *
 * ⚠️ 아래 `BUSINESS_DAY_END_HOUR`(17시) 와 헷갈리면 안 된다. 둘은 다른 것이다.
 *     17시  — **일과 종료**. "이 시각까지 갖다 준다"는 배송 마감 상한
 *     자정  — **영업일 경계**. 어제와 오늘을 가르는 선. 오늘 필터가 되돌아가는 시점
 *
 * 로컬 날짜 문자열(`2026-08-12`)로 다룬다. 시각 비교보다 날짜 비교가 실수할 자리가 적다.
 */
export function businessDayKey(ms: number): string {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 원칙 1 — 일과 종료. 기사님 결정(2026-08-12): **17시** */
export const BUSINESS_DAY_END_HOUR = 17;

/** 원칙 2 — 이동시간을 뺀 배송 여유(분) */
export const DEFAULT_DELIVERY_SLACK_MINUTES = 120;

/**
 * 오늘(또는 이미 지났으면 내일) 일과 종료 시각.
 *
 * 17시가 지난 뒤 잡은 콜은 그날 안에 못 간다 — 다음 영업일이 마감이다.
 * (기사님: *"전날에 잡은 콜이 내일 오전 9시 도착으로 되어 있다면…"*)
 */
export function businessDayEnd(nowMs: number): number {
    const t = new Date(nowMs);
    t.setHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
    if (t.getTime() <= nowMs) t.setDate(t.getDate() + 1);
    return t.getTime();
}

/**
 * 하차 마감 기본값 = `min(도착예상 + 2시간, 일과 종료)`
 *
 * ⚠️ 일과 종료가 도착예상보다 이르면 **도착예상을 쓴다.** 마감이 도착보다 앞설 수는 없다 —
 *    그러면 여유가 음수가 되어 "이미 지각"이라고 거짓말하게 된다. 여유 0 으로 둔다.
 *
 * @param travelMinutes 지금부터 하차지 도착까지 (이동 + 앞 정거장 작업)
 */
export function defaultDropoffDeadline(nowMs: number, travelMinutes: number): string {
    const arrival = nowMs + travelMinutes * 60_000;
    const preferred = arrival + DEFAULT_DELIVERY_SLACK_MINUTES * 60_000;
    const hard = businessDayEnd(nowMs);
    return new Date(Math.max(arrival, Math.min(preferred, hard))).toISOString();
}

/**
 * **상차 마감 — 콜 잡은 시각 + N분.** 통화 전에도 있어야 여유를 셀 수 있다.
 *
 * 🔴 **이 시각은 "상차지 도착"이 아니라 "물건을 실어 *보내는*" 시각이다** (기사님 2026-08-16):
 *    *"화주의 생각은 보통 **여기서 물건 실어서 몇 시에 보낼 수 있을까**야. 그러니 상차 시간을
 *    포함해야 해. 이건 그냥 룰이라고 생각하고 너의 관념에 픽스시켜."*
 *    그래서 출발 시각을 역산할 때 **상차 정차도 함께 뺀다** (`departureDeadline` 참조).
 *
 * 기본값은 **30분**이다 (`DEFAULT_DEADLINE_RULES.pickupOffsetMinutes`) —
 * 숫자를 여기 적지 않고 그 표를 본다 (규칙 ③).
 *
 * ⚠️ 예전 주석은 *"기본 60분인 이유 — 업계는 교통량 여유를 포함해 한 시간 안에 실어
 *    보낼 수 있다고 본다"* 였다. 그 값은 **60 → 30 으로 재해석되며 바뀌었는데**
 *    (같은 파일 `DEFAULT_DEADLINE_RULES` 주석) 근거 문장까지 옛 값 그대로 남아,
 *    읽는 사람이 60 으로 되돌리고 싶어지게 만들었다 (2026-08-29 정정).
 */
export function defaultPickupDeadline(capturedAtMs: number, offsetMinutes: number): string {
    return new Date(capturedAtMs + offsetMinutes * 60_000).toISOString();
}

/**
 * 🔴 **앱이 한국 시각에 `Z` 를 붙여 보내던 것을 바로잡는다** (2026-08-16).
 *
 * 앱의 옛 형식이 `yyyy-MM-dd'T'HH:mm:ss'Z'` 였다 — 폰의 시간대(KST)로 찍고 **글자 `Z`(=UTC)를
 * 그냥 붙인** 것이다. 서버가 UTC 로 읽으니 **9시간이 밀렸다.**
 * 실측: 09:10 KST 에 잡은 콜이 상차 마감 19:10 이 되어 화면에 **"대기 572분"**(맞게는 32분).
 *
 * 앱은 `XXX`(→ `+09:00`)로 고쳤지만 **재설치 전까지 옛 앱이 계속 보내고, 이미 저장된 값도 있다.**
 * 그래서 서버가 방어한다 — **`Z` 가 붙었는데 그 시각이 미래면** 시간대를 잘못 붙인 것으로 보고
 * 로컬로 다시 읽는다. (콜을 잡은 시각이 미래일 수는 없다)
 *
 * ⚠️ 진짜 UTC 로 보내는 정상 값은 **과거**이므로 이 보정에 걸리지 않는다.
 */
export function parseCapturedAt(iso: string | null | undefined, nowMs: number): number | null {
    if (!iso) return null;
    const asIs = new Date(iso).getTime();
    if (!Number.isFinite(asIs)) return null;
    if (!iso.endsWith('Z') || asIs <= nowMs) return asIs;
    // `Z` 를 떼고 로컬로 읽어 본다 — 그래도 미래면 값 자체가 이상한 것이니 원본을 그대로 쓴다
    const asLocal = new Date(iso.slice(0, -1)).getTime();
    return Number.isFinite(asLocal) && asLocal <= nowMs ? asLocal : asIs;
}

/**
 * **하차 마감 — 상차 마감에서 순산한다.**
 *
 * 🔴 예전에는 반대였다: *하차 도착 예상 + 120분* 을 하차 마감으로 잡고 거기서 상차를 역산했다.
 *    그러면 100km 콜의 마감이 5~6시간 뒤가 되어 **여유가 실제보다 훨씬 크게** 나왔다.
 *
 * ```
 * 하차 마감 = 상차 마감(실어 보내는 시각) + 단독 주행 + 휴식 여유
 * ```
 * 휴식 여유(기본 30분)는 기사님 말이다 — *"1시간 정도 하차지로 이동하면서 30분 정도는
 * 휴게소 가거나 할 수 있을 거야."*
 */
export function dropoffDeadlineFromPickup(
    pickupDeadlineIso: string | null | undefined,
    soloMinutes: number | null | undefined,
    restMarginMinutes: number,
): string | null {
    if (!pickupDeadlineIso || soloMinutes == null) return null;
    const ms = new Date(pickupDeadlineIso).getTime() + (soloMinutes + restMarginMinutes) * 60_000;
    return new Date(ms).toISOString();
}

/**
 * 상차 마감을 **하차 마감에서 역산**한다.
 *
 * 상차 마감은 통화로 정하는 값이지만, 통화 전에도 있어야 대기 예산을 셀 수 있다.
 * 하차 마감을 지키려면 늦어도 언제까지 실어야 하는지는 계산으로 나온다.
 *
 * @param soloMinutes    상차지 → 하차지 이동
 * @param dropoffDwell   하차 작업
 */
export function derivePickupDeadline(
    dropoffDeadlineIso: string | null | undefined,
    soloMinutes: number | null | undefined,
    dropoffDwell: number,
): string | null {
    if (!dropoffDeadlineIso || soloMinutes == null) return null;
    const ms = new Date(dropoffDeadlineIso).getTime() - (soloMinutes + dropoffDwell) * 60_000;
    return new Date(ms).toISOString();
}

/**
 * **최소 출발 시각** — 이 시각까지는 출발해야 상차 약속을 지킨다.
 *
 * 기사님: *"첫 콜을 잡았다면 최소 출발 시간이 카운트다운하면 좋을 듯하다."*
 * *"1번 콜의 상차지까지 30분 걸리고 도착시간에 30분을 더했다면 난 30분 후에 출발해도 되는 것이고,
 * 그 30분 동안 현 위치에서 콜을 더 잡는 거야."*
 *
 * 그 30분이 곧 **대기 예산**이고, 여기서 카운트다운이 나온다.
 */
export function departureDeadline(
    pickupDeadlineIso: string | null | undefined,
    approachMinutes: number | null | undefined,
    /**
     * 🔴 상차 정차. 상차 마감은 **실어 보내는 시각**이므로 주행뿐 아니라 **상차 시간도 빼야** 한다
     *    (기사님 2026-08-16). 예전에는 주행만 빼서 출발 시각이 상차 시간만큼 늦었다 —
     *    그대로 두면 상차지에 정시 도착해도 **약속보다 15분 늦게** 보내게 된다.
     */
    pickupDwellMinutes = 0,
): string | null {
    if (!pickupDeadlineIso || approachMinutes == null) return null;
    const ms = new Date(pickupDeadlineIso).getTime() - (approachMinutes + pickupDwellMinutes) * 60_000;
    return new Date(ms).toISOString();
}

/** 남은 시간(분). 이미 지났으면 음수 — 0 으로 깎지 않는다. 지각은 지각이라고 말해야 한다 */
export function minutesUntil(iso: string | null | undefined, nowMs: number): number | null {
    if (!iso) return null;
    return Math.round((new Date(iso).getTime() - nowMs) / 60_000);
}

/** `28:14` 꼴 카운트다운. 지났으면 `-` 를 붙인다 */
export function formatCountdown(iso: string | null | undefined, nowMs: number): string | null {
    if (!iso) return null;
    const totalSec = Math.round((new Date(iso).getTime() - nowMs) / 1000);
    const neg = totalSec < 0;
    const s = Math.abs(totalSec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const body = h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
    return neg ? `-${body}` : body;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 이 정거장까지 **지금부터** 얼마나 걸리는가
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 2026-08-11 발견한 버그를 막는 함수다.
 *
 * 하차지 통화 화면이 `상차지 → 하차지` 주행 시간만 쓰고 있었다.
 * 아직 상차지에 가지도 않았는데 **현위치 → 상차지 이동과 상차 작업이 통째로 빠져서**,
 * 도착 예상이 실제보다 이르게 나오고 `지각` 판정도 낙관적이었다.
 * 그 화면을 보고 약속하면 **기사님이 못 지킬 시각을 약속하게 된다.**
 *
 * 기사님이 정하신 하차지 통화 문구가 애초에 이 구조였다 —
 * *"**상차를 몇 시까지 완료하면** 이동하는데 얼마가 걸리고 하차지까지 얼마나 걸릴 예정이다."*
 *
 * 그래서 남은 시간을 **어디까지 왔는지(마일스톤)로 파생**시킨다. 화면이 직접 고르지 않는다.
 */
export interface StopLead {
    /** 이 정거장까지 남은 **주행** 시간(분). 한 구간이라도 모르면 `null` — 0 으로 때우지 않는다 */
    driveMinutes: number | null;
    /** 같은 구간의 거리(km). 통화에서 *"몇 km고 몇 분 걸려"* 라고 말한다 */
    driveKm: number | null;
    /** 주행 말고 앞에서 이미 써야 하는 시간(분). 예: 상차 작업 */
    leadMinutes: number;
    /** 그 시간이 무엇인지. 없으면 `null` */
    leadLabel: string | null;
}

export function remainingToStop(p: {
    stop: 'pickup' | 'dropoff';
    /** 현위치 → 상차지 */
    approachMinutes?: number | null;
    approachKm?: number | null;
    /** 상차지 → 하차지 */
    soloMinutes?: number | null;
    soloKm?: number | null;
    /** 상차 작업에 걸리는 시간 */
    pickupDwellMinutes: number;
    arrivedPickup: boolean;
    pickedUp: boolean;
    arrivedDropoff: boolean;
}): StopLead {
    const none = { leadMinutes: 0, leadLabel: null };
    const at = (v?: number | null) => (v != null && v > 0 ? v : null);
    const sum = (a: number | null, b: number | null) => (a != null && b != null ? a + b : null);

    if (p.stop === 'pickup') {
        // 이미 상차지에 서 있으면 더 갈 곳이 없다
        return p.arrivedPickup
            ? { driveMinutes: 0, driveKm: 0, ...none }
            : { driveMinutes: at(p.approachMinutes), driveKm: at(p.approachKm), ...none };
    }

    if (p.arrivedDropoff) return { driveMinutes: 0, driveKm: 0, ...none };
    // 상차를 마쳤으면 남은 건 하차지까지 주행뿐이다
    if (p.pickedUp) return { driveMinutes: at(p.soloMinutes), driveKm: at(p.soloKm), ...none };

    const solo = at(p.soloMinutes), soloK = at(p.soloKm);
    // 상차지에 도착은 했지만 아직 싣지 않았다 — 상차 시간이 남아 있다
    if (p.arrivedPickup) {
        return { driveMinutes: solo, driveKm: soloK, leadMinutes: p.pickupDwellMinutes, leadLabel: '상차' };
    }
    // 아직 상차지에도 못 갔다 — 접근 주행 + 상차 + 하차지까지 주행이 전부 남았다
    return {
        driveMinutes: sum(at(p.approachMinutes), solo),
        driveKm: sum(at(p.approachKm), soloK),
        leadMinutes: p.pickupDwellMinutes,
        leadLabel: '상차',
    };
}

/** 이 단계를 마쳤다고 서버에 보고할 마일스톤 (통화 단계는 마일스톤이 없다) */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 콜 하나의 시간 전체 — **유일한 파생 지점**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 2026-08-12 리팩토링 — `remainingToStop` 은 순수 함수로 잘 뽑아 뒀는데
 *    **그 입력을 만드는 일이 두 화면에 복제**되어 있었다.
 *
 *        PinnedRouteCard:133   pickupDwell = dwellMinutes(...)
 *        DepartureCountdown:52 pickupDwell = dwellMinutes(...)
 *        PinnedRouteCard:426   approachKm  = totalDistanceKm − soloKm
 *        DepartureCountdown:57 approachKm  = totalDistanceKm − soloKm
 *
 *    한쪽만 고치면 **카운트다운과 통화 화면이 다른 시각을 말한다.**
 *    이 레포에서 반복된 사고가 정확히 이 모양이었다 (BB·DD·II·JJ·PP·WW).
 *    파생값을 만들었으면 그 **입력도 한 곳에서** 만들어야 한다.
 */

/** 경로 계산에 필요한 오더 필드만. `SecuredOrder` 전체에 묶이지 않는다 */
export interface TimingOrderFields {
    /**
     * 🔴 **콜을 잡은 시각.** 상차 마감(`잡은 시각 + N분`)의 기준점이다 (기사님 2026-08-16).
     *    없으면 상차 마감을 만들 수 없다 — **지금 시각으로 대신하지 않는다.**
     *    그러면 화면을 열 때마다 마감이 뒤로 밀려 *"영원히 여유가 있다"* 고 거짓말한다.
     */
    capturedAt?: string;
    /** ⏱️ 적요 — 상차 시계("HH:MM상차")를 여기서 읽는다 (두 시계 · ⑯) */
    itemDescription?: string;
    detailMemo?: string;
    approachDurationMin?: number;
    totalDistanceKm?: number;
    kakaoSoloDistanceKm?: number;
    kakaoSoloDurationMin?: number;
    /** 🚚 앱이 화면에서 읽어 보낸 배송거리(km) — 단독 주행 추정의 입력 (soloMinutesOf) */
    deliveryDistance?: number;
}

export interface CallTiming {
    /**
     * 🕒 **도착 약속** — 통화로 정한 "몇 시까지 갈게요" (기사님 확정 2026-08-18).
     * 상차 소요와 분리된 저장값이며, 완료(deadlineAt)는 여기에 소요를 더해 파생한다.
     * 통화 전엔 추정(도착 예상 + 여유 30분) · 접근 주행을 모르면 null.
     */
    pickupPromisedArrivalAt: string | null;
    dropoffPromisedArrivalAt: string | null;

    /** 상차지 → 하차지 (단독 구간) */
    soloKm: number | null;
    soloMinutes: number | null;
    /** 현위치 → 상차지. 따로 저장하지 않으므로 총거리에서 단독을 빼서 구한다 */
    approachKm: number | null;
    approachMinutes: number | null;

    pickupDwell: number;
    dropoffDwell: number;

    arrivedPickup: boolean;
    pickedUp: boolean;
    arrivedDropoff: boolean;

    /** 지금부터 그 정거장까지 (주행 + 앞 정거장 작업) */
    toPickup: StopLead;
    toDropoff: StopLead;

    /** 마감. 통화로 정한 값이 있으면 그것, 없으면 두 원칙으로 추정한다 */
    pickupDeadlineAt: string | null;
    dropoffDeadlineAt: string | null;
    /** 위 마감이 통화값이 아니라 **추정**인가 — 화면이 숨기지 않아야 한다 */
    deadlineEstimated: boolean;

    /** 최소 출발 시각과 그때까지 남은 **대기 예산**(분) */
    departureAt: string | null;
    waitMinutes: number | null;
}

/**
 * 마감을 만드는 규칙. **기본값은 `user_judgment` 테이블에서 온다** —
 * 기사님이 관제웹 「판정 기준」 탭에서 도로 위에서 바꾸실 수 있다.
 */
export interface DeadlineRules {
    /** 콜 잡은 시각 + 이만큼 = 상차 마감 (콜 대기 여유) */
    pickupOffsetMinutes: number;
    /** 통화 전 추정 도착 약속 = 도착 예상 + 이 여유(분) */
    arrivalMarginMinutes?: number;
    /** 상차 마감 + 단독 주행 + 이만큼 = 하차 마감 (휴식 여유) */
    restMarginMinutes: number;
    /** ⏱️ 시한 = 잡은 시각 + 배송 주행 × (이 배율/100) + 픽업 보정 — 업계 관행의 상한 (2026-08-21) */
    deadlineRatioPct?: number;
    deadlinePickupMinutes?: number;
    /** 🚚 배송 주행을 모를 때 쓰는 속도 (km/h) — 판정 기준 탭에서 온다 */
    speedShortKmh?: number;
    speedMidKmh?: number;
    speedLongKmh?: number;
}
export const DEFAULT_DEADLINE_RULES: DeadlineRules = {
    /** ⏱️ 상차 시계 잠정 (⑯ · 2026-08-21) — 잡은 시각 + 이만큼 = 무통보 상차 한계.
     *  옛 뜻("+60 = 완료 마감")에서 재해석·값 60→30 (근거: 소숙 실측 §16-2④) */
    pickupOffsetMinutes: 30,
    /** 🏗️ 잔재 — 여유30·휴게30·픽업 보정은 두 시계로 폐기됐다(⑯). 옛 판정 경로
     *  (deriveCallTiming 마감 사슬)만 아직 읽는다 — dryRun 대체 때 함께 제거 */
    restMarginMinutes: 30,
    arrivalMarginMinutes: 30,
    deadlineRatioPct: 150, deadlinePickupMinutes: 20,
    // 카카오 실측 45건 중앙값 (2026-08-26). 근거는 judgment.ts 의 speed 절에
    speedShortKmh: 25, speedMidKmh: 46, speedLongKmh: 56,
};

/**
 * 🎛️ **판정 기준 탭 → 시간 파생 입력, 한 곳에서** (필터 확정안 구현 1 · 2026-08-21).
 *
 * 탭의 시간 4칸(미확인 정차 2 · 상차 시계 잠정 · 데드라인 배율)을 rules/unk 로 조립한다.
 * 🔴 예전에는 서버(routeTlOf)가 손으로 조립하고 **관제웹은 아예 안 받아 기본값 상수**로
 *    파생했다 — 기사님이 탭에서 잠정을 30→45로 바꾸는 순간 서버(45)와 화면(30)이
 *    갈라지는 잠복 두 목소리(#33 클래스). 조립도 소비도 이 함수 하나를 거친다.
 */
export function derivationInputsOf(cfg: {
    unknown: { pickupDwellMin: number; dropoffDwellMin: number; pickupOffsetMin: number };
    deadline: { ratioPct: number };
    speed?: { shortKmh: number; midKmh: number; longKmh: number };
    dwellPerBox?: { forkliftMin: number; manualMin: number };
    afterwork?: { inspectMin: number };
}): { rules: DeadlineRules; unk: DwellUnknown } {
    return {
        rules: {
            ...DEFAULT_DEADLINE_RULES,
            pickupOffsetMinutes: cfg.unknown.pickupOffsetMin,
            deadlineRatioPct: cfg.deadline.ratioPct,
            ...(cfg.speed ? {
                speedShortKmh: cfg.speed.shortKmh,
                speedMidKmh: cfg.speed.midKmh,
                speedLongKmh: cfg.speed.longKmh,
            } : {}),
        },
        unk: {
            pickupDwellMin: cfg.unknown.pickupDwellMin,
            dropoffDwellMin: cfg.unknown.dropoffDwellMin,
            // 🔴 정차 값도 여기 한 그릇에 실어 나른다 — 만드는 곳이 둘이면 갈라진다 (#33 클래스)
            ...(cfg.dwellPerBox ? { perBoxMin: cfg.dwellPerBox } : {}),
            ...(cfg.afterwork ? { afterworkMin: { ...AFTERWORK_MINUTES, 검수: cfg.afterwork.inspectMin } } : {}),
        },
    };
}

/**
 * ⏱️ **상차 시계** (주선사의 시계 · ⑯) — 적요의 상차 시각 > 잡은 시각 + 잠정.
 * 통화로 굳힌 약속은 호출부(declared)가 이긴다. 파생 한 곳 — 시딩과 타임라인이 같이 쓴다.
 */
export function pickupClockMsOf(
    order: Pick<TimingOrderFields, 'itemDescription' | 'detailMemo'>,
    capturedMs: number, offsetMinutes: number,
): number {
    const hint = parseCargoHints(order.itemDescription, order.detailMemo).promisedAt;
    if (hint) {
        const kstDay = new Date(capturedMs + 9 * 3600_000).toISOString().slice(0, 10);
        const t = Date.parse(`${kstDay}T${hint}:00+09:00`);
        if (Number.isFinite(t) && t >= capturedMs) return t;   // 과거 시각이면 무시
    }
    return capturedMs + offsetMinutes * 60_000;
}

/**
 * 🚚 **단독 배송 주행(분) — 값이 태어나는 자리는 여기 하나다** (기사님 확정 2026-08-26)
 *
 * 기사님: *"상차지를 지났는데 왜 파랑이었는지… 노랑이어야 맞는 것 같은데."*
 *
 * 되돌아가는 37분이 점수를 하나도 못 깎았다. 딱지에 답이 있었다 — `버퍼 잴 약속 없음`.
 * 하차 약속이 `상차 완료 + 단독 배송주행 × 150%` 인데 **그 주행이 없었다.**
 *
 * ── 왜 없었나 ──
 * `dispatchEngine` 이 단독 경로를 **첫짐 분기 안에서만** 잰다. 합짐은 병합 경로만 잰다.
 * 그래서 합짐 콜은 구조적으로 `kakaoSoloDurationMin` 을 가질 수 없었고,
 * 하나가 비어 **셋이 죽었다** — 판정 버퍼 축 · 타임라인 추정 약속 · 단계 시딩 마감.
 * 증상이 셋이라 각각 고치면 폴백만 는다. 그래서 **태어나는 자리를 하나** 만든다.
 *
 * ── 어떻게 채우나 ──
 * 앱이 **이미 배송거리를 보내고 있다**(인성 리스트 두 번째 숫자 · 단가 판정의 입력).
 * 서버는 그걸 `...payload.order` 로 받아 두고 한 번도 안 읽었다.
 * 없는 값을 만드는 게 아니라 **버리던 값을 줍는 것**이다 (규칙 ⑤-2).
 *
 * 🔴 **속도는 하나가 아니다** — 카카오 실측 45건:
 *    `0~3km 27.4 · 3~10km 24.9 · 10~25km 46.1 · 25km+ 56.0 km/h`
 *    짧으면 시내, 길면 국도다. 평균 하나면 짧은 콜을 두 배 빠르게 잰다.
 *
 * 🔴 **실측이 있으면 추정이 덮지 않는다.** 통화 신고 > 카카오 실측 > 거리 환산 순.
 * 🔴 **배송거리조차 없으면 `null` 을 낸다** — 지어내지 않는다 (규칙 ④).
 * ⚠️ `estimated: true` 는 **화면이 «추정»이라고 말해야 한다는 뜻**이다 (규칙 ⑤-2).
 *
 * 🔴 **거리와 시간을 «짝»으로 낸다** (2026-08-26 자기 리뷰에서 잡음).
 *    예전 코드가 정확히 이걸 경고하고 있었다 —
 *    *"거리와 시간을 같은 출처에서 가져와야 한쪽만 되어 속도가 이상해지지 않는다."*
 *    처음 고칠 때 `soloKm` 은 `kakaoSoloDistanceKm`, `soloMinutes` 는
 *    `kakaoSoloDurationMin` 으로 **열쇠를 갈라 뒀다.** 한쪽만 있으면 카카오 거리에
 *    추정 시간이 붙어 **속도가 거짓말한다.** 그래서 한 함수가 둘 다 낸다.
 *    `approachKm = 전체 − solo` 도 이 짝에 기대므로 섞이면 접근 거리까지 틀린다.
 */
export function soloMinutesOf(
    order: {
        kakaoSoloDurationMin?: number | null;
        kakaoSoloDistanceKm?: number | null;
        deliveryDistance?: number | null;
    },
    rules: { speedShortKmh?: number; speedMidKmh?: number; speedLongKmh?: number }
        = DEFAULT_DEADLINE_RULES,
): { minutes: number | null; km: number | null; estimated: boolean } {
    const pos = (v: unknown) => {
        const n = Number(v);
        return v != null && Number.isFinite(n) && n > 0 ? n : null;
    };
    /**
     * ① **실측 시간이 있으면 그것이 이긴다.** 거리는 **같은 출처에서만** 가져온다 —
     *    카카오 거리가 없으면 `null` 로 두고, 화면 거리를 빌려 짝을 맞추지 않는다.
     *    빌려 오면 «카카오 시간 ÷ 화면 거리» 라는 있지도 않은 속도가 만들어진다.
     */
    const mMin = pos(order.kakaoSoloDurationMin);
    const mKm = pos(order.kakaoSoloDistanceKm);
    if (mMin != null) return { minutes: mMin, km: mKm, estimated: false };

    // ② 화면 배송거리 → 구간 속도로 환산. 거리·시간이 같은 출처가 된다
    const km = pos(order.deliveryDistance);
    if (km != null) {
        const kmh = km < 10 ? (rules.speedShortKmh ?? 25)
            : km < 25 ? (rules.speedMidKmh ?? 46)
                : (rules.speedLongKmh ?? 56);
        return { minutes: Math.max(1, Math.round((km / kmh) * 60)), km, estimated: true };
    }

    // ③ 거리만 남았으면 거리만 낸다 — 시간을 지어내지 않는다 (규칙 ④)
    return { minutes: null, km: mKm, estimated: false };
}

export function deriveCallTiming(
    order: TimingOrderFields,
    reports: CargoReport[],
    milestones: { milestone: string }[],
    nowMs: number,
    rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
    /** 미확인 정차 일반값 — 판정 기준 탭에서 (derivationInputsOf). 안 넘기면 기본 상수 */
    unk?: DwellUnknown,
): CallTiming {
    const num = (v: unknown) => (v == null ? null : Number(v));
    // 🚚 단독 구간은 **거리·시간을 한 짝으로** 여기 하나에서 온다 (규칙 ③ — soloMinutesOf)
    const solo = soloMinutesOf(order, rules);
    const soloKm = solo.km;
    const soloMinutes = solo.minutes;
    const totalKm = num(order.totalDistanceKm);
    const approachKm = totalKm != null && soloKm != null ? Math.max(0, totalKm - soloKm) : null;
    const approachMinutes = num(order.approachDurationMin);

    const has = (m: string) => milestones.some(x => x.milestone === m);
    const arrivedPickup = has('ARRIVED_PICKUP');
    const pickedUp = has('PICKED_UP');
    const arrivedDropoff = has('ARRIVED_DROPOFF');

    // 현장 실측이 있으면 그것이 진실이다 — 통화 내용은 아직 추정이다.
    // 통화 전이면 KEEP 이 심어 둔 계획 짐값(차종 기본값)이라도 먹는다 — 시딩과 같은 입력.
    // 이게 없으면 미확인 15분으로 지어내 서버 데드라인과 갈라진다 (규칙 ③ · 2026-08-21)
    const cargoOf = (stop: 'pickup' | 'dropoff') =>
        reports.find(r => r.stopType === stop && r.kind === 'ACTUAL')
        ?? reports.find(r => r.stopType === stop && r.kind === 'DECLARED')
        ?? reports.find(r => r.stopType === stop && r.kind === 'PLANNED');
    const pickupCargo = cargoOf('pickup');
    const dropoffCargo = cargoOf('dropoff');
    const points = unitPoints(pickupCargo?.unit, pickupCargo?.quantity);
    const pickupDwell = dwellMinutes(pickupCargo?.handling, points, 'pickup', unk, pickupCargo?.protections);
    // 하차 방법을 따로 안 물었으면 상차와 같다고 본다 (지게차로 실었으면 대개 지게차로 내린다)
    const dropoffDwell = dwellMinutes(dropoffCargo?.handling ?? pickupCargo?.handling, points, 'dropoff', unk, null, dropoffCargo?.afterworks);

    const base = { approachMinutes, approachKm, soloMinutes, soloKm,
                   pickupDwellMinutes: pickupDwell, arrivedPickup, pickedUp, arrivedDropoff };
    const toPickup = remainingToStop({ ...base, stop: 'pickup' });
    const toDropoff = remainingToStop({ ...base, stop: 'dropoff' });

    // ── 약속: 통화로 정한 값이 언제나 이긴다 ──
    //
    // 🔴 **약속은 도착 시각이다 — 상차 소요와 분리한다** (기사님 확정 2026-08-18).
    //    상차 소요는 짐 양에 따라 변하는 값이라, 완료 기준으로 저장하면 신고할 때마다
    //    약속이 흔들린다 (실측: 40박스 신고 → 갑자기 지각). 전화로 잡는 것은
    //    "몇 시까지 갈게요"(도착)이고, 완료 = 도착 약속 + 지금 추정 소요로 **파생**한다.
    //    옛 행(deadlineAt 만 있는 것)은 그 값을 완료로 그대로 쓴다 — 호환 폴백.
    const addMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
    const pickRep = reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED');
    const dropRep = reports.find(r => r.stopType === 'dropoff' && r.kind === 'DECLARED');
    let pickupPromisedArrivalAt = pickRep?.promisedArrivalAt ?? null;
    let dropoffPromisedArrivalAt = dropRep?.promisedArrivalAt ?? null;
    const declaredPickup = pickupPromisedArrivalAt
        ? addMin(pickupPromisedArrivalAt, pickupDwell)
        : (pickRep?.deadlineAt ?? null);
    const declaredDropoff = dropoffPromisedArrivalAt
        ? addMin(dropoffPromisedArrivalAt, dropoffDwell)
        : (dropRep?.deadlineAt ?? null);

    let dropoffDeadlineAt = declaredDropoff;
    let pickupDeadlineAt = declaredPickup;
    let deadlineEstimated = false;

    /**
     * 🔴 **방향을 뒤집었다** (2026-08-16). 예전에는 *하차 도착 예상 + 120분* 으로 하차 마감을
     *    먼저 잡고 거기서 상차를 역산했다 — 100km 콜이면 마감이 5~6시간 뒤가 되어
     *    여유가 실제보다 훨씬 크게 나왔다.
     *
     *    이제 **상차에서 순산**한다 (기사님 모델):
     * ```
     *    상차 마감 = 콜 잡은 시각 + 60분      (콜 대기 여유 · 실어 **보내는** 시각)
     *    하차 마감 = 상차 마감 + 단독 주행 + 30분  (휴식 여유)
     * ```
     */
    const capturedMs = parseCapturedAt(order.capturedAt, nowMs);
    if (!pickupDeadlineAt && capturedMs != null) {
        // ⏱️ 두 시계 (⑯) — 추정 상차 약속 = max(도착 예상, 상차 시계). 여유30 은 폐기됐다.
        if (approachMinutes != null) {
            const clock = pickupClockMsOf(order, capturedMs, rules.pickupOffsetMinutes ?? 30);
            pickupPromisedArrivalAt = new Date(
                Math.max(capturedMs + approachMinutes * 60_000, clock)).toISOString();
            pickupDeadlineAt = addMin(pickupPromisedArrivalAt, pickupDwell);
        } else {
            pickupDeadlineAt = defaultPickupDeadline(capturedMs, rules.pickupOffsetMinutes);
        }
        deadlineEstimated = true;
    }
    if (!dropoffDeadlineAt) {
        dropoffDeadlineAt = dropoffDeadlineFromPickup(
            pickupDeadlineAt, soloMinutes, rules.restMarginMinutes);
        if (dropoffDeadlineAt) deadlineEstimated = true;
    }

    /**
     * 상차 마감은 **실어 보내는 시각**이므로 주행과 상차 정차를 둘 다 뺀다.
     *
     * 🔴 **이미 상차했으면 출발 시각이 없다.** 기다릴 이유가 사라졌기 때문이다 —
     *    그 콜에 남은 일은 하차뿐이고, 그건 우회 예산(`computeAllowedDetour`) 쪽에서 센다.
     *    예전에는 여기서 값을 내놓고 **화면 한 곳**(`DepartureCountdown` 의 `index >= 4` 검사)이
     *    막고 있었다. 막는 곳이 하나뿐이면 다른 화면이 그 값을 쓰는 순간 잘못된 카운트다운이 뜬다
     *    → 값을 만드는 자리에서 `null` 로 낸다 (2026-08-16 검산에서 발견).
     */
    const departureAt = pickedUp
        ? null
        : departureDeadline(pickupDeadlineAt, toPickup.driveMinutes, pickupDwell);

    /**
     * 통화 전에는 약속이 없어서 화면이 비는데, 마감(완료)은 추정으로라도 늘 있다.
     * 약속(도착)과 완료는 `완료 = 도착 + 정차` 로 묶여 있으므로 (기사님 2026-08-18),
     * 비어 있는 쪽을 **그 등식 하나로** 채운다 — 다른 화면이 각자 역산하지 않게 (규칙 ③).
     */
    pickupPromisedArrivalAt ??= pickupDeadlineAt ? addMin(pickupDeadlineAt, -pickupDwell) : null;
    dropoffPromisedArrivalAt ??= dropoffDeadlineAt ? addMin(dropoffDeadlineAt, -dropoffDwell) : null;

    return {
        pickupPromisedArrivalAt, dropoffPromisedArrivalAt,
        soloKm, soloMinutes, approachKm, approachMinutes,
        pickupDwell, dropoffDwell,
        arrivedPickup, pickedUp, arrivedDropoff,
        toPickup, toDropoff,
        pickupDeadlineAt, dropoffDeadlineAt, deadlineEstimated,
        departureAt,
        waitMinutes: minutesUntil(departureAt, nowMs),
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 경로 타임라인 — 시각의 원천은 "지금 경로" 하나다 (기사님 동의 2026-08-19)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 실측 사고 두 건이 이 함수의 존재 이유다:
 *   ① 합짐 콜의 도착시각이 안 나왔다 — 합짐은 kakaoSolo·approach 가 계산되지 않아
 *      콜별 파생(deriveCallTiming)의 사슬이 끊겼다
 *   ② 카운트다운이 첫짐만 봤다 — 합짐은 출발 마감이 null 이라 후보에서 조용히 빠졌다
 *
 * 콜마다 "혼자 간다"고 가정하지 않고, 서버가 내려준 경로 순서(routeStops) 위에서
 * 주행·정차를 **순서대로 누적**한다:
 *
 *   도착예상ᵢ = 기준시각 + 누적주행ᵢ + Σ(앞 정거장 정차)
 *   약속ᵢ     = 통화 확정  >  경로 추정(도착예상 + 여유 30분)  >  콜별 파생 폴백
 *   출발마감ᵢ = 약속ᵢ − (누적주행ᵢ + Σ(앞 정거장 정차))
 *
 * 🔴 기준시각은 **경로를 계산한 시점**(routeComputedAt)이다. nowMs 를 쓰면 추정 약속이
 *    매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다 — 약속은 잡히면 고정이다.
 *    (콜별 파생이 capturedAt 에 닻을 내리는 것과 같은 이유)
 *
 * 정차·폴백 약속은 deriveCallTiming 에서 그대로 가져온다 (규칙 ③ — 파생 한 곳).
 */
export interface RouteTimelineEntry {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    /** 도착예상 (ms). 주행분을 모르면 null — 지어내지 않는다 (규칙 ④) */
    etaMs: number | null;
    /** 이 정거장의 정차(분) — 신고값 또는 차종 추정 */
    dwellMinutes: number;
    /**
     * 🧾 여기까지의 **누적 주행(분)** — 모르면 null (규칙 ④).
     * `departByMs` 를 만든 뺄셈의 재료다. 화면은 이 값을 그대로 적기만 한다 (규칙 ③).
     */
    driveMinutes: number | null;
    /**
     * 🧾 앞 정거장들 때문에 **반드시** 더 드는 분 (정차·확정 약속 대기).
     * `출발마감 = 약속 − (driveMinutes + leadMinutes)`.
     * ⚠️ **이 정거장의 정차는 안 들어간다** — 약속은 *도착* 시각이다 (규칙 ⑤-5).
     */
    leadMinutes: number;
    /** "까지" 약속 — 확정 > 경로 추정 > 콜별 파생. 셋 다 없으면 null */
    promisedUntil: string | null;
    /** 통화로 확정한 약속인가 (false = 추정 — 화면은 ~ 를 붙인다) */
    promiseConfirmed: boolean;
    /**
     * 🚚 **앞 정거장에서 여기까지의 주행(분)** — `driveMinutes` 는 닻부터의 **누적**이라
     * 통화 문장에 쓰면 접근 주행을 **두 번** 센다 (기사님 실측 2026-08-20: `주행 129분`,
     * 참값 113분). 첫 정거장은 앞이 없으므로 누적과 같다. 모르면 `null`.
     */
    segmentDriveMinutes: number | null;
    /**
     * 🚚 **앞 정거장을 떠나는 시각 (ms)** — 통화에서 *"…에서 8분 상차하고 17:03 출발"* 이라고
     * 말하는 그 시각이다. `앞 정거장 약속(확정 > 추정) + 그 정거장 정차`.
     * 첫 정거장은 떠나 온 곳이 없어 `null` 이다 (규칙 ④ — 0 이 아니다).
     *
     * ⚠️ 루프 안의 `carriedMs` 와 **뜻이 다르다.** 저건 *물리적으로 가능한 가장 이른 출발*
     *    (도착예상 기준)이라 도착예상 누적에 쓰고, 이건 *약속대로 갔을 때의 출발* 이라
     *    화면이 말한다. 섞으면 추정 약속의 여유 30분이 뒤로 계속 전파된다.
     */
    departPrevMs: number | null;
    /** 이 약속을 지키기 위한 출발 마감 (ms) */
    departByMs: number | null;
    /**
     * ⚠️ **못 지키는 분** — 경로상 도착예상이 확정 약속을 넘긴 만큼 (0 이면 지킬 수 있다).
     * 재계산으로 경로가 바뀌든 앞 약속이 늦춰지든, 깨지는 자리는 여기 하나다.
     */
    lateMinutes: number;
    /** 이미 다녀온 정거장인가 — 지나간 곳의 기준은 약속이 아니라 실제 시각이다 */
    arrived: boolean;
}

/** 이 정거장에 실제로 도착한 시각 (없으면 null) — 도착·완료 어느 쪽이든 도착으로 본다 */
function arrivedMs(
    ms: { milestone: string; occurredAt?: string }[],
    stopType: 'pickup' | 'dropoff',
): number | null {
    const names = stopType === 'pickup'
        ? ['ARRIVED_PICKUP', 'PICKED_UP']
        : ['ARRIVED_DROPOFF', 'DELIVERED'];
    for (const m of ms) {
        if (names.includes(m.milestone) && m.occurredAt) return Date.parse(m.occurredAt);
    }
    return null;
}

export function deriveRouteTimeline(
    stops: Array<{ orderId: string; stopType: 'pickup' | 'dropoff'; driveMinutes: number | null }>,
    orders: TimingOrderFields[],
    reportsOf: (orderId: string) => CargoReport[],
    milestonesOf: (orderId: string) => { milestone: string; occurredAt?: string }[],
    nowMs: number,
    routeComputedAt?: string | null,
    rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
    /** 미확인 정차 일반값 — 판정 기준 탭에서 (derivationInputsOf) */
    unk?: DwellUnknown,
): RouteTimelineEntry[] {
    const byId = new Map(orders.map(o => [(o as any).id as string, o]));
    const timingCache = new Map<string, CallTiming>();
    const anchorMs = routeComputedAt ? Date.parse(routeComputedAt) : nowMs;

    const out: RouteTimelineEntry[] = [];
    /**
     * ⛓️ **앞 정거장을 떠나는 시각이 뒤 정거장의 기준이다** (2026-08-19 코드리뷰).
     *
     * 🔴 예전에는 정차와 "부터" 대기만 누적했다. 그래서 **확정한 "까지" 약속이
     *    뒤로 전파되지 않았다** — 실측: 상차를 11:12 로 약속했는데 하차 추정이
     *    11:51 로 떴다 (11:12 + 상차 8분 + 주행 97분 = 12:57 이 물리적 최소).
     *    그 값으로 화주와 약속하면 무조건 지각이다.
     *
     *      출발ᵢ = max(도착예상ᵢ, "부터"ᵢ, 확정 "까지"ᵢ) + 정차ᵢ
     *
     *    "까지"를 기준에 넣는 이유: 화주가 "11:12까지 오세요"라고 했으면 그 전에
     *    가도 상차는 대개 그때 시작된다. 일찍 가는 것을 이득으로 세면 뒤 약속이
     *    낙관으로 잡힌다 — 못 지킬 약속을 화면이 권하게 된다.
     *
     * 출발마감의 기준은 하나 더 갈린다 (기사님 실측 2026-08-19 2회차):
     *   `mandatoryMin` = 정차 + **확정 "까지" 약속으로 생긴 지연**
     *     화면이 동시에 두 말을 했다 — 요약 줄은 `경안동 11:49 ⚠️6분`(못 지킨다),
     *     카운트다운은 `1:22:45 뒤에 출발`(여유가 있다). 앞 정거장에 11:41 까지
     *     있어야 하는 시간을 출발마감에서 안 뺐기 때문이다.
     *     확정 약속으로 생긴 지연은 **줄일 수 없다** — 그 시각까지 거기 있어야 한다.
     *   "부터" 대기는 여전히 안 뺀다 — 늦게 떠나면 저절로 줄어드는 시간이다.
     */
    let carriedMs: number | null = null;   // 앞 정거장을 떠나는 시각 (없으면 닻 기준)
    /** ⏱️ 콜별 상차 완료 예정(약속+정차) — 그 콜의 하차 데드라인 기산점 (두 시계) */
    const pickupDoneOf = new Map<string, number>();
    // 화면이 말하는 값 — 위 `carriedMs` 와 뜻이 다르다 (RouteTimelineEntry.departPrevMs 주석)
    let prevDriveMin: number | null = null;
    let prevDepartMs: number | null = null;
    let beforeMin = 0;
    let mandatoryMin = 0;   // 정차 + 확정 약속 지연 (출발마감용)
    for (const st of stops) {
        const order = byId.get(st.orderId);
        if (!order) continue;   // 좀비 정거장 (취소 후 재계산 전) — 만들지 않는다

        let t = timingCache.get(st.orderId);
        if (!t) {
            t = deriveCallTiming(order, reportsOf(st.orderId), milestonesOf(st.orderId), nowMs, rules, unk);
            timingCache.set(st.orderId, t);
        }
        const dwell = st.stopType === 'pickup' ? t.pickupDwell : t.dropoffDwell;
        const etaMs = st.driveMinutes != null
            ? anchorMs + (st.driveMinutes + beforeMin) * 60_000 : null;

        const declared = reportsOf(st.orderId).find(r =>
            r.stopType === st.stopType && r.kind === 'DECLARED' && (r as any).promisedArrivalAt,
        ) as any;
        /**
         * ⏱️ **추정 약속은 두 시계다** (⑯ · 2026-08-21 — 시딩 d257f90 과 같은 규칙).
         *    상차 = max(도착 예상, 상차 시계) — 캡 바닥: 도착 전 시각을 권하지 않는다
         *    하차 = 배달 데드라인 = 상차 완료(실제 PICKED_UP > 이 경로의 상차 약속+정차) + 배송×150%
         *    배송 주행을 모르면(합짐) 하차 추정 없음 — 지어내지 않는다 (규칙 ④).
         *    🔴 통화로 굳힌 약속(declared)은 어느 쪽도 안 깎는다 — 화주 합의가 면책.
         */
        const capturedMs2 = parseCapturedAt(order.capturedAt, nowMs);
        const pickedActualMs = (() => {
            const m = milestonesOf(st.orderId).find(x => x.milestone === 'PICKED_UP' && x.occurredAt);
            return m ? Date.parse(m.occurredAt!) : null;
        })();
        const estMs = (() => {
            if (st.stopType === 'pickup') {
                if (capturedMs2 == null) return etaMs;
                const clock = pickupClockMsOf(order, capturedMs2, rules.pickupOffsetMinutes ?? 30);
                return etaMs != null ? Math.max(etaMs, clock) : clock;
            }
            /**
             * 🚚 **상차지에 도착하면 «상차 완료 예정»을 잃고 있었다** (기사님 실측 2026-08-26).
             *
             * 하차 약속 = `상차 완료 + 단독 주행 × 150%` 인데 그 앞쪽이 비었다:
             *   · 실측(`PICKED_UP`) — 기사님이 **보고해야** 생긴다
             *   · 예정(`pickupDoneOf`) — **경로에 상차 정거장이 남아 있을 때만** 채워진다
             * 도착하는 순간 정거장이 빠지므로 **둘 다 없어진다.** 그래서 같은 판에서도
             * 상차 전 후보는 버퍼 축이 있고(07 · +184분), 상차 후 후보는 통째로 빠졌다
             * (28 · 「버퍼 잴 약속 없음」) — 되돌아가는 콜이 후하게 나온 이유다.
             *
             * 🔴 **도착 실측은 갖고 있다** (`ARRIVED_PICKUP` · GPS). CLAUDE.md ⑤-5 가
             *    답을 이미 적어 뒀다 — *"완료 시각은 도착 + 지금 추정 상차 소요로 파생한다."*
             *    없는 값을 만드는 게 아니라 **있는 값에서 파생**하는 것이다 (규칙 ③).
             * ⚠️ 순서: 실측 완료 > 경로상 예정 > **도착 실측 + 정차**. 뒤로 갈수록 약하다.
             */
            const arrivedPickupMs = (() => {
                const m = milestonesOf(st.orderId).find(
                    x => x.milestone === 'ARRIVED_PICKUP' && (x as any).occurredAt);
                return m ? Date.parse((m as any).occurredAt) : null;
            })();
            const loadedBase = pickedActualMs
                ?? pickupDoneOf.get(st.orderId)
                ?? (arrivedPickupMs != null ? arrivedPickupMs + t.pickupDwell * 60_000 : null);
            if (loadedBase == null || t.soloMinutes == null) return null;
            const deadline = loadedBase + t.soloMinutes * (rules.deadlineRatioPct ?? 150) / 100 * 60_000;
            return etaMs != null ? Math.max(etaMs, deadline) : deadline;
        })();
        const promisedUntil: string | null = declared?.promisedArrivalAt
            ?? (estMs != null ? new Date(estMs).toISOString() : null);

        /**
         * ⚠️ 실현가능성 — 경로상 도착예상이 **확정** 약속을 넘겼는가.
         *    추정 약속은 도착예상에서 파생되므로 넘길 수가 없다 (확정만 검사한다).
         */
        /**
         * 🚚 **지나간 정거장의 기준은 실제 시각이다** (기사님 실측 2026-08-19, 모의주행).
         *
         * 출발 후 화면이 통째로 미래로 튀었다 — `경안동 13:00 → 금촌동 17:00`,
         * `초월읍 12:00 ⚠️78분`, `-1:19:58 출발 시각이 지났습니다`. 그런데 장부에는
         * **10:37 에 경안동 도착·상차 완료**로 남아 있었다. 타임라인이 "13:00(확정 약속)
         * 까지 못 떠난다"고 보고 뒤를 전부 밀었다 — **이미 끝난 일인데.**
         *
         * 약속은 아직 가지 않은 정거장에만 유효하다. 다녀온 곳은 실제 시각이 이긴다.
         */
        const actualMs = arrivedMs(milestonesOf(st.orderId), st.stopType);
        //    이미 다녀온 정거장은 지각으로 세지 않는다 — 끝난 일이다
        const lateMinutes = actualMs == null && declared && etaMs != null && promisedUntil
            ? Math.max(0, Math.round((etaMs - Date.parse(promisedUntil)) / 60_000)) : 0;

        out.push({
            orderId: st.orderId, stopType: st.stopType,
            etaMs, dwellMinutes: dwell,
            driveMinutes: st.driveMinutes, leadMinutes: mandatoryMin,
            segmentDriveMinutes: st.driveMinutes != null && prevDriveMin != null
                ? st.driveMinutes - prevDriveMin : st.driveMinutes,
            departPrevMs: prevDepartMs,
            promisedUntil,
            promiseConfirmed: !!declared,
            departByMs: actualMs == null && promisedUntil != null && st.driveMinutes != null
                ? Date.parse(promisedUntil) - (st.driveMinutes + mandatoryMin) * 60_000 : null,
            lateMinutes,
            arrived: actualMs != null,
        });

        /**
         * 이 정거장을 **떠나는 시각**을 다음으로 넘긴다.
         *   도착예상 · "부터"(일찍 가도 소용없음) · 확정 "까지"(그때 시작한다) 중 가장 늦은 것 + 정차
         */
        /**
         * 🚚 **화면이 말하는 출발** — 다녀왔으면 실제 시각, 아니면 약속(확정 > 추정),
         *    둘 다 없으면 도착예상. 거기에 이 정거장의 정차를 더한다.
         */
        const leaveBase = actualMs ?? (promisedUntil ? Date.parse(promisedUntil) : etaMs);
        prevDepartMs = leaveBase != null ? leaveBase + dwell * 60_000 : null;
        prevDriveMin = st.driveMinutes;
        // ⏱️ 이 콜의 상차 완료 예정 — 하차 데드라인의 기산점 (실측 PICKED_UP 이 있으면 그쪽이 이김)
        if (st.stopType === 'pickup' && prevDepartMs != null) pickupDoneOf.set(st.orderId, prevDepartMs);

        const fromAt = declared?.promisedArrivalFromAt ? Date.parse(declared.promisedArrivalFromAt) : null;
        const confirmedUntil = declared && promisedUntil ? Date.parse(promisedUntil) : null;
        const startMs = actualMs ?? Math.max(etaMs ?? 0, fromAt ?? 0, confirmedUntil ?? 0);
        if (etaMs != null) {
            carriedMs = startMs + dwell * 60_000;
            // 다음 정거장의 도착예상 = 닻 + (누적 주행 + beforeMin) 이므로,
            // 떠나는 시각과의 차이를 beforeMin 에 실어 보낸다 (누적 축은 하나로 둔다)
            beforeMin = Math.round((carriedMs - anchorMs) / 60_000) - st.driveMinutes!;
            // 출발마감용 — 확정 약속 때문에 **반드시** 늦어지는 만큼만 더한다
            const forcedMin = actualMs != null
                ? Math.max(0, Math.round((actualMs - etaMs) / 60_000))
                : confirmedUntil != null
                ? Math.max(0, Math.round((confirmedUntil - etaMs) / 60_000)) : 0;
            mandatoryMin += dwell + forcedMin;
        } else {
            beforeMin += dwell;
            mandatoryMin += dwell;
        }
    }
    return out;
}

/**
 * **어떤 콜이건 가장 빨리 나가야 하는** 정거장 (기사님 2026-08-19).
 * 상차만 보지 않는다 — 하차 약속이 빡빡하면 그게 출발을 묶는다.
 */
export function pickBindingDeparture(timeline: RouteTimelineEntry[]): RouteTimelineEntry | null {
    let best: RouteTimelineEntry | null = null;
    for (const e of timeline) {
        if (e.departByMs == null) continue;
        if (!best || e.departByMs < best.departByMs!) best = e;
    }
    return best;
}

/** 경로 전체에서 가장 빡빡한 약속의 여유 — 시간체계 ⑯-1 "화면 표시 = 내 콜 전부의 최소값" */
export interface RouteBufferMin {
    /** 약속 − 도착 예상 (분). 음수 = 이미 못 지키는 약속이 있다 */
    minutes: number;
    /** 묶는 약속이 통화로 굳었나 (false = 추정 — 화면은 ~ 를 붙인다) */
    firm: boolean;
    orderId: string;
    stopType: 'pickup' | 'dropoff';
}

/**
 * 🧮 **버퍼의 진실은 최소값이다** (기사님 실측 2026-08-20, 12번+2번 리허설).
 *
 * 콜별 버퍼가 +60분이어도 **다른 콜의 약속**이 +6분이면 합짐에 쓸 수 있는 시간은
 * 6분이다 — 콜마다 자기 값만 보여주면 "여유 있구나" 하고 잡았다가 다른 약속을 깬다.
 * 그래서 화면이 예산으로 내미는 숫자는 **아직 안 간 정거장 전부의 최소값** 하나다.
 *
 * 콜별 칩(내 약속의 여유)과 뜻이 다르다 — 칩은 "이 콜은 어떤가", 이것은 "지금
 * 경로에 무엇을 더 실을 수 있는가". 판정 재설계의 `bufferCost` 축도 이 값을 먹는다.
 */
export function minRouteBuffer(timeline: RouteTimelineEntry[]): RouteBufferMin | null {
    let best: RouteBufferMin | null = null;
    for (const e of timeline) {
        if (e.arrived || e.promisedUntil == null || e.etaMs == null) continue;
        const minutes = Math.round((Date.parse(e.promisedUntil) - e.etaMs) / 60_000);
        if (!best || minutes < best.minutes) {
            best = { minutes, firm: e.promiseConfirmed, orderId: e.orderId, stopType: e.stopType };
        }
    }
    return best;
}
