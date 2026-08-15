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
import type { CargoReport } from './index';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상하차 소요 시간 (dwell time)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 상하차에 걸리는 시간(분).
 *
 * 🔴 지금까지 경로 시간은 **주행 시간만** 셌다. 수작업 상하차 두 번이면 한 시간이 그냥 사라지는데
 *    그걸 무시하고 "우회 +20분이면 양호"라고 판정했다. 실제로는 +20분이 아니라 +80분이었다.
 *
 * 기본 시간 + 짐 양에 비례하는 시간으로 잡는다.
 *   지게차 + 파레트 2개(30점)  → 10 + 30×0.3 = 19분
 *   수작업 + 라면박스 40개(10점) → 15 + 10×1.5 = 30분
 *   수작업 + 파레트 2개(30점)   → 15 + 30×1.5 = 60분   (수작업으로 파레트는 정말 오래 걸린다)
 */
const DWELL_BASE: Record<string, number> = { '지게차': 10, '수작업': 15, '호이스트': 20, '검수': 90 };
/**
 * 🔴 `검수` 는 0 이다 (기사님 지시: "검수는 90분"). 물건을 하나하나 확인받는 자리라
 *    수량이 아니라 **절차**가 시간을 먹는다. 여기를 비워 두면 아래 `?? 1` 폴백이
 *    점수당 1분을 붙여 파레트 2개에 120분이 되어 버린다 — 반드시 명시한다.
 */
const DWELL_PER_POINT: Record<string, number> = { '지게차': 0.3, '수작업': 1.5, '호이스트': 1.0, '검수': 0 };

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
export interface DwellUnknown { pickupDwellMin: number; dropoffDwellMin: number }

export function dwellMinutes(
    handling?: string | null,
    points = 0,
    /** 어느 정거장인가 — 모를 때 쓰는 일반값이 다르다. 안 넘기면 상차(더 긴 쪽)로 본다 */
    stop: 'pickup' | 'dropoff' = 'pickup',
    unk?: DwellUnknown,
): number {
    const unknown = stop === 'dropoff'
        ? (unk?.dropoffDwellMin ?? DWELL_UNKNOWN_DROPOFF_MINUTES)
        : (unk?.pickupDwellMin ?? DWELL_UNKNOWN_PICKUP_MINUTES);
    if (!handling) return unknown;
    const base = DWELL_BASE[handling];
    if (base == null) return unknown;
    return Math.round(base + points * (DWELL_PER_POINT[handling] ?? 1));
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
    pickup: { handling?: string | null; unit?: string | null; quantity?: number | null } | undefined,
    dropoff: { handling?: string | null } | undefined,
    unk?: DwellUnknown,
): StopTiming {
    const points = unitPoints(pickup?.unit, pickup?.quantity);
    const pickupDwell = dwellMinutes(pickup?.handling, points, 'pickup', unk);
    const dropoffDwell = dwellMinutes(dropoff?.handling ?? pickup?.handling, points, 'dropoff', unk);
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
    const base = nowMs + minMinutes * 60_000;

    for (let i = 0; i < count; i++) {
        const t = new Date(base + i * stepMin * 60_000);
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
    if (slack === null) return { text: '마감 미확인', level: 'none' };
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
 * 상차 마감을 **하차 마감에서 역산**한다.
 *
 * 상차 마감은 통화로 정하는 값이지만, 통화 전에도 있어야 대기 예산을 셀 수 있다.
 * 하차 마감을 지키려면 늦어도 언제까지 실어야 하는지는 계산으로 나온다.
 *
 * @param soloMinutes    상차지 → 하차지 이동
 * @param dropoffDwell   하차 작업
 */
/**
 * **상차 마감 — 콜 잡은 시각 + N분.** 통화 전에도 있어야 여유를 셀 수 있다.
 *
 * 🔴 **이 시각은 "상차지 도착"이 아니라 "물건을 실어 *보내는*" 시각이다** (기사님 2026-08-16):
 *    *"화주의 생각은 보통 **여기서 물건 실어서 몇 시에 보낼 수 있을까**야. 그러니 상차 시간을
 *    포함해야 해. 이건 그냥 룰이라고 생각하고 너의 관념에 픽스시켜."*
 *    그래서 출발 시각을 역산할 때 **상차 정차도 함께 뺀다** (`departureDeadline` 참조).
 *
 * 기본 60분인 이유 — 화주가 주선사에 전화하고 기사가 콜을 잡는 흐름에서, 업계는
 * **교통량 여유를 포함해 한 시간** 안에 실어 보낼 수 있다고 본다.
 */
export function defaultPickupDeadline(capturedAtMs: number, offsetMinutes: number): string {
    return new Date(capturedAtMs + offsetMinutes * 60_000).toISOString();
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
 *        PinnedRouteCard:115   soloKm = osrmSoloDistanceKm ?? kakaoSoloDistanceKm
 *        DepartureCountdown:48 soloKm = osrmSoloDistanceKm ?? kakaoSoloDistanceKm
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
    approachDurationMin?: number;
    totalDistanceKm?: number;
    kakaoSoloDistanceKm?: number;
    kakaoSoloDurationMin?: number;
    osrmSoloDistanceKm?: number;
    osrmSoloDurationMin?: number;
}

export interface CallTiming {
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
    /** 상차 마감 + 단독 주행 + 이만큼 = 하차 마감 (휴식 여유) */
    restMarginMinutes: number;
}
export const DEFAULT_DEADLINE_RULES: DeadlineRules = { pickupOffsetMinutes: 60, restMarginMinutes: 30 };

export function deriveCallTiming(
    order: TimingOrderFields,
    reports: CargoReport[],
    milestones: { milestone: string }[],
    nowMs: number,
    rules: DeadlineRules = DEFAULT_DEADLINE_RULES,
): CallTiming {
    const num = (v: unknown) => (v == null ? null : Number(v));
    // OSRM 이 있으면 그쪽이 더 정확하다. **거리와 시간을 같은 출처에서** 가져와야
    // 한쪽만 OSRM 이 되어 속도가 이상해지는 일이 없다
    const useOsrm = order.osrmSoloDistanceKm != null;
    const soloKm = num(useOsrm ? order.osrmSoloDistanceKm : order.kakaoSoloDistanceKm);
    const soloMinutes = num(useOsrm ? order.osrmSoloDurationMin : order.kakaoSoloDurationMin);
    const totalKm = num(order.totalDistanceKm);
    const approachKm = totalKm != null && soloKm != null ? Math.max(0, totalKm - soloKm) : null;
    const approachMinutes = num(order.approachDurationMin);

    const has = (m: string) => milestones.some(x => x.milestone === m);
    const arrivedPickup = has('ARRIVED_PICKUP');
    const pickedUp = has('PICKED_UP');
    const arrivedDropoff = has('ARRIVED_DROPOFF');

    // 현장 실측이 있으면 그것이 진실이다 — 통화 내용은 아직 추정이다
    const pickupCargo = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
                     ?? reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED');
    const dropoffCargo = reports.find(r => r.stopType === 'dropoff' && r.kind === 'ACTUAL')
                      ?? reports.find(r => r.stopType === 'dropoff' && r.kind === 'DECLARED');
    const points = unitPoints(pickupCargo?.unit, pickupCargo?.quantity);
    const pickupDwell = dwellMinutes(pickupCargo?.handling, points, 'pickup');
    // 하차 방법을 따로 안 물었으면 상차와 같다고 본다 (지게차로 실었으면 대개 지게차로 내린다)
    const dropoffDwell = dwellMinutes(dropoffCargo?.handling ?? pickupCargo?.handling, points, 'dropoff');

    const base = { approachMinutes, approachKm, soloMinutes, soloKm,
                   pickupDwellMinutes: pickupDwell, arrivedPickup, pickedUp, arrivedDropoff };
    const toPickup = remainingToStop({ ...base, stop: 'pickup' });
    const toDropoff = remainingToStop({ ...base, stop: 'dropoff' });

    // ── 마감: 통화로 정한 값이 언제나 이긴다 ──
    const declaredPickup = reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED')?.deadlineAt ?? null;
    const declaredDropoff = reports.find(r => r.stopType === 'dropoff' && r.kind === 'DECLARED')?.deadlineAt ?? null;

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
    if (!pickupDeadlineAt && order.capturedAt) {
        pickupDeadlineAt = defaultPickupDeadline(
            new Date(order.capturedAt).getTime(), rules.pickupOffsetMinutes);
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

    return {
        soloKm, soloMinutes, approachKm, approachMinutes,
        pickupDwell, dropoffDwell,
        arrivedPickup, pickedUp, arrivedDropoff,
        toPickup, toDropoff,
        pickupDeadlineAt, dropoffDeadlineAt, deadlineEstimated,
        departureAt,
        waitMinutes: minutesUntil(departureAt, nowMs),
    };
}
