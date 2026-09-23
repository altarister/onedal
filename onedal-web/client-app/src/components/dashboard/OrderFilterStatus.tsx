import { useFilterConfig } from "../../hooks/useFilterConfig";
import { effectiveRadii } from "@onedal/shared";
import type { CallTarget } from "@onedal/shared";

/**
 * 요약줄 — 관제탑에 늘 보이는 한 칸.
 *
 *   줄 전체   → 필터 열림 (팝업이 아니라 제자리) — 필터를 여는 손잡이는 이 줄 하나다 (기사님)
 *   복귀 토글  → 확인 후 전환 (노선행 ↔ 복귀행) — 필터 안에 있다. 🏘️ 관내는 파생
 *
 * 버튼 순서가 하루의 흐름과 같다. 기사님:
 * *"목적지행(현 노선행)으로 모두 수행하고 거의 도착할 즈음 '이 동네에서 찾기'로 스와이프하고,
 *   이 동네에서 찾고 나면 복귀행으로 넘기면 모든 경우의 수를 커버할 것 같은데."*
 *
 * 🔴 전환은 **필터만** 바꾼다. 콜은 건드리지 않는다 — 콜을 완료 처리하면 잡아 둔 콜이 사라진다.
 *
 * ══ 🔴 전환은 드래그가 아니라 버튼 + 확인창이다 ══
 * 기사님: *"드래그로 바꾸면 안 될 듯싶다. 이렇게 필터가 쉽게 바뀌면 오작동이 될
 * 가능성이 있을 것 같다. 버튼을 누르게 하고 알럿창으로 확인받는 것이 안전할 듯하다."*
 *
 * 국면 전환은 목적지·반경을 바꾸고 **경유를 통째로 재계산**한다
 * (지리 연산 수 초 + 앱 필터 교체). 운전 중에 스크롤하다 손가락이 스치면 콜 잡기가
 * 엉뚱한 방향으로 간다. 끌기 임계값·탭 판정을 넣어도 스침을 다 거르지 못한다.
 *
 * 하루에 두 번 하는 조작이므로 **확인 한 번이 부담이 아니다.** 편의보다 안전.
 * 같은 이유로 출발 감지도 자동 전환이 아니라 "알림만 주고 기사님이 누른다"이다.
 */


// 취소 카운트 props 는 받되 안 그린다 — 취소 한도는 폰·배차망마다 달라 폰 카드(접힌 셋)에서 본다 (기사님)
export default function OrderFilterStatus({ onOpenFilter }:
    {
        /** 🪗 누르면 **필터가 열린다** — 이 줄은 제자리에 그대로 있다 */
        onOpenFilter: () => void;
        cancelCounts?: Record<string, number>;
        /** 🚫 몇 차례째인가 — 총량이 사라지지 않게 */
        cancelRounds?: Record<string, number>;
    }) {
    const { filter } = useFilterConfig();


    /**
     * 🔴 **스캔 성적표(`👁️ …건 → 통과 …`)는 여기 없다** — 폰 카드에 있다 (기사님 지적).
     *
     * 이 카드가 말하는 필터는 **서버가 만들어 모든 폰에 똑같이 내려보내는 한 벌**이다.
     * 성적표는 **폰마다 다르다.** 여기에 놓으면 폰이 둘일 때 하나를 골라야 하는데,
     * 고르는 순간 멀쩡한 폰이 멈춘 폰을 가린다 → `DeviceControlPanel` · `lib/filterTally.ts`
     */


    if (!filter) {
        return (
            <div className="flex flex-row items-center justify-center px-4 py-3">
                <span className="text-sm font-black tracking-tight text-text-primary flex items-center gap-2">오더 필터 동기화 중...</span>
            </div>
        );
    }

    const phase: CallTarget = filter.callTarget ?? 'DEST';

    /**
     * [V2] 지금 무엇을 찾고 있나 — **무엇을**(짐의 차례)과 **어디로**(방향)를 한 줄에 적는다.
     *
     * 🔴 **복귀면 글자로도 말한다** (기사님 2026-09-23: *"여기서 복귀 켬 하면 색만 변하는데
     *    복귀 첫짐 탐색중 으로 텍스트도 같이 바꿔줘"*). 주황색 하나로는 먼발치에서 못 읽는다.
     * 🔴 **하차 대기에는 안 붙인다** — 그건 지금 하는 일이지 어디로 가는 길인가가 아니다.
     */
    let label = '직접 모드';   // 자동 탐색이 꺼져 있고 기사님이 직접 잡는다
    if (filter.isActive) {
        const dPhase = filter.dispatchPhase || 'STANDBY';
        const action = filter.driverAction || 'WAITING';
        if (action === 'UNLOADING') label = '하차 대기';
        else {
            const what = dPhase === 'GATHERING' ? '합짐' : dPhase === 'DELIVERING' ? '경로상' : '첫짐';
            label = `${phase === 'HOME' ? '복귀 ' : ''}${what} 탐색중`;
        }
    }

    /**
     * 🧾 **지금 원달앱에 내려간 하차 목록의 읍·면·동 수**.
     * 🔄 숫자는 서버 목록 하나에서 센다(규칙 ③) — 지도가 그린 도형에서 세면 두 곳이 다른 수를 말한다.
     *    슬라이더를 끄는 동안은 멈춰 있다가 **손을 떼고** 서버가 목록을 다시 만들면 바뀐다.
     */
    const regionCount = filter.destinationKeywords?.length ?? 0;

    /** v14 국면 색·라벨 — 노선(파랑) · 복귀(주황). 지역 라벨도 국면 따라 */
    const V14: Record<CallTarget, { c: string; chipBg: string; chipBd: string; on: string; onBd: string; onGlow: string; region: string }> = {
        DEST:  { c: '#4f8df9', chipBg: 'rgba(79,141,249,.14)', chipBd: 'rgba(79,141,249,.35)', on: '#cfe0ff', onBd: 'rgba(79,141,249,.55)', onGlow: 'rgba(79,141,249,.18)', region: '도착목표' },
        HOME:  { c: '#e8a15c', chipBg: 'rgba(232,161,92,.13)', chipBd: 'rgba(232,161,92,.4)',  on: '#fbe3c8', onBd: 'rgba(232,161,92,.6)',  onGlow: 'rgba(232,161,92,.2)',  region: '귀갓길' },
    };
    const v14 = V14[phase];
    /* 📐 요약줄도 **줄인 반경**을 적는다 — 원값을 적으면 지도·서버와 다른 말을 한다 */
    const radii = effectiveRadii(filter);
    const km1 = (n: number) => Math.round(n * 10) / 10;

    /**
     * 🎯 **한 줄이 전부다** (기사님 확정: *"지금은 열림에 열림이 두번이야.
     *    **한줄에 열림 하나만 있으면 되.**"*).
     *
     *   `🎯 노선 · 여기서 10km → 서울 1km · 163 읍면동  합짐 탐색중`
     *
     * ⚠️ 이 줄 아래에 펼침을 두지 않는다 — 지표(💰📍📦)는 필터 안에 같은 값이 다 있고,
     *    국면 버튼 셋은 필터 안에 있다 (확인창과 함께). 층이 늘면 «열림»이 두 번이 된다.
     *
     * 🔴 값은 필터와 **같은 곳**에서 온다 (`useFilterConfig`) — 두 벌이면 갈라진다 (규칙 ③).
     */
    return (
        <div className="relative shrink-0">
        <button type="button" onClick={onOpenFilter} title="누르면 필터가 열립니다"
            className="shrink-0 h-[38px] w-full flex items-center gap-2 px-3 border-b border-border-card text-left
                       bg-surface-alt/30 hover:bg-surface-hover/40 transition-colors">
            {/* 🛣️🔷 노선·동선 — 필터 창과 같은 값을 읽는다. 안 적으면 바꿔도 이 줄이 그대로라 바뀐 줄 모른다 */}
            <span className="shrink-0 text-[12.5px] font-black text-text-primary">{(filter.routeMode ?? true) ? '🛣️ 노선' : '🔷 동선'}</span>
            <span className="shrink-0 opacity-40">·</span>
            {/**
              * 🔴 **«몇 개 동»은 끝까지 보인다** (줄 전체를 자르면 「163 …」처럼 수가 잘린다).
              *    줄 전체에 `truncate` 를 걸면 **맨 뒤가 먼저 죽는다.** 자를 것은
              *    길어질 수 있는 **도시 이름** 쪽이고, 수는 필터가 지금 무엇을 담고 있나라
              *    잘리면 뜻이 사라진다.
              */}
            <span className="flex-1 min-w-0 flex items-baseline gap-1 text-[12.5px] font-bold text-text-muted">
                <span className="shrink-0">여기서 <b className="text-text-primary">{km1(radii.pickupRadiusKm)}km</b></span>
                <span className="shrink-0 opacity-70">→</span>
                {/* 🔴 «어디로»는 **도착 도시**다 — `region`(도착목표·귀갓길)은 국면 이름이라 여기선 답이 안 된다 */}
                <b className="min-w-0 truncate text-text-primary">{filter.goalCity || filter.destinationCity || v14.region} {km1(radii.destinationRadiusKm)}km</b>
                <span className="shrink-0 opacity-40">·</span>
                {/**
                  * 🧾 **몇 개 동이 걸리나** (기사님 지시).
                  *
                  * ⚠️ 적재(`📦 90/100`)는 여기 적지 않는다 — **맨 위 헤더가 이미 말한다**
                  *    (`1t 예약 3 📦 90/100`). 한 화면에 같은 말이 두 번 있으면
                  *    그게 거짓말이 될 자리를 만든다 (규칙 ③).
                  *
                  * 🔴 대신 **필터가 지금 무엇을 담고 있나**를 적는다. 필터 창에는 이 수를
                  *    카드로 따로 적지 않는다 — **지도가 이미 그리는 것을 글자로 또 적는 것**이다.
                  */}
                <b className="text-text-primary tabular-nums whitespace-nowrap">{regionCount} 읍면동</b>
            </span>
            {/* 🔒 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다 */}
            {filter.userOverrides && (
                <span title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                    className="shrink-0 text-[11px] text-warning">🔒</span>
            )}
            <span className="shrink-0 text-[11.5px] font-black" style={{ color: v14.c }}>{label}</span>
        </button>
        </div>
    );
}
