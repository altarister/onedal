import { useFilterStore } from '../../stores/filterStore';
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { CALL_TARGET_LABEL, effectiveRadii } from "@onedal/shared";
import type { CallTarget } from "@onedal/shared";

/**
 * 요약줄 — 관제탑에 늘 보이는 한 칸. (docs/지금/필터.md §3)
 *
 *   줄 전체   → 필터 열림 (팝업이 아니라 제자리 · C4-3) — 오른쪽 끝 ⚙️ 는 걷었다 (기사님 2026-09-15)
 *   복귀 토글  → 확인 후 전환 (노선행 ↔ 복귀행) — 필터 안에 있다 (C4-5). 🏘️ 관내는 파생
 *
 * 버튼 순서가 하루의 흐름과 같다. 기사님:
 * *"목적지행(현 노선행)으로 모두 수행하고 거의 도착할 즈음 '이 동네에서 찾기'로 스와이프하고,
 *   이 동네에서 찾고 나면 복귀행으로 넘기면 모든 경우의 수를 커버할 것 같은데."*
 *
 * 🔴 전환은 **필터만** 바꾼다. 콜은 건드리지 않는다 (옛 투트랙이 콜을 완료 처리했다).
 *
 * ══ 🔴 드래그 전환을 걷어냈다 (2026-08-14) ══
 * 기사님: *"드래그로 바꾸면 안 될 듯싶다. 이렇게 필터가 쉽게 바뀌면 오작동이 될
 * 가능성이 있을 것 같다. 버튼을 누르게 하고 알럿창으로 확인받는 것이 안전할 듯하다."*
 *
 * 맞는 판단이다. 국면 전환은 목적지·반경을 바꾸고 **경유를 통째로 재계산**한다
 * (지리 연산 수 초 + 앱 필터 교체). 운전 중에 스크롤하다 손가락이 스치면 콜 잡기가
 * 엉뚱한 방향으로 간다. 임계값(80px)·탭 판정(6px)을 넣어도 완전하지 않았다.
 *
 * 하루에 두 번 하는 조작이므로 **확인 한 번이 부담이 아니다.** 편의보다 안전.
 * 같은 이유로 출발 감지도 자동 전환이 아니라 "알림만 주고 기사님이 누른다"이다.
 */


const PHASE_STYLE: Record<CallTarget, { icon: string; accent: string; hint: string }> = {
    DEST:  { icon: '🎯', accent: 'text-info',       hint: '목적지로 가는 콜 — 첫짐·합짐' },
    HOME:  { icon: '🏠', accent: 'text-accent',     hint: '집 방향 콜 — 합짐 최대한' },
};

// 취소 카운트 props 는 받되 안 그린다 (v13 확정안) · 취소 한도 토스트도 뺐다 — 폰·배차망마다 달라 다른 자리에서 (기사님 2026-09-15 · todo.md)
export default function OrderFilterStatus({ onOpenFilter }:
    {
        /** 🪗 누르면 **필터가 열린다** — 이 줄은 제자리에 그대로 있다 (C4-5) */
        onOpenFilter: () => void;
        cancelCounts?: Record<string, number>;
        /** 🚫 몇 판째인가 — 총량이 사라지지 않게 (필터_정의 §2 의 취지) */
        cancelRounds?: Record<string, number>;
    }) {
    const { filter } = useFilterConfig();
    /**
     * 🧾 **지도가 실제로 그린 그물의 수** (이식 C4-11b · 2026-09-12 · 쓰는 자리는 아래 `regionCount`).
     * ⚠️ **훅은 조기 반환보다 위에서 부른다** — 아래 `if (!filter)` 뒤에 두었다가
     *    `pnpm lint:gate` 의 «훅을 조건부로 부른다»에 걸렸고, 화면이 통째로 까맣게 죽었다.
     *    `tsc` 도 프로덕션 빌드도 **둘 다 통과했다** (2026-09-12 실측).
     */
    const netCount = useFilterStore(st => st.netCount);


    /**
     * 🔴 **스캔 성적표(`👁️ …건 → 통과 …`)는 여기 없다** — 폰 카드로 옮겼다 (기사님 지적 2026-08-23).
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

    // [V2] DispatchPhase 기반 상태 라벨 — 국면(CallTarget)과 다른 축이다
    let label = '직접 모드';   // 자동 탐색이 꺼져 있고 기사님이 직접 잡는다 (구 «수동 대기» · 2026-08-30 개명)
    if (filter.isActive) {
        const dPhase = filter.dispatchPhase || 'STANDBY';
        const action = filter.driverAction || 'WAITING';
        if (action === 'UNLOADING') label = '하차 대기';
        else if (dPhase === 'GATHERING') label = '합짐 탐색중';
        else if (dPhase === 'DELIVERING') label = '경로상 탐색중';
        else label = '첫짐 탐색중';
    }

    /** 🧾 지금 필터에 실린 읍·면·동 수 — 앱에 내려가는 그 목록이다 (이식 C4-9) */
    /**
     * 🧾 **지도가 실제로 그린 수를 먼저 본다** (이식 C4-11b · 2026-09-12).
     *
     * 기사님 2026-09-12: 요약줄의 «N 읍면동» 을 **지도와 같은 수**로.
     * 🔴 예전엔 `destinationKeywords`(서버가 파생해 내려준 목록)만 셌다. 그래서
     *    **끄는 동안 지도는 움직이는데 이 숫자는 멈춰 있었다** (실측: 368 고정).
     * ⚠️ 지도가 안 떠 있으면 `netCount` 가 `null` 이다 — 그때만 서버 값으로 물러선다.
     */
    const regionCount = netCount ?? filter.destinationKeywords?.length ?? 0;

    /** v14 국면 색·라벨 — 노선(파랑) · 관내(민트) · 복귀(주황). 지역 라벨도 국면 따라 */
    const V14: Record<CallTarget, { c: string; chipBg: string; chipBd: string; on: string; onBd: string; onGlow: string; region: string }> = {
        DEST:  { c: '#4f8df9', chipBg: 'rgba(79,141,249,.14)', chipBd: 'rgba(79,141,249,.35)', on: '#cfe0ff', onBd: 'rgba(79,141,249,.55)', onGlow: 'rgba(79,141,249,.18)', region: '도착목표' },
        HOME:  { c: '#e8a15c', chipBg: 'rgba(232,161,92,.13)', chipBd: 'rgba(232,161,92,.4)',  on: '#fbe3c8', onBd: 'rgba(232,161,92,.6)',  onGlow: 'rgba(232,161,92,.2)',  region: '귀갓길' },
    };
    const v14 = V14[phase];
    /* 📐 요약줄도 **줄인 반경**을 적는다 — 원값을 적으면 지도·서버와 다른 말을 한다 (조사 ①-4) */
    const radii = effectiveRadii(filter);
    const km1 = (n: number) => Math.round(n * 10) / 10;

    /**
     * 🎯 **한 줄이 전부다** (기사님 확정 2026-09-11: *"지금은 열림에 열림이 두번이야.
     *    **한줄에 열림 하나만 있으면 되.**"*).
     *
     *   `🎯 노선 · 여기서 10km → 서울 1km · 163 읍면동  합짐 탐색중`
     *
     * ⚠️ **예전엔 «펼친 판»(158px)이 또 있었다** — 방향 문장 · 지표줄(💰📍📦) · 국면 버튼 셋.
     *    그래서 층이 셋이었다 (접힘 → 펼침 → 팝업). C4-3 이 팝업을 걷었고, 여기서 펼침을 걷는다.
     *    · 지표줄은 **필터 안에 같은 값이 다 있어** 중복이었다
     *    · 국면 버튼 셋은 **필터 안으로 이사**했다 (확인창은 그대로 따라갔다)
     *
     * 🔴 값은 필터와 **같은 곳**에서 온다 (`useFilterConfig`) — 두 벌이면 갈라진다 (규칙 ③).
     */
    return (
        <div className="relative shrink-0">
        <button type="button" onClick={onOpenFilter} title="누르면 필터가 열립니다"
            className="shrink-0 h-[38px] w-full flex items-center gap-2 px-3 border-b border-border-card text-left
                       bg-surface-alt/30 hover:bg-surface-hover/40 transition-colors">
            <span className="shrink-0 text-[13px] font-black" style={{ color: v14.c }}>{PHASE_STYLE[phase].icon} {CALL_TARGET_LABEL[phase]}</span>
            <span className="shrink-0 opacity-40">·</span>
            {/**
              * 🔴 **«몇 개 동»은 끝까지 보인다** (2026-09-12 실측 — 「163 …」로 잘렸다).
              *    줄 전체에 `truncate` 를 걸면 **맨 뒤가 먼저 죽는다.** 자를 것은
              *    길어질 수 있는 **도시 이름** 쪽이고, 수는 필터가 지금 무엇을 담고 있나라
              *    잘리면 뜻이 사라진다.
              */}
            <span className="flex-1 min-w-0 flex items-baseline gap-1 text-[12.5px] font-bold text-text-muted">
                <span className="shrink-0">여기서 <b className="text-text-primary">{km1(radii.pickupRadiusKm)}km</b></span>
                <span className="shrink-0 opacity-70">→</span>
                {/* 🔴 «어디로»는 **도착 도시**다 — `region`(도착목표·관내·귀갓길)은 국면 이름이라 여기선 답이 안 된다 */}
                <b className="min-w-0 truncate text-text-primary">{filter.goalCity || filter.destinationCity || v14.region} {km1(radii.destinationRadiusKm)}km</b>
                <span className="shrink-0 opacity-40">·</span>
                {/**
                  * 🧾 **몇 개 동이 걸리나** (기사님 지시 2026-09-11 · 이식 C4-9).
                  *
                  * ⚠️ 여기 `📦 90/100`(적재)이 있었다 — **맨 위 헤더가 이미 말한다**
                  *    (`1t 예약 3 📦 90/100`). 한 화면에 같은 말이 두 번 있으면
                  *    그게 거짓말이 될 자리를 만든다 (규칙 ③).
                  *
                  * 🔴 대신 **필터가 지금 무엇을 담고 있나**를 적는다. 필터 안에 있던
                  *    「163개 동이 걸립니다」 카드가 하던 말인데, 그 카드는 **지도가 이미
                  *    그리는 것을 글자로 또 적는 것**이라 걷었다.
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
