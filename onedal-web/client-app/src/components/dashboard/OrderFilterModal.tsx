import { useState, useEffect, useMemo } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { useFilterStore } from "../../stores/filterStore";
import { logRoadmapEvent } from "../../lib/roadmapLogger";
import { NET_RATE_PER_KM, VEHICLE_CAPACITY, TRUCK_CAPACITY_SLOTS, CAPACITY_CONFIDENCE_LABEL,
         FILTER_FIELDS, PHASE_AUTO_SOURCE, filterValuesFrom, DEFAULT_FILTER_VALUES,
         QUAD_FIELDS, quadShapeFrom,
         sidoList, sggList, dongList, excludedLabel,
         resolvePhaseKey, reachRadiusKm, CALL_TARGET_LABEL, effectiveRadii,
         VEHICLE_SHORT, VEHICLE_PICKS, RADIUS_BASE_KM_DEFAULT } from "@onedal/shared";
import type { PhaseKey, FlatValueKey, CallTarget } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { apiClient } from "../../api/apiClient";
import { useCityOptions, resolveCity } from "../../lib/cityOptions";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useJudgmentStore } from "../../stores/judgmentStore";
/* 🎛️ 고르기 칸은 목업과 **같은 부품**이다 (이식 C2-2 · 규칙 ③) */
import { PickLayer } from "../ui/PickLayer";
import { KnobGrid } from "../ui/KnobGrid";

/**
 * 콜할인율 단계 — 시세 대비 허용 할인 %.
 * "전부"(100)는 금액 무관 통과. 합짐·관내·복귀는 순증 매출이라 여기까지 내려간다.
 */
const CALL_DISCOUNT_STEPS = [
    { value: 0,   label: '시세' },
    { value: 10,  label: '-10%' },
    { value: 20,  label: '-20%' },
    { value: 30,  label: '-30%' },
    { value: 100, label: '전부' },
] as const;

/**
 * 🚫 **자주 쓰는 제외 단어** — 목업 목록 그대로 (`MapMockup.tsx:3272`).
 *    🔴 **이것이 전부는 아니다** — 기사님이 아무 말이나 넣으실 수 있게 레이어 안에
 *    자유 입력칸을 함께 둔다 (목록만 남기면 기능이 준다).
 */
const COMMON_EXCLUDED_WORDS = ['착불', '수거', '까대기', '직접운반', '왕복', '대기'];

/** 하한표에 보여줄 차종 — 내 차(1t)로 수행 가능한 등급만, 칸이 작은 순 */
const RATE_TABLE_ORDER = ['오토바이', '다마스', '승용차', '라보', '1t'];

/**
 * 🔴 **국면 탭 다섯을 걷어냈다** (이식 C3-3a · 기사님 확정 2026-09-11 저녁 *"그 기준은 바꿔"*).
 *
 * 예전엔 «아침에 앉아서 하루치를 다 정해 둔다»는 뜻으로 다섯 탭을 펼쳐 뒀다. 그런데
 * 기사님 2026-09-09: *"이제 우리에게 국면이라는 것이 없어진 것 같은데.. 원칙이 바뀐 거 아냐?"* ·
 * *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면 사용 안 하면 되니까."*
 * **다섯 벌이 하던 일은 «값을 여러 벌 두는 것»이 아니라 «지금 안 쓰는 칸을 감추는 것»이었다.**
 *
 * 🔴 **«지금 무엇을 하나»는 그대로 남는다** — 아래 문구 표들(`SECTION`·`REGION_CARD`…)이
 *    이제 **고르는 탭이 아니라 «지금 국면»**을 따라간다. 값은 한 벌이고 설명만 상황을 말한다.
 */

/** 국면별 강조색 — Tailwind 가 스캔할 수 있게 **완성된 클래스 문자열**로 적는다 */
const TAB_STYLE: Record<PhaseKey, { box: string; text: string; input: string; chip: string }> = {
    first: { box: 'border-info-alt/30',   text: 'text-info-alt',   input: 'border-border',           chip: 'bg-info-alt/10 text-info-alt' },
    merge: { box: 'border-warning/30',    text: 'text-warning',    input: 'border-warning/30',       chip: 'bg-warning/10 text-warning' },
    drive: { box: 'border-info/30',       text: 'text-info',       input: 'border-info/30',          chip: 'bg-info/10 text-info' },
    home:  { box: 'border-accent/30',     text: 'text-accent',     input: 'border-accent/30',        chip: 'bg-accent/10 text-accent' },
};

/**
 * 섹션 제목과 오른쪽 힌트 — **v6 목업 문구 그대로.**
 * 기사님: *"목업에 만들어둔 명칭도 그대로 사용해."*
 */
const SECTION: Record<PhaseKey, { title: string; hint: string }> = {
    first: { title: '어디로 갈까',            hint: '빈 차로 첫 짐을 찾을 때' },
    merge: { title: '얼마나 돌아갈까',        hint: '짐을 싣고 다음 짐을 찾을 때' },
    drive: { title: '가는 길만',              hint: '우회를 끊는다' },
    home:  { title: '집 방향',                hint: '최종 하차지 → 집' },
};

/* 🧾 지역 카드 문구 표(`REGION_CARD`)가 여기 있었다 — 카드를 걷으며 함께 (C4-9) */

/** 하한표 제목 — 목업 문구 그대로 */
const FLOOR_TITLE: Record<PhaseKey, string> = {
    first: '첫짐 하한 — 단가 기준 (합짐과 같은 식)',
    merge: '합짐 하한 — 단가 기준 (콜마다 거리가 다르니까)',
    drive: '운행 중 하한 — 단가 기준',
    home:  '복귀 하한 — 단가 기준',
};

/**
  * 값 다섯을 폼에서 다루는 모양 — **문자열**이다 (입력 중 빈 칸을 허용하려면 숫자로는 안 된다).
  * 🔴 **이름이 평면과 같다** (이식 C3-3b) — 예전엔 국면 그릇 이름(`detourAllowKm` 등)이라
  *    저장할 때 `applyPhaseToFilter` 로 옮겨야 했다. 이제 그대로 보낸다.
  */
type ValueForm = Record<FlatValueKey, string>;

const toForm = (v: Record<FlatValueKey, any>): ValueForm =>
    Object.fromEntries(FILTER_FIELDS.map(f => [f.path, String(v[f.path] ?? '')])) as ValueForm;

/** 목록은 **순서가 달라도 같은 것**이다 (칩을 껐다 켜면 뒤로 간다) */
const sameList = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join('\u0001') === [...b].sort().join('\u0001');

/** 빈 칸은 **이전 값 그대로**다 (0 으로 바꾸면 "제한 없음"으로 뒤집힌다 — §1) */
const toValues = (f: ValueForm, prev: Record<FlatValueKey, any>): Record<FlatValueKey, any> => {
    const out = { ...prev };
    for (const spec of FILTER_FIELDS) {
        const raw = f[spec.path];
        if (spec.text) { out[spec.path] = raw; continue; }
        const n = parseFloat(raw);
        out[spec.path] = Number.isFinite(n) ? n : prev[spec.path];
    }
    return out;
};

/**
 * 🎯 **국면 셋 — 하루의 흐름 순서** (요약줄에서 이사 · C4-5).
 *    기사님: *"목적지행으로 모두 수행하고 거의 도착할 즈음 '이 동네에서 찾기'로 스와이프하고,
 *    이 동네에서 찾고 나면 복귀행으로 넘기면 모든 경우의 수를 커버할 것 같은데."*
 */
const TARGET_HINT: Record<CallTarget, string> = {
    DEST:  '목적지로 가는 콜 — 첫짐·합짐',
    HOME:  '집 방향 콜 — 합짐 최대한',
};

/**
 * 🎚️ **슬라이더로 고치는 값 셋** — 목적지(글자)와 콜할인율(단계 버튼)은 제 UI 가 따로 그린다.
 *    라벨·단위·범위·한 칸은 전부 `FILTER_FIELDS` 에서 온다 (규칙 ③).
 */
/* 🔴 순서도 목업 그대로 — 현위 → 목적 → 라인 (`MapMockup.tsx:3229~3232`) */
const KNOB_FIELDS: FlatValueKey[] = ['pickupRadiusKm', 'destinationRadiusKm', 'detourRadiusKm'];

interface OrderFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    hasHomeReturnActive?: boolean;
    /**
     * 🛣️ **노선 ↔ 🔷 동선** (기사님 지시 2026-09-11: *"노선 동선 버튼도 지도에서 필터로
     *    이사와야해"* — **목업이 그 자리다**, `MapMockup.tsx:3171`).
     *    상태는 부모가 쥔다 — 지도와 **같은 값**을 봐야 하므로 (규칙 ③).
     */
    routeMode: boolean;
    setRouteMode: (v: boolean) => void;
}

export default function OrderFilterModal({ isOpen, onClose, hasHomeReturnActive = false,
                                           routeMode, setRouteMode }: OrderFilterModalProps) {
    const { filter, baseFilter, updateFilter, previewFilter } = useFilterConfig();
    /** 🛣️ 무대가 «라인으로 쟀나» — ⏳ 경로 대기 문구가 본다 (store · 모르면 null) */
    const netUsedLine = useFilterStore(st => st.netUsedLine);

    // ⏱️ 시간 축 안내의 재료 — 무통보 상차 한계는 판정 기준 탭에 산다 (읽기 공유 · 확정 2)
    const judgmentCfg = useJudgmentStore(st => st.judgment);

    /**
     * 🔴 **값은 한 벌이다** (이식 C3-3a · 기사님 확정 2026-09-11 *"그 기준은 바꿔"*).
     *
     * ⚠️ 2026-08 에는 반대였다 — 기사님: *"첫짐 도착반경 5km 로 콜을 잡다가 첫짐을 잡으면 …
     *    저장된 합짐 도착반경 1km 를 꺼내와 콜을 잡고 싶은 거야."* 그래서 폼이 다섯 벌이었다.
     *    그 기준을 기사님이 바꾸셨다. 다섯 벌이 실제로 하던 일은 **감추기**였고, 목업은
     *    감추는 대신 **다 꺼내 두고 흐리게** 한다.
     *
     * ✅ 그릇도 한 벌이 됐다 (C3-3b · 2026-09-11) — 자리는 `user_filters` 한 행.
     */
    const [cur, setForm] = useState<ValueForm>(() => toForm(DEFAULT_FILTER_VALUES));
    /**
     * 📐 **마름모의 모양 — 국면 밖 한 벌** (이식 C3-2 · 2026-09-11 · 명세 §3).
     *    국면 값 묶음과 **따로** 산다. 저장도 평면 통로(`updateFilter`)다.
     */
    const [quadForm, setQuadForm] = useState<Record<string, string>>(
        () => Object.fromEntries(QUAD_FIELDS.map(f => [f.path, String(quadShapeFrom(null)[f.path])])));
    const [quadDirty, setQuadDirty] = useState(false);
    /**
     * 🎚️ **지금 펼쳐진 손잡이 하나** (이식 C4-1 · 2026-09-11). 하나뿐이라 다른 칸을 열면
     *    이 칸은 저절로 닫힌다 — 그래서 온 화면 덮개가 필요 없다 (`KnobGrid` 주석 참조).
     */
    const [openKnob, setOpenKnob] = useState<string | null>(null);
    /**
     * 🚫 **제외 지역 — 국면 밖 한 벌** (이식 C2-2 · 2026-09-11 · 명세 §3).
     *
     * 🔴 **초안(`exDraft`)과 적용본이 갈라져 있다** — 목업과 같다. 칩 하나 잘못 눌러
     *    그 지역이 곧장 살아나면 안 되므로 **💾 를 눌러야** 저장 대상이 된다.
     *    키 문법(`S|도`·`R|시군구`·`D|시군구|동`)은 `shared/callNet.ts` 하나가 안다.
     */
    const [exDraft, setExDraft] = useState<string[]>([]);
    const [exDirty, setExDirty] = useState(false);
    const [exSido, setExSido] = useState<string>('경기');
    const [exSgg, setExSgg] = useState<string | null>(null);
    /* 🔴 제외 레이어도 `openKnob` 하나가 연다 — 두 벌이면 레이어 둘이 동시에 열린다 (조사 ①-10) */
    /**
     * ⛔ **칩 줄 — 닫히면 한 줄, 누르면 전부** (목업 `MapMockup.tsx:3288~` 그대로 · 전수 조사 4단계).
     *    기사님 2026-09-09: *"결과물을 첫 줄만 보여 주고 클릭하면 다."*
     *    실물은 늘 전체 칩을 펼쳐 폰에서 여덟 줄이 화면을 먹었고, 실수 삭제 방지도 없었다.
     */
    const [exListOpen, setExListOpen] = useState(false);
    /** 초안이 «지금 그물»에 들어가 있나 — 인라인 💾 저장의 «완료» 표시 */
    const exApplied = sameList(exDraft, filter?.excludedRegions ?? []);
    /**
     * 💾 **인라인 저장 — 초안을 «그물(메모리)»에 넣는다.** 전역 💾 서버 저장(DB)과 다른 일이다.
     *    칩 하나 잘못 눌러 그 지역이 곧장 살아나면 안 되므로 제외지역만 초안을 둔다 (목업과 같다).
     */
    const applyExcluded = () => {
        updateFilter({ excludedRegions: exDraft, userOverrides: true });
    };
    const toggleEx = (key: string) => { setExDraft(x => x.includes(key) ? x.filter(k => k !== key) : [...x, key]); setExDirty(true); };
    const fillQuad = (src: unknown) => setQuadForm(Object.fromEntries(
        QUAD_FIELDS.map(f => [f.path, String(quadShapeFrom(src as any)[f.path])])));

    /**
     * 지금 어느 국면인가 — **두 축의 조합**이다 (`callTarget` × `dispatchPhase`).
     * 판정은 `shared` 의 `resolvePhaseKey` 하나로만 한다. 예전에는 이 화면이
     * `isSharedMode`·`driverAction` 으로 자기 규칙을 따로 세워, 서버가 보는 국면과
     * 화면이 말하는 국면이 갈라질 수 있었다.
     *
     * 🔴 **이제 고르는 것이 아니라 «지금»이다** (C3-3a). 탭이 사라졌으므로 이 값이 곧
     *    화면 문구(무엇을 찾는 중인가 · 요약줄의 «N 읍면동»)를 정한다.
     *    **값을 고르지는 않는다** — 값은 한 벌이다.
     */
    const activePhase: PhaseKey = filter
        ? resolvePhaseKey(filter.callTarget ?? 'DEST', filter.dispatchPhase ?? 'STANDBY')
        : 'first';
    const tab = activePhase;

    /**
     * 🔴 **«지금 이 칸이 쓰이나»** — 표는 그대로 유일한 원천이고(규칙 ③), **하는 일만 바뀌었다**:
     *    예전에는 이 답으로 칸을 **감췄고**(`hidden`), 이제는 **흐리게** 한다 (이식 C3-3a).
     *
     * 기사님 2026-09-09: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면 사용 안 하면
     * 되니까."* 감추면 «이 값이 어디 갔나»가 되고, 그냥 두면 «지금 쓰이는 값»으로 읽힌다.
     */
    /**
     * 🔴 **«지금 이 칸이 쓰이나»를 상태에서 파생한다** (이식 C3-3b · 2026-09-11).
     *
     * 예전엔 `PHASE_FIELDS[tab]` 표가 답했다. **값이 한 벌이 되며 «어느 벌인가»가 없어져**
     * 그 표도 사라졌다 — 이제 «지금 무엇이 도는가»가 직접 말한다.
     *
     * 🔴 **라인반경만 갈린다**: 경로 양옆으로 재는 값이라 **노선일 때만** 쓰인다
     *    (목업도 `dim: !routeMode` 하나뿐이다 · `MapMockup.tsx:3232`).
     * 🔴 **감추지 않고 흐리게** 둔다 (기사님 2026-09-09: *"모두 꺼내 두고"*).
     */
    const inUse = (path: FlatValueKey) => path !== 'detourRadiusKm' || routeMode;

    /**
     * 📐 **반경을 거리에 맞춰 자동으로 줄이나** (이식 C4-12 · 2026-09-12).
     *    거리(`radiusDistanceKm`)는 **서버가 재서 실어 보낸다** — 이 화면은 «내 위치 → 목적지»
     *    를 모른다. 배율은 `effectiveRadii` 가 그 거리와 기준으로 낸다 — 그래서 기준거리를
     *    끄는 동안에도 지도가 따라온다. 못 받았으면 손대지 않는다 (규칙 ④).
     */
    const radiusAuto = !!filter?.radiusAuto;
    /** 🔴 **지금 실제로 쓰이는 반경** — 무대 지도가 부르는 **그 함수**다 (규칙 ③) */
    const shownRadii = effectiveRadii(filter);

    /**
     * 🚚 **기사님이 «받겠다»고 고른 차종** (이식 C4-6b · 2026-09-12).
     *    비어 있으면 **제한 없음** — 지금 동작 그대로다.
     * ⚠️ 서버가 낸 `allowedVehicleTypes`(«지금 실을 수 있는 것»)와 **다른 값**이다.
     *    한 칸에 겹치면 기사님이 고른 것이 짐 한 번에 지워진다 (규칙 ⑤-4 ⑤).
     */
    const accepted = filter?.acceptedVehicleTypes ?? [];
    const toggleVehicle = (v: string) => {
        /**
         * 🔴 **목업과 같은 뜻** (`MapMockup.tsx` `setVehicles`): «모두»에서 1t 을 누르면 **1t 만**.
         *    처음엔 «1t 만 뺀 넷»으로 만들었었다 — 같은 손가락에 반대 결과 (2026-09-12 조사 ①-6).
         * 다섯을 다 고른 것은 «모두»와 같은 뜻이라 빈 배열로 되돌린다.
         */
        const next = accepted.includes(v) ? accepted.filter(x => x !== v) : [...accepted, v];
        updateFilter({ acceptedVehicleTypes: next.length === VEHICLE_PICKS.length ? [] : next });
    };

    /**
     * 🎯 **국면 전환 — 요약줄에서 이사해 왔다** (이식 C4-5 · 2026-09-11).
     *    기사님: *"지금은 열림에 열림이 두번이야. **한줄에 열림 하나만 있으면 되.**"*
     *    요약줄의 펼친 판을 걷으면서 그 안에 있던 버튼 셋이 여기로 왔다.
     *
     * 🔴 **확인창은 그대로 따라왔다** (기사님 2026-08-14: *"이렇게 필터가 쉽게 바뀌면
     *    오작동이 될 가능성이 있을 것 같다. 버튼을 누르게 하고 알럿창으로 확인받는 것이
     *    안전할 듯하다"*). 되돌리려면 경유를 통째로 다시 계산해야 한다.
     * 🔴 **닫지 않는다** — 2026-08 에 전환 버튼이 `onClose()` 를 불러 **저장 안 한 값을
     *    조용히 버렸다.** 그 사고를 여기서 되풀이하지 않는다.
     */
    const goPhase = (next: CallTarget) => {
        const now: CallTarget = filter?.callTarget ?? 'DEST';
        if (next === now) return;
        const ok = confirm(
            `콜 잡기 방향을 바꿉니다.\n\n` +
            `  ${CALL_TARGET_LABEL[now]}  →  ${CALL_TARGET_LABEL[next]}\n` +
            `  ${TARGET_HINT[next]}\n\n` +
            `잡아 둔 콜은 그대로 있습니다 (필터만 바뀝니다).\n계속할까요?`
        );
        if (!ok) return;
        logRoadmapEvent("웹", `국면 전환 버튼 (${now} → ${next})`);
        socket.emit("set-call-target", { phase: next });
    };

    /**
     * 💾 **저장은 두 갈래다 — 메모리와 서버** (이식 C4-10 · 2026-09-12).
     *
     * 기사님: *"오늘만, 계속, 평소값 **이것이 말이 안 되는것 같다**. 서버저장과 메모리 저장
     * 뭐 이렇게만 있으면 될 것 같은데 … **그냥 닫으면 앱메모리에 자동저장** 되는거지."*
     *
     * 🔴 **`setField` 는 화면만 움직인다.** 서버로 보내는 것은 `commitValues` 한 번이고,
     *    슬라이더는 **손가락을 뗄 때** 그것을 부른다 — 끄는 동안 픽셀마다 보내면
     *    서버가 경유 지역을 매번 다시 그려(지리 연산 수 초) 폭주한다.
     * 🔴 **«저장 안 한 변경»을 손으로 든 깃발(`dirty`)은 없앴다.** 깃발은 켜고 끄는 것을
     *    잊는 순간 거짓말을 한다 — «서버와 다른가»는 아래 `unsaved` 가 **파생**한다 (규칙 ③).
     */
    const setField = (key: FlatValueKey, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };
    /**
     * 🎚️ **끄는 동안 — 지도만 따라 움직인다** (이식 C4-11 · 2026-09-12).
     *
     * 기사님: *"값을 조절할때 움직일때 **영역을 바꿔 주면 좋겠어**.
     * 그래야 그걸 보고 **한번에 조절** 하니까."*
     *
     * 🔴 소켓을 안 탄다 — 끄는 동안 서버로 쏘면 매번 경유 지역을 다시 파생해 **앱에까지**
     *    내려간다. 그물은 `useCallNet` 이 **클라에서** 다시 그린다 (실측 0.9ms/회).
     * ⚠️ 짝이 있다: 손을 뗄 때 아래 `commitValues` 가 **같은 값을 서버로** 한 번 보낸다.
     */
    const previewValues = (next: ValueForm) => {
        setForm(next);
        previewFilter(toValues(next, filterValuesFrom(filter as any)));
    };
    /** 지금 폼 값을 **메모리에** 넣는다 (DB 아님). 손을 뗄 때 서버까지 간다 */
    const commitValues = (next?: ValueForm) => {
        updateFilter(toValues(next ?? cur, filterValuesFrom(filter as any)));
    };
    /**
     * 고르는 칸(목적지·할인율)은 **고르는 즉시** — 한 번뿐이라 폭주가 없다.
     * 🔴 **값을 인자로 받아 합쳐 보낸다** — `setForm` 은 예약일 뿐이라
     *    바로 뒤에서 `cur` 을 읽으면 **한 칸 뒤처진다** (`KnobGrid` 의 ± 가 그 모양이다).
     */
    const pickField = (key: FlatValueKey, value: string) => {
        const next = { ...cur, [key]: value };
        setForm(next);
        commitValues(next);
    };

    /** 제외 키워드는 **다섯 탭 공통**이라 국면 설정이 아니라 평면 필터에 있다 */
    const [blacklist, setBlacklist] = useState<string>("");
    const [blacklistDirty, setBlacklistDirty] = useState(false);

    /**
     * 고를 수 있는 시/군 목록 — 지도 데이터에서 받는다.
     * 예전에는 여기에 7개를 손으로 적어 뒀고, 저장값 `파주` 가 그 중 무엇과도 안 맞아
     * 브라우저가 첫 항목 `용인시` 를 그렸다. 화면이 필터를 잘못 말한 것이다.
     */
    const cityGroups = useCityOptions();
    const knownCities = cityGroups.flatMap(g => g.cities);
    /** 그 도에 속한 시·군 목록 (이식 C4-2) — 목록의 원천은 `cityGroups` 하나다 (규칙 ③) */
    const citiesOf = (sido: string) => cityGroups.find(g => g.sido === sido)?.cities ?? [];
    /**
     * 🎯 **지금 고른 도** (이식 C4-2). 저장되는 것은 **시 하나**(`destinationCity`)이고,
     *    도는 «어느 목록을 보여줄까»일 뿐이라 화면에만 산다.
     *
     * 🔴 그래서 **저장값에서 거꾸로 찾아 세운다** — 필터를 열 때 「김포시」가 들어 있으면
     *    도 칸이 「경기」를 가리켜야 한다. 안 그러면 도가 비어 시 목록도 비고,
     *    **저장된 목적지가 화면에서 사라진 것처럼 보인다.**
     */
    const [dstSido, setDstSido] = useState<string>('');
    useEffect(() => {
        if (!cityGroups.length) return;
        const owner = cityGroups.find(g => g.cities.includes(cur.destinationCity));
        if (owner) { if (owner.sido !== dstSido) setDstSido(owner.sido); return; }
        // 목록에 없는 값(옛 `파주`)이면 도를 건드리지 않는다 — 지어내지 않는다 (규칙 ④)
        if (!dstSido) setDstSido(cityGroups[0].sido);
    }, [cityGroups, cur.destinationCity]); // eslint-disable-line react-hooks/exhaustive-deps
    /** 목록에 없는 저장값(옛 `파주`)을 정식 이름으로 끌어올린다 — 못 찾으면 건드리지 않는다 */
    const firstCity = cur.destinationCity;
    useEffect(() => {
        if (!firstCity || !cityGroups.length) return;
        if (knownCities.includes(firstCity)) return;
        const resolved = resolveCity(firstCity, cityGroups);
        if (resolved) {
            setForm(prev => ({ ...prev, destinationCity: resolved }));
        }
    }, [cityGroups, firstCity]); // eslint-disable-line react-hooks/exhaustive-deps

    /* 🧾 지역 카드가 쓰던 상태 셋(아코디언·미리보기 결과·개수)이 여기 있었다 (C4-9) */

    /**
     * 📥 **열리는 순간 폼을 «지금 값»으로 채운다** (되살림 2026-09-12 · 버그 대장 #108).
     *
     * 🔴 **C4-9 에서 이 블록이 통째로 잘려 나갔다.** 미리보기 두 함수를 걷으며
     *    «다음 const 까지»로 잘랐는데 그 사이에 이것이 끼어 있었다 — 이 파일에서
     *    **같은 병이 두 번째**다(그때는 `if (!filter)` 가드를 잃었다).
     *    **글자 수나 «다음 선언»으로 자르지 않는다. 블록의 끝을 눈으로 확인한다.**
     *
     * 🔴 **없으면 무슨 일이 나나** — 폼이 `DEFAULT_FILTER_VALUES` 로 서고 목적지가 **빈칸**이 된다.
     *    그 상태에서 슬라이더를 하나만 만져도 `toValues` 가 **빈 목적지를 그대로** 실어 보낸다
     *    («이전 값 그대로» 보호는 **숫자에만** 걸린다 — `spec.text` 는 그냥 통과).
     *    실측 2026-09-12: 기사님이 맞춰 두신 **파주시가 메모리에서 사라졌다.**
     *
     * ⚠️ **열릴 때 한 번뿐이다.** `filter` 를 의존성에 넣으면 끄는 동안 `previewFilter` 가
     *    바꾼 필터가 폼을 도로 덮어써 손가락과 화면이 싸운다 (C4-11).
     */
    useEffect(() => {
        if (isOpen && filter) {
            setForm(toForm(filterValuesFrom(filter as any)));
            /* 📐 마름모는 평면 필터에 실려 온다 — 국면 밖 한 벌이라 (이식 C3-2) */
            fillQuad(filter);
            setQuadDirty(false);
            setExDraft(filter.excludedRegions ?? []);
            setExDirty(false);
            setBlacklist(filter.excludedKeywords ? filter.excludedKeywords.join(',') : "");
            setBlacklistDirty(false);
        }
    }, [isOpen]);   // eslint-disable-line react-hooks/exhaustive-deps -- 열릴 때 한 번 (위 ⚠️)

    // 귀가콜 로딩 상태
    const [homeReturnLoading, setHomeReturnLoading] = useState(false);

    /** 복귀 탭이 보여 주는 집 주소 — 원천은 ⚙️ 설정이다. 여기서 고치지 않는다 */
    const [homeAddress, setHomeAddress] = useState<string>("");
    useEffect(() => {
        if (!isOpen) return;
        apiClient.get('/settings')
            .then(({ data }) => setHomeAddress(data.homeAddress || ""))
            .catch(() => setHomeAddress(""));   // 못 읽으면 "자동 · 설정의 집 주소" 로 남는다
    }, [isOpen]);

    /**
     * 🧾 **미리보기 두 함수가 여기 있었다** (`handlePreviewRegions`·`handlePreviewDetour` ·
     *    걷어냄 2026-09-12 · 이식 C4-9).
     *    *"값을 바꾼 뒤 «그럼 몇 개가 되나»를 저장 전에 확인한다"* 가 하던 일인데,
     *    **값을 만지면 지도가 그 자리에서 바뀌니** 미리 볼 것이 없어졌다.
     */
    /**
     * 🔴 **«서버와 다른가»는 파생이다 — 깃발을 손으로 들지 않는다** (이식 C4-10 · 규칙 ③).
     *
     * ⚠️ 예전엔 `dirty`·`quadDirty`·`exDirty`·`blacklistDirty` 넷을 손으로 켰다.
     *    켜는 것은 잊지 않는데 **끄는 것을 잊는다** — 되돌려 놓고도 «값 변경됨»이라
     *    적혀 있으면 화면이 거짓말을 한다. 그래서 **서버 값과 직접 견준다.**
     */
    const unsaved = useMemo(() => {
        if (!baseFilter) return false;
        const base = toForm(filterValuesFrom(baseFilter as any));
        if (FILTER_FIELDS.some(f => cur[f.path] !== base[f.path])) return true;
        const bq = quadShapeFrom(baseFilter as any);
        if (QUAD_FIELDS.some(f => quadForm[f.path] !== String(bq[f.path]))) return true;
        if (!sameList(exDraft, baseFilter.excludedRegions ?? [])) return true;
        const kw = blacklist ? blacklist.split(',').map(t => t.trim()).filter(Boolean) : [];
        if (!sameList(kw, baseFilter.excludedKeywords ?? [])) return true;
        /**
         * 📐🚚 **오늘 판 셋** (2026-09-12 조사 ①-5) — 안 보면 바꿔도 «서버와 같음»이라
         *    거짓말하고, ↩︎ 되돌리기 버튼이 눌리지도 않는다.
         */
        if (!!filter?.radiusAuto !== !!baseFilter.radiusAuto) return true;
        if ((filter?.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT) !== (baseFilter.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT)) return true;
        if (!sameList(filter?.acceptedVehicleTypes ?? [], baseFilter.acceptedVehicleTypes ?? [])) return true;
        if ((filter?.routeMode ?? true) !== (baseFilter.routeMode ?? true)) return true;   // 🛣️🔷 (조사 ①-9)
        return false;
    }, [baseFilter, cur, quadForm, exDraft, blacklist,
        filter?.radiusAuto, filter?.radiusBaseKm, filter?.acceptedVehicleTypes, filter?.routeMode]);

    /**
     * ↩︎ **되돌리기 — 서버에 저장된 값으로** (이식 C4-10).
     *
     * ⚠️ 예전 이름은 「🔄 평소값 불러오기」였다. **세 번째 저장처럼 보였지만 실은
     *    되돌리기**였다 — 이름이 셋이라 헷갈렸던 것이지 구조는 처음부터 둘이었다.
     * 🔴 폼만 되돌리지 않고 **메모리까지** 되돌린다. 화면과 콜 잡기가 갈라지면 안 된다.
     */
    const handleRevert = () => {
        if (!baseFilter) return;
        const v = toForm(filterValuesFrom(baseFilter as any));
        setForm(v);
        fillQuad(baseFilter);
        setExDraft(baseFilter.excludedRegions ?? []);
        setBlacklist(baseFilter.excludedKeywords ? baseFilter.excludedKeywords.join(',') : "");
        /* 되돌린 직후 💾 가 헛쓰기를 하지 않게 «담아 둔» 깃발도 내린다 (조사 ①-8 부수) */
        setQuadDirty(false); setExDirty(false); setBlacklistDirty(false);
        updateFilter({
            ...toValues(v, filterValuesFrom(baseFilter as any)),
            ...quadShapeFrom(baseFilter as any),
            excludedRegions: baseFilter.excludedRegions ?? [],
            excludedKeywords: baseFilter.excludedKeywords ?? [],
            /* 📐🚚 오늘 판 셋도 서버 값으로 (조사 ①-5) */
            radiusAuto: !!baseFilter.radiusAuto,
            radiusBaseKm: baseFilter.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT,
            acceptedVehicleTypes: baseFilter.acceptedVehicleTypes ?? [],
            routeMode: baseFilter.routeMode ?? true,   // 🛣️🔷 (조사 ①-9)
        });
    };

    // 귀가콜 소켓 이벤트 리스너
    useEffect(() => {
        const onAck = () => {
            setHomeReturnLoading(false);
            onClose();
        };
        const onError = (data: { message: string }) => {
            setHomeReturnLoading(false);
            alert(data.message);
        };
        socket.on("home-return-ack", onAck);
        socket.on("home-return-error", onError);
        return () => {
            socket.off("home-return-ack", onAck);
            socket.off("home-return-error", onError);
        };
    }, [onClose]);

    if (!isOpen) return null;

    if (!filter) {
        return (
            <div className="flex justify-center py-6">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-4 border-info border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-info font-bold animate-pulse">동기화 대기 중...</span>
                </div>
            </div>
        );
    }

    /**
     * 💾 **서버 저장 — 지금 메모리에 있는 것을 DB 에 박는다** (이식 C4-10 · 2026-09-12).
     *
     * ⚠️ 예전엔 저장이 **셋**이었다 (`🔄 평소값` / `🟢 오늘만` / `📌 계속`).
     *    기사님: *"오늘만, 계속, 평소값 **이것이 말이 안 되는것 같다**."* — 맞는 말이었다.
     *    「오늘만」은 이미 **닫기만 해도** 되는 일이고(메모리), 「평소값」은 저장이 아니라
     *    **되돌리기**였다. 진짜 저장은 «계속» 하나뿐이었다.
     *
     * 🔴 그래서 여기는 **언제나 `saveAsDefault = true`** 다 — 메모리와 DB 를 한 번에 맞춘다.
     *    확인창을 안 띄운다: 되돌릴 길(`↩︎ 되돌리기`)이 **옆 칸에** 있다.
     */
    const handleSaveToServer = () => {
        logRoadmapEvent("웹", `필터 서버 저장 — ${unsaved ? '값 변경 있음' : '값 변경 없음'}`);
        const saveAsDefault = true;

        /**
         * 🔴 **값 다섯은 평면 통로 하나로 간다** (이식 C3-3b · 2026-09-11).
         *
         * ⚠️ 예전엔 `savePhase` 로 **국면 다섯 행에 같은 값을 다섯 번** 썼다 (C3-3a 의 전환 모양).
         *    C3-3b 에서 그릇이 한 벌이 되어 **쓸 자리도 하나**가 됐다 —
         *    마름모·제외지역이 이미 쓰던 그 길이다 (기사님: *"개선되어 중복인건 그냥 삭제"*).
         *
         * 🔴 **이름을 옮길 일이 없다.** 폼의 키가 이미 평면(앱 피기백) 이름이라
         *    `applyPhaseToFilter` 같은 다리가 필요 없다.
         *
         * `allowedVehicleTypes` 를 **보내지 않는 이유**는 그대로다 — 허용 차종은 입력이
         * 아니라 파생값이고, 여기서 보내면 서버가 `if (!changes.allowedVehicleTypes)` 에
         * 걸려 자기 계산을 건너뛴다 (2026-08-10 사고).
         */
        updateFilter(toValues(cur, filterValuesFrom(filter as any)), saveAsDefault);

        /**
         * 📐 **마름모는 국면 밖 한 벌이라 평면 통로로 간다** (이식 C3-2).
         *    `savePhase` 에 섞으면 다시 국면마다 한 벌씩 앉는다 — 그게 아침에 갈라진 이유다.
         */
        if (quadDirty) updateFilter(quadShapeFrom(quadForm), saveAsDefault);
        /* 🚫 제외 지역도 국면 밖 한 벌이라 평면 통로로 간다 (이식 C2-2) */
        if (exDirty) updateFilter({ excludedRegions: exDraft, userOverrides: true }, saveAsDefault);

        // 제외 키워드만 다섯 탭 공통이라 평면 필터로 간다
        if (blacklistDirty) {
            updateFilter({
                excludedKeywords: blacklist ? blacklist.split(',').map(t => t.trim()).filter(Boolean) : [],
                userOverrides: true,
            }, saveAsDefault);
        }

        /**
         * 📐🚚 **오늘 판 셋은 이미 메모리에 있다 — 여기서는 DB 까지 보낸다** (조사 ①-5).
         *    이 셋은 만지는 즉시 `updateFilter(…)` 로 갔지만 `saveAsDefault` 없이 갔다.
         *    💾 가 안 실으면 서버 `baseFilter` 에 닿지 않아 자정에 풀린다.
         */
        updateFilter({
            radiusAuto: !!filter?.radiusAuto,
            radiusBaseKm: filter?.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT,
            acceptedVehicleTypes: filter?.acceptedVehicleTypes ?? [],
            routeMode: filter?.routeMode ?? true,   // 🛣️🔷 필터 값이다 (조사 ①-9)
        }, saveAsDefault);

        onClose();
    };

    // ── 적재 칸 (서버 파생값을 그대로 쓴다) ──
    const slotsUsed = Math.round(filter.slotsUsed ?? 0);
    const remainSlots = Math.max(0, TRUCK_CAPACITY_SLOTS - slotsUsed);
    /**
     * 🔴 **지금 적재로 못 받는 차종** — 남은 칸으로 직접 잰다.
     *
     * ⚠️ 처음엔 서버가 낸 `allowedVehicleTypes` 에 없는 것으로 봤는데 **틀렸다**:
     *    그 목록은 이미 «고른 것 ∩ 적재»라, 기사님이 **일부러 뺀 차종**까지 ✕ 가 붙어
     *    **나누려던 두 사실이 화면에서 다시 한 덩어리**가 됐다 (2026-09-12 실측).
     *    여기가 답할 질문은 «내가 안 골랐나»가 아니라 **«지금 실을 자리가 있나»** 다.
     */
    const blockedNow = VEHICLE_PICKS.filter(v => (VEHICLE_CAPACITY[v] ?? 0) > remainSlots);

    /** 하한표 예시 금액용 거리 — 지금 탭이 보는 대표 거리 */
    /* 하한표 예시 거리 — 관내면 시 안이라 짧게 본다 (관내는 파생이다 · C4-8b) */
    const exampleKm = filter.localMode ? 15 : (parseInt(cur.destinationRadiusKm, 10) || 0) + 50;

    /** 지금 탭의 콜할인율(단가 할인율) — 국면마다 따로 기억한다 */
    const callDiscount = parseFloat(cur.callDiscountPct);

    /**
     * 🚫 **저장은 쉼표 문자열 하나, 화면은 말 목록** (이식 C4-6).
     *    그릇을 바꾸지 않는다 — 칩을 눌러도 자유 입력칸을 고쳐도 **같은 한 곳**에 쓴다 (규칙 ③).
     */
    const blacklistWords = blacklist.split(',').map(t => t.trim()).filter(Boolean);
    /* 칩은 한 번뿐이라 **누르는 즉시** 메모리로 (목업과 같다 · 전수 조사 ①-2). `blacklistDirty` 는 💾 용 */
    const setBlacklistWords = (words: string[]) => {
        setBlacklist(words.join(', ')); setBlacklistDirty(true);
        updateFilter({ excludedKeywords: words, userOverrides: true });
    };
    /**
     * 자유 입력칸은 **손을 뗄 때**(blur·Enter) 보낸다 — 글자마다 보내면 「착」「착불」이
     * 차례로 앱에 내려가 그 사이 콜을 엉뚱하게 거른다.
     */
    const commitBlacklist = () => {
        const words = blacklist.split(',').map(t => t.trim()).filter(Boolean);
        updateFilter({ excludedKeywords: words, userOverrides: true });
    };

    const handleBlacklistChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value;
        // 다중 엔터 방지 (줄바꿈을 콤마로 치환)
        val = val.replace(/[\r\n]+/g, ',');
        // 허용되지 않은 특수문자 제거 (한글, 영문, 숫자, 공백, 콤마만 허용)
        val = val.replace(/[^a-zA-Z0-9가-힣\s,]/g, '');
        // 콤마 다중 연타 방지
        val = val.replace(/,+/g, ',');
        setBlacklist(val);
        setBlacklistDirty(true);
    };

    return (
        <>
            {/**
              * 🪗 **팝업이 아니라 «열림»이다** (이식 C4-3 · 기사님 2026-09-09:
              *    *"팝업을 삭제하고 한 줄과 열림만 있으면 될 것 같아."*).
              *
              * 요약줄 **바로 아래**에 형제로 붙는다 — 덮지 않는다. 층이 셋(접힘 → 펼침 →
              * 팝업)이던 것이 둘(한 줄 → 열림)이 됐다.
              *
              * 📜 **높이 제한은 그대로 필요하다** (기사님 실측 2026-08-26:
              *    *"일단 필터 옵션창에 스크롤부터 넣어야겠다. 입력할 수가 없어."*).
              *    🔴 `dvh` 여야 모바일 주소창이 접혔다 펴져도 안 잘린다 — 폰에서 보는 화면이다.
              *    탭 다섯이 빠져(C3-3a) 세로가 줄었지만, 지도·시트와 자리를 나눠 쓰므로
              *    **여기서 제 높이를 못 박는다.**
              */}
            <section className="relative max-h-[70dvh] bg-bg-base border border-border rounded-xl shadow-lg p-4 overflow-hidden flex flex-col gap-3">
                <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-info/10 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-success/10 blur-[100px] rounded-full pointer-events-none" />

                {/**
                  * 🔴 **머리줄을 걷었다** (기사님 판단 2026-09-11 — 넷을 짚으시며 *"이것이 필요한건지 판단해"*).
                  *
                  *   · «필터 설정»    요약줄을 눌러 연 것이라 **자명하다**
                  *   · «오늘 콜 잡기» 아래 저장 버튼 둘(서버 저장·되돌리기)이 **더 정확히** 말한다
                  *   · «합짐 중»      **요약줄이 이미** «합짐 탐색중»이라고 말한다 — 열면 또 적는 중복
                  *
                  * 🔴 «지금 무엇을 하나»가 사라진 것이 아니다 — 요약줄이 그 일을 한다.
                  *    한 화면에 같은 말이 두 번 있으면 **그게 거짓말이 될 자리**를 만든다 (규칙 ③).
                  *
                  * ✕ 만 남겨 **줄을 안 먹게** 띄운다 — 팝업이 아니라 «바깥 누르기»가 없으므로
                  * 닫는 길은 눈에 보여야 한다.
                  */}
                <button type="button" onClick={onClose} title="접기"
                    className="absolute top-2 right-2 z-30 w-7 h-7 rounded-lg text-text-muted
                               hover:bg-surface-hover/60 text-[14px] font-black">
                    ✕
                </button>

                {/**
                  * 🛣️ **노선 ↔ 🔷 동선 — 지도에서 이사해 왔다**
                  *    (기사님 지시 2026-09-11: *"노선 동선 버튼도 지도에서 필터로 이사와야해"*).
                  *    **목업이 그 자리다** — 필터 맨 위, 목적지 줄 바로 위 (`MapMockup.tsx:3171`).
                  *
                  * 🔴 «그물을 어떤 모양으로 볼까»라 **국면(어디로 가나)과 다른 축**이다.
                  *    노선이면 경로 양옆(라인반경), 동선이면 내 위치 → 목적지 마름모.
                  * ⚠️ 상태는 부모가 쥔다 — 지도와 **같은 값**을 봐야 한다 (규칙 ③).
                  */}
                <div className="grid grid-cols-2 gap-1 relative z-10">
                    {([[true, '🛣️ 노선', '지금 경로 양옆으로 본다'],
                       [false, '🔷 동선', '내 위치 → 목적지 마름모로 본다']] as const).map(([on, label, hint]) => (
                        <button key={label} type="button" onClick={() => setRouteMode(on)} title={hint}
                            className={`py-2 rounded-lg border text-[12px] font-black transition-all ${routeMode === on
                                ? (on ? 'border-warning/55 bg-warning/15 text-warning' : 'border-info/55 bg-info/15 text-info')
                                : 'border-border-card bg-background text-text-muted hover:border-border-hover'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/**
                  * 🎯 **목적지 설명줄 — 목업 그대로** (`MapMockup.tsx:3104` · 전수 조사 4단계).
                  *    «어디로 · 지금 무슨 국면 · 노선/동선» 을 한 줄로. 복귀를 켜면 **집 시**가 적힌다
                  *    (`goalCity` 파생) — 기사님이 정한 목적지 칸은 그대로다.
                  * ⚠️ 목업의 «마름모 N개»는 실물에 없는 개념(목적지가 하나)이라 **적지 않는다** (규칙 ④).
                  */}
                <p className="text-[10.5px] text-text-muted leading-snug px-0.5">
                    🎯 목적지 <b className="text-text-primary">{filter?.goalCity || filter?.destinationCity || '—'}</b>
                    {' · '}운행 <b className="text-text-primary">{filter?.dispatchPhase === 'DELIVERING' ? '주행 중' : filter?.dispatchPhase === 'GATHERING' ? '콜 쥠' : '대기'}</b>
                    {' · '}<b className="text-info">{routeMode ? '🛣️ 노선' : '🔷 동선'}</b>
                </p>
                {/**
                  * ⏳ **이상한 상태 하나만 적는다** (목업 `MapMockup.tsx:3187` · 기사님 2026-09-09
                  *    *"«콜을 잡으면 그 경로가 라인이 됩니다» 이것도 필요 없어"*): 늘 참인 말은 안 적는다.
                  *    남긴 하나 — 콜은 잡았는데 경로가 아직 안 와서 마름모인 것. 그건 몰라선 안 된다.
                  *    «라인으로 쟀나»는 무대만 안다 — store(`netUsedLine`)로 받는다. 모르면(null) 안 띄운다.
                  */}
                {routeMode && netUsedLine === false && filter?.isSharedMode && (
                    <p className="text-[10.5px] text-warning font-bold leading-snug px-0.5">
                        ⏳ 카카오 경로를 기다립니다 — 올 때까지는 마름모로 봅니다 (직선으로 지어내지 않습니다)
                    </p>
                )}

                {/**
                  * 🔴 **탭 다섯이 있던 자리다** (이식 C3-3a · 기사님 확정 2026-09-11 *"그 기준은 바꿔"*).
                  *    값이 한 벌이 되었으니 고를 것이 없다. 「지금 무엇을 하나」는 위 제목줄의
                  *    배지가 말하고, 아래 문구들(무엇을 찾는 중인가 · 요약줄의 «N 읍면동»)이 그것을 따라간다.
                  */}
                {/**
                     * 🔴 `flex-1 min-h-0` — **`min-h-0` 이 없으면 스크롤이 안 걸린다.**
                     *    flex 자식은 기본이 `min-height:auto` 라 내용보다 작아지지 않는다.
                     *    그래서 `overflow-y-auto` 가 있어도 넘칠 일이 없어 그냥 자란다.
                     */}
                    <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-1 pb-1 custom-scrollbar relative z-10">
                    {/* 🎨 섹션 사이 8px — 목업 aside 의 `gap-2` (전수 조사 ③). 맨 div 라 다섯 덩이가 붙어 있었다 */}
                    <div className="space-y-2">
                        {/**
                          * 🗂️ **순서는 목업 그대로다** (기사님 지시 2026-09-11:
                          *    *"디자인은 목업처럼 해주면 되고"* · `MapMockup.tsx:3145~3402`).
                          *
                          *    국면 셋 → 노선/동선 → **목적지 → 그물의 모양 → 반경 → 값 둘 → ⛔ 제외지역**
                          *
                          * ⚠️ 전에는 제외 단어·제외 지역이 **맨 위**, 목적지·반경이 **맨 아래**라
                          *    목업과 거꾸로였다. «어디로 가나»부터 정하고 «무엇을 뺄까»로 끝나는 것이
                          *    기사님이 실제로 만지시는 순서다.
                          * 🔴 **적재 패널은 걷었다** (기사님 2026-09-09: *"적재는 상태값이니 필요 없고"*).
                          *    요약줄이 이미 `📦 90/100` 을 말한다 — 두 번 적을 자리가 아니다.
                          */}
                        {/**
                          * 🎯 **목적지 — 도를 고르고 시를 고른다** (이식 C4-2 · 2026-09-11).
                          *
                          * 기사님 확정 2026-09-09: *"**선택이 어려우니 도를 선택하고 시를
                          * 선택하게 할까?**"* — 전국 시·군이 든 `<select>` 하나를 폰에서
                          * 스크롤해 집는 것은 **운전 중에 불가능하다.**
                          *
                          * 🔴 **다섯 행 중 첫짐만 이 값을 입력으로 가진다** — 나머지는 서버가
                          *    경로·GPS·집 주소에서 파생한다. 그래서 여기는 늘 «첫짐의 목적지»다.
                          *
                          * 🔴 **목록의 원천은 `cityGroups` 하나다** (서버가 콜을 검색할 수 있는 시).
                          *    바로 아래 제외 지역이 쓰는 `sidoList()` 는 **지도 데이터(행정동)** 라
                          *    다른 질문에 답한다 — 섞으면 2026-08-12 사고가 되돌아온다
                          *    (화면이 `파주` 를 못 찾고 첫 항목 «용인시»를 그렸다).
                          *
                          * ⚠️ **↩️ 복귀 칸은 여기 없다.** 기사님은 *"복귀도 목적지와 같은 뎁스"*
                          *    라고 하셨지만, 목업의 복귀는 «목적지를 하나 더 얹기»(공짜로 되돌림)인 반면
                          *    실물의 복귀는 **`callTarget` 전환**(명세 §4-2 가 팝업에서 금지 —
                          *    기사님 *"필터가 쉽게 바뀌면 오작동"*)이거나 **귀가콜 오더 생성**이다.
                          *    토글로 켰다 끌 물건이 아니라 **따로 선다** (C4-2b).
                          */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-text-muted pl-1">
                                {FILTER_FIELDS.find(f => f.path === 'destinationCity')!.label}
                                {(filter.dispatchPhase ?? 'STANDBY') !== 'STANDBY' && (
                                    <span className="ml-1 font-normal text-text-muted/70">
                                        {/* 🔴 «왜 지금 이 칸이 안 쓰이나»를 화면이 말한다.
                                            복귀처럼 **실제 값이 있으면 그 값**을 보여 준다 (빈 말은 고장으로 보인다) */}
                                        · 지금은 자동 ({tab === 'home' && homeAddress ? homeAddress : PHASE_AUTO_SOURCE[tab]})
                                    </span>
                                )}
                            </label>
                            <div className="relative grid grid-cols-3 gap-1">
                                <PickLayer label="🎯 도" value={dstSido || '— 선택 —'}
                                    options={cityGroups.map(g => g.sido)}
                                    open={openKnob === 'dstSido'}
                                    onToggle={() => setOpenKnob(o => o === 'dstSido' ? null : 'dstSido')}
                                    onPick={(v) => {
                                        setDstSido(v);
                                        /* 🔴 도를 옮기면 시도 그 도의 것으로 따라간다 —
                                           안 그러면 «경기 + 김포시» 같은 짝이 화면에 남는다 */
                                        pickField('destinationCity', citiesOf(v)[0] ?? '');
                                    }} />
                                <PickLayer label="시·군·구"
                                    value={cur.destinationCity
                                        ? (knownCities.includes(cur.destinationCity)
                                            ? cur.destinationCity
                                            : `⚠️ ${cur.destinationCity} (목록에 없음)`)
                                        : '— 선택 —'}
                                    options={citiesOf(dstSido)}
                                    open={openKnob === 'dstCity'}
                                    onToggle={() => setOpenKnob(o => o === 'dstCity' ? null : 'dstCity')}
                                    onPick={(v) => pickField('destinationCity', v)} />
                                {/**
                                  * ↩️ **복귀 — 고르는 것은 «집으로 갈지 말지» 하나다**
                                  *    (기사님 확정 2026-09-11: *"우린 집으로 갈건지 말껀지만 있어"* ·
                                  *     2026-09-09: *"복귀는 토글로 눈에 띄게 해줘. 목적지 → 복귀"*).
                                  *
                                  * 🔴 **목업이 그 모양이다** — 고르는 것은 `homeOn` 하나이고
                                  *    `callTarget` 은 파생이다 (`MapMockup.tsx:978`):
                                  *    `homeOn ? 'HOME' : localMode ? 'LOCAL' : 'DEST'`.
                                  *
                                  * 🔴 **고르는 값과 켜고 끄는 값은 모양도 달라야 한다** — 옆 두 칸(도·시군구)은
                                  *    목록에서 «고르는» 것이고 이것은 «켜고 끄는» 것이다.
                                  *
                                  * 🔴 **확인창은 그대로다** (기사님 2026-08-14: *"버튼을 누르게 하고
                                  *    알럿창으로 확인받는 것이 안전할 듯하다"*). 되돌리려면 경유를
                                  *    통째로 다시 계산한다 — 실수로 스친 손가락에 바뀌면 안 된다.
                                  *
                                  * ⚠️ **관내는 «고르는 것»에서만 뺐다.** 지금 관내면 아래에서 보여만 준다 —
                                  *    실물의 `LOCAL`(목적지를 지금 시로 바꾼다)과 목업의 `localMode`
                                  *    (재는 법만 바꾼다)는 **다른 물건**이라 파생으로 돌리는 것은 따로 선다.
                                  */}
                                {(() => {
                                    const homeOn = (filter.callTarget ?? 'DEST') === 'HOME';
                                    /* 🏘️ 관내는 **서버가 파생**한다 (C4-8b) — 고르는 값이 아니라 «지금 그렇다»다 */
                                    const isLocal = filter.localMode === true;
                                    return (
                                        <button type="button" onClick={() => goPhase(homeOn ? 'DEST' : 'HOME')}
                                            title={homeOn ? '끄면 원래 목적지로 돌아갑니다' : '켜면 집 방향 콜을 찾습니다'}
                                            className={`flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-lg border text-left transition-colors ${homeOn
                                                ? 'bg-warning/25 border-warning text-warning'
                                                : 'border-border-card bg-background hover:border-border-hover'}`}>
                                            <span className={`text-[9.5px] font-bold leading-tight ${homeOn ? '' : 'text-text-muted'}`}>
                                                {/* 🔴 관내는 «지금 그렇다»만 말한다 — 누르는 것은 여전히 복귀다 */}
                                                {isLocal ? '🏘️ 관내 · ↩️ 복귀' : '↩️ 복귀'}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${homeOn ? 'bg-warning justify-end' : 'bg-border-card justify-start'}`}>
                                                    <span className="w-3 h-3 rounded-full bg-surface shadow" />
                                                </span>
                                                <span className={`text-[11px] font-black leading-tight ${homeOn ? 'text-warning' : 'text-text-muted'}`}>
                                                    {homeOn ? '켬' : '끔'}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* 📐 **마름모의 모양 — 탭 위다** (이식 C3-2 · 2026-09-11 · 명세 §3).
                            제외 단어와 같은 이유다 — 국면과 무관한 한 벌인데 탭 **안**에 두면
                            화면이 "이 국면의 값" 이라고 잘못 말한다. 아침(C3-1)에 탭 안에 뒀다가
                            합짐 행에 손 안 댄 110° 가 앉는 것을 실측하고 옮겼다.
                            라벨·단위·범위는 `QUAD_FIELDS` 한 곳에서 온다 (규칙 ③). */}
                        {/* 🔴 **테두리 박스를 벗겼다** (C4-7) — 목업은 3칸 격자가 죽 이어진다.
                            박스를 겹겹이 두르면 폰에서 그 선들이 자리를 먹는다
                            (기사님: *"작은 면적에 필요한 것만 잘 디스플레이하고 싶다"*).
                            머리글 한 줄은 남긴다 — «이게 지도에 바로 보인다»는 말이 필요하다 */}
                        <div className="relative z-10 space-y-1">
                            <div className="flex items-baseline justify-between px-0.5">
                                <span className="text-[10.5px] font-black text-text-muted">📐 그물의 모양</span>
                                <span className="text-[9.5px] font-bold text-text-muted">지도에 바로 보입니다</span>
                            </div>
                            {/**
                              * 🎚️ **숫자판이 아니라 슬라이더 레이어다** (이식 C4-1 · 2026-09-11).
                              *
                              * 🔴 **아침에 이 칸을 `type="number"` 로 팠던 것이 지시 위반이었다.**
                              *    기사님 2026-09-09: *"커서 확인하고 숫자 지우고 입력하고 힘들어"* ·
                              *    *"클릭하면 슬라이더가 보이는 건 어때?"* · *"밀리는 것 없이 레이어로"*.
                              *    목업에 이미 답(`KnobGrid`)이 있었는데 실물에 새 칸을 손으로 판 것이다.
                              *
                              * 라벨·단위·범위에 더해 **한 칸(step)도 표에서 온다** — 화면이 «각도면 10»을
                              * 제 손으로 판단하면 표와 갈라진다 (규칙 ③).
                              */}
                            <KnobGrid open={openKnob} onOpen={setOpenKnob}
                                knobs={QUAD_FIELDS.map(f => {
                                    /**
                                     * 📐 **마름모반경도 자동을 따른다** (이식 C4-12 · 2026-09-12).
                                     *    각도 둘은 «방향 허용폭»이라 거리와 무관 — **안 건드린다.**
                                     * 🔴 안 고쳤더니 실측에서 **서버와 지도는 6.2km 로 줄였는데
                                     *    이 칸만 25km 라고 적고 있었다** (규칙 ⑤-4 ④ — 화면이 조용히 거짓말).
                                     */
                                    const isRadius = f.path === 'quadRadiusKm';
                                    const auto = radiusAuto && isRadius;
                                    return {
                                        key: f.path,
                                        label: f.label,
                                        unit: f.unit,
                                        value: auto
                                            ? Math.round(shownRadii.quadRadiusKm * 10) / 10
                                            : Number(quadForm[f.path] ?? 0),
                                        min: f.min,
                                        max: f.max,
                                        step: f.step,
                                        dim: auto,
                                        /**
                                         * 🔴 **끌면 지도가 따라오고, 뗄 때 서버로** — 반경 셋과 같은 규칙 (전수 조사 ①-2).
                                         *    이 셋만 `set` 이 폼만 바꿔서 «지도에 바로 보입니다»가 거짓이었다.
                                         *    `quadDirty` 는 💾(DB) 용으로 그대로 든다.
                                         */
                                        set: auto ? () => {}
                                            : (v: number) => { const next = { ...quadForm, [f.path]: String(v) }; setQuadForm(next); setQuadDirty(true); previewFilter(quadShapeFrom(next)); },
                                        onPreview: auto ? undefined
                                            : (v: number) => previewFilter(quadShapeFrom({ ...quadForm, [f.path]: String(v) })),
                                        onCommit: auto ? undefined
                                            : (v: number) => updateFilter(quadShapeFrom({ ...quadForm, [f.path]: String(v) })),
                                    };
                                })} />
                        </div>

                        {/**
                          * 🎚️ **반경 셋 — 숫자판이 아니라 슬라이더 레이어** (C4-1 과 같은 부품).
                          *
                          * 🔴 **감추지 않고 흐리게 둔다.** «지금 이 칸이 쓰이나»는 **상태에서 파생**하고(노선일 때만 라인반경 · 자동이면 반경 넷),
                          *    그 그 답은 **`dim` 으로만** 간다 — 감추면 «이 값이 어디 갔나»가 되고
                          *    그냥 두면 «지금 쓰이는 값»으로 읽힌다 (기사님 2026-09-09 *"모두 꺼내 두고"*).
                          */}
                        {/**
                          * 📐 **[자동 | 수동]** (이식 C4-12 · 2026-09-12).
                          *    기사님: *"목적지와의 거리에 따라 … **자동으로 바뀌어 주면 좋겠다.
                          *    그래서 자동, 수동으로** 만들어 주는 거야."*
                          *
                          * 🔴 실측: 초월→성남은 15.6km 인데 현위 10 + 목적 15 = **25km** —
                          *    원 둘이 서로를 덮어 **마름모·각도가 아무 일도 안 한다**(폭 0).
                          *    기준 40km 의 근거는 `shared` 의 `RADIUS_BASE_KM_DEFAULT` 주석에.
                          */}
                        <div className="flex items-center justify-between gap-2 px-0.5 pb-1">
                            <span className="text-[10.5px] font-black text-text-muted">📐 반경</span>
                            <div className="flex rounded-lg border border-border-card overflow-hidden">
                                {([true, false] as const).map(on => (
                                    <button key={String(on)} type="button"
                                        onClick={() => updateFilter({ radiusAuto: on })}
                                        className={`px-2.5 py-0.5 text-[10.5px] font-bold ${
                                            radiusAuto === on ? 'bg-info/15 border-info/55 text-info font-black' : 'text-text-muted'}`}>
                                        {on ? '자동' : '수동'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <KnobGrid open={openKnob} onOpen={setOpenKnob} cols={4}
                            knobs={[...KNOB_FIELDS.map(path => {
                                const f = FILTER_FIELDS.find(x => x.path === path)!;
                                /**
                                 * 🔴 **자동이면 «줄인 값»을 보여 준다** — 기사님이 정한 원값에
                                 *    서버가 실어 보낸 배율을 곱한다. 원값은 **안 건드린다** (규칙 ④):
                                 *    수동으로 돌리면 그 값이 그대로 살아 있다.
                                 */
                                const raw = Number(cur[path] ?? 0);
                                const KEY = { pickupRadiusKm: 'pickupRadiusKm', destinationRadiusKm: 'destinationRadiusKm',
                                              detourRadiusKm: 'detourRadiusKm' } as const;
                                const shown = radiusAuto
                                    ? Math.round(shownRadii[KEY[path as keyof typeof KEY]] * 10) / 10
                                    : raw;
                                return {
                                    key: path,
                                    label: f.label,
                                    unit: f.unit,
                                    value: shown,
                                    min: f.min,
                                    max: f.max,
                                    step: f.step,
                                    /* 🔴 **감추지 않고 흐리게** — 자동이거나 지금 안 쓰이는 칸 */
                                    dim: !inUse(path) || radiusAuto,
                                    /* 🔴 자동이면 **손으로 못 민다** — 밀면 화면과 값이 갈라진다 */
                                    set: radiusAuto ? () => {} : (v: number) => setField(path, String(v)),
                                    /* 🔴 끄는 동안은 **지도까지** 따라 온다 — 소켓은 안 탄다 (C4-11) */
                                    onPreview: radiusAuto ? undefined
                                        : (v: number) => previewValues({ ...cur, [path]: String(v) }),
                                    /* 🔴 **뗄 때** 서버로 (C4-10) */
                                    onCommit: radiusAuto ? undefined
                                        : (v: number) => pickField(path, String(v)),
                                };
                            }), {
                                /**
                                 * 📏 **기준 거리 — «지금 값이 몇 km 갈 때 맞춘 것인가»** (기사님 2026-09-12:
                                 *    *"7번 칸을 만들어줘"* · 조사 ①-7). DB·서버·재계산 조건까지 있는데
                                 *    **화면에 칸이 없어** 고아였다 — 늘 40 으로만 돌았다.
                                 * 🔴 **자동일 때만 산다.** 수동이면 흐리고, 자동이면 반대로 나머지 셋이 흐리다.
                                 * ⚠️ 폼(`cur`)에 없는 값이다 — 끄는 동안은 `previewFilter`, 뗄 때 `updateFilter`.
                                 */
                                key: 'radiusBaseKm',
                                label: '기준거리',
                                unit: 'km',
                                value: filter?.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT,
                                min: 10,
                                max: 100,
                                step: 5,
                                dim: !radiusAuto,
                                set: radiusAuto ? (v: number) => previewFilter({ radiusBaseKm: v }) : () => {},
                                onPreview: radiusAuto ? (v: number) => previewFilter({ radiusBaseKm: v }) : undefined,
                                onCommit: radiusAuto ? (v: number) => updateFilter({ radiusBaseKm: v }) : undefined,
                            }]} />

                        {/**
                          * 💰🚫 **값 둘도 같은 고르기 칸으로** (기사님 2026-09-09:
                          *    *"[콜할인율] 이 부분도 디자인에 맞춰 이쁘게 바꿔줘"*).
                          *    위의 목적지·손잡이들과 **같은 자리·같은 방식**이라야 조작이 하나다.
                          *
                          * 🔴 **차종별 하한표는 레이어 «안»으로 들어갔다** — 늘 펴 두면 폰에서 필터가
                          *    화면을 다 먹는다 (기사님: *"작은 면적에 필요한 것만 잘 디스플레이"*).
                          *    기사님 2026-09-09: *"읽을 수 있게 통로를 열어 줘야지"* — 없애지 않고 접었다.
                          *
                          * ✅ **«🚚 받을 짐»이 아래에 들어왔다** (이식 C4-6b · 2026-09-12).
                          */}

                        <div className="relative grid grid-cols-3 gap-1">
                            <PickLayer label="💰 콜할인율"
                                value={callDiscount >= 100 ? '전부' : callDiscount === 0 ? '시세' : `-${callDiscount}%`}
                                options={CALL_DISCOUNT_STEPS.map(st => st.label)}
                                open={openKnob === 'discount'}
                                onToggle={() => setOpenKnob(o => o === 'discount' ? null : 'discount')}
                                onPick={(v) => {
                                    const st = CALL_DISCOUNT_STEPS.find(x => x.label === v);
                                    if (st) pickField('callDiscountPct', String(st.value));
                                }}
                                foot={
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-start justify-between gap-2 pb-1 border-b border-border/50">
                                            <span className="text-[10px] font-black text-text-primary">{FLOOR_TITLE[tab]}</span>
                                            <span className="text-[9.5px] text-text-muted/70 text-right whitespace-nowrap">통과 = 요금 ≥ 배송거리 × 단가</span>
                                        </div>
                                        {/* 남은 용량에 안 들어가는 차종은 흐리게 — 잡아도 못 싣는다 */}
                                        {RATE_TABLE_ORDER.map(v => {
                                            const floor = Math.round((NET_RATE_PER_KM[v] ?? 0) * Math.max(0, 1 - callDiscount / 100));
                                            const slot = VEHICLE_CAPACITY[v] ?? 0;
                                            const fits = slot <= remainSlots;
                                            return (
                                                <div key={v} className={`flex items-center justify-between text-[10px] ${fits ? '' : 'opacity-35'}`}>
                                                    <span className="text-text-muted font-bold">
                                                        {v}<span className="text-text-muted/60 font-normal ml-1">시세 {NET_RATE_PER_KM[v]}원/km · 짐 {slot}박스</span>
                                                    </span>
                                                    <span className="font-mono font-black text-success whitespace-nowrap">
                                                        {!fits ? <span className="text-text-muted font-normal">용량 부족</span>
                                                         : callDiscount >= 100 ? '전부'
                                                         : <>≥ {floor.toLocaleString()}원/km
                                                             <span className="text-text-muted/60 font-normal ml-1.5">{exampleKm}km면 {(floor * exampleKm).toLocaleString()}</span>
                                                           </>}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>} />
                            {/**
                              * 🚫 **제외 단어 — 자주 쓰는 것은 눌러서, 나머지는 손으로** (C4-6).
                              *
                              * 🔴 **목업처럼 1칸으로 접되 자유 입력을 없애지 않는다.** 목업의 여섯은
                              *    목업이라 고정이고, 실물은 기사님이 **아무 단어나** 넣으실 수 있어야 한다 —
                              *    목록만 남기면 기능이 준다. 그래서 레이어 «안»에 입력칸을 그대로 둔다.
                              * 🔴 기사님 2026-09-09: *"제외 단어는 입력이 필요하다. 펼치면 내용을 볼 수 있다."*
                              */}
                            {/**
                              * 🚚 **받을 짐 — 목업 그대로** (이식 C4-6b · `MapMockup.tsx:3214`).
                              *
                              * 기사님 2026-09-12: *"**디자인도 보여주고 목업에 코드도 다 있는데.**"* —
                              * 처음에 별도 줄에 버튼 다섯을 새로 그렸다가 걷어냈다.
                              * 목업은 **콜할인율·받을 짐·제외 단어 3칸**이고 값은 `1t·다` 로 짧다.
                              *
                              * 🔴 **보내는 것은 «고른 것»뿐이다** (`acceptedVehicleTypes`).
                              *    허용 목록(`allowedVehicleTypes`)을 손으로 보내면 서버가
                              *    `if (!changes.allowedVehicleTypes)` 에 걸려 **제 계산을 건너뛴다**
                              *    (2026-08-10 사고).
                              * 🔴 **지금 적재로 막힌 차종은 이름 뒤에 «✕»를 붙여 남긴다** —
                              *    감추지 않는다 (규칙 ⑤-2). 「왜 이 콜이 안 올라오나」가 읽혀야 한다.
                              */}
                            <PickLayer label="🚚 받을 짐"
                                value={accepted.length ? accepted.map(v => VEHICLE_SHORT[v] ?? v).join('·') : '모두'}
                                options={[...VEHICLE_PICKS]}
                                /* 🔴 ✕ 는 옵션 글자에 안 붙인다 — 붙이면 `selected` 비교가 깨져
                                      막힌 차종은 골라도 강조가 안 켜진다 (2026-09-12 실측) */
                                mark={Object.fromEntries(blockedNow.map(v => [v, '✕']))}
                                keepOpen selected={accepted}
                                open={openKnob === 'vehicles'}
                                onToggle={() => setOpenKnob(o => o === 'vehicles' ? null : 'vehicles')}
                                onPick={toggleVehicle}
                                foot={
                                    <div className="flex flex-col gap-0.5 text-[10px] tabular-nums">
                                        <span className="text-[9.5px] font-bold text-text-muted">
                                            지금 남은 칸 <b className="text-text-primary">{remainSlots}</b> — ✕ 는 지금 적재로 못 받는 것
                                        </span>
                                        {VEHICLE_PICKS.map(v => (
                                            <div key={v} className="flex justify-between gap-1">
                                                <span><b>{v}</b> <span className="text-text-muted">짐 {VEHICLE_CAPACITY[v] ?? '?'}박스</span></span>
                                                <b className={blockedNow.includes(v) ? 'text-text-muted' : 'text-info'}>
                                                    {blockedNow.includes(v) ? '지금 못 받음' : '받는다'}
                                                </b>
                                            </div>
                                        ))}
                                    </div>} />
                            <PickLayer label="🚫 제외 단어" tone="warning" keepOpen
                                value={blacklistWords.length ? `${blacklistWords.length}개` : '없음'}
                                options={COMMON_EXCLUDED_WORDS}
                                selected={blacklistWords}
                                open={openKnob === 'words'}
                                onToggle={() => setOpenKnob(o => o === 'words' ? null : 'words')}
                                onPick={(v) => setBlacklistWords(
                                    blacklistWords.includes(v) ? blacklistWords.filter(w => w !== v) : [...blacklistWords, v])}
                                foot={
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[9.5px] font-bold text-text-muted">목록에 없는 말은 여기에 — 쉼표로 나눕니다</span>
                                        <Input type="text" value={blacklist} onChange={handleBlacklistChange}
                                            onBlur={commitBlacklist} onKeyDown={e => { if (e.key === 'Enter') commitBlacklist(); }}
                                            placeholder="착불, 수거"
                                            className="h-8 bg-surface-alt/50 border-border text-[12px] text-text-primary font-bold" />
                                    </div>} />
                        </div>

                        {/**
                          * 🚫 **제외 지역 — 탭 위다** (이식 C2-2 · 2026-09-11 · 명세 §3).
                          *    *"거긴 안 간다"* 는 그 지역이지 그 국면의 사정이 아니다.
                          *
                          * 🔴 **고르기 칸은 목업과 같은 부품**(`PickLayer`)이다 — 손맛이 갈리면
                          *    두 화면이 다른 물건이 된다. 도 한 층이 있는 이유는 기사님이
                          *    서울을 빼려고 **구 25개를 하나씩** 누르고 계셨기 때문이다 (2026-09-09).
                          * 🔴 **💾 를 눌러야 저장 대상이 된다** — 칩 하나 잘못 눌러 그 지역이
                          *    곧장 살아나면 안 된다.
                          */}
                        {/* 🔴 **박스 대신 구분선 하나** — 목업 그대로 (`MapMockup.tsx:3288`).
                            «여기서부터는 빼는 것»이 선 하나로 충분히 갈린다 */}
                        <div className="relative z-20 border-t border-border-card pt-2 space-y-1">
                            <div className="flex items-baseline justify-between px-0.5">
                                <span className="text-[10.5px] font-black text-danger">🚫 제외 지역</span>
                                {/* 🔴 «국면과 무관»을 뺐다 (C4-7) — 국면이 없어졌으니 낡은 말이다 */}
                                <span className="text-[9.5px] font-bold text-text-muted">
                                    {exDraft.length ? `${exDraft.length}곳 제외` : '없음'}
                                </span>
                            </div>
                            <div className="relative grid grid-cols-3 gap-1">
                                <PickLayer label="⛔ 제외 도" options={sidoList()} tone="danger"
                                    value={`${exSido}${exDraft.includes(`S|${exSido}`) ? ' ⛔' : ''}`}
                                    selected={sidoList().filter(v => exDraft.includes(`S|${v}`))}
                                    open={openKnob === 'exSido'} onToggle={() => setOpenKnob(o => o === 'exSido' ? null : 'exSido')}
                                    onPick={v => { setExSido(v); setExSgg(null); }}
                                    foot={
                                        <button type="button" onClick={() => toggleEx(`S|${exSido}`)}
                                            className={`w-full px-2 py-1.5 rounded-md border text-[11px] font-black ${exDraft.includes(`S|${exSido}`)
                                                ? 'bg-danger/15 border-danger/55 text-danger' : 'border-border-card bg-background text-text-muted hover:border-danger'}`}>
                                            ◼ {exSido} 통째로 제외 {exDraft.includes(`S|${exSido}`) ? '⛔ 켬' : '끔'}
                                        </button>} />
                                <PickLayer label="시·군·구 ⛔ 통째" keepOpen tone="danger" options={sggList(exSido)}
                                    value={(() => { const n = sggList(exSido).filter(g => exDraft.includes(`R|${g}`)).length; return n ? `${n}곳 제외` : (exSgg ?? '고르기'); })()}
                                    selected={sggList(exSido).filter(g => exDraft.includes(`R|${g}`))}
                                    open={openKnob === 'exSgg'} onToggle={() => setOpenKnob(o => o === 'exSgg' ? null : 'exSgg')}
                                    onPick={v => { setExSgg(v); toggleEx(`R|${v}`); }}
                                    foot={<span className="text-[9.5px] font-bold text-text-muted leading-snug">
                                        누르면 <b className="text-danger">그 시·군·구가 통째로</b> 빠집니다 · 다시 누르면 되살아납니다 ·
                                        마지막에 누른 곳이 <b>읍·면·동 칸</b>의 대상이 됩니다
                                    </span>} />
                                <PickLayer label="읍·면·동" keepOpen tone="danger" options={exSgg ? dongList(exSgg) : []}
                                    value={exSgg ? (() => { const n = dongList(exSgg).filter(d => exDraft.includes(`D|${exSgg}|${d}`)).length; return n ? `${n}개 제외` : '전부 봄'; })() : '—'}
                                    selected={exSgg ? dongList(exSgg).filter(d => exDraft.includes(`D|${exSgg}|${d}`)) : []}
                                    open={openKnob === 'exDong'} onToggle={() => setOpenKnob(o => o === 'exDong' ? null : 'exDong')}
                                    onPick={v => { if (exSgg) toggleEx(`D|${exSgg}|${v}`); }}
                                    foot={!exSgg ? <span className="text-[9.5px] font-bold text-text-muted">시·군·구를 먼저 고르세요</span> : null} />
                            </div>
                            {/**
                              * 🔴 «지금 무엇이 빠져 있나»는 **늘 보인다** — 레이어를 열어야 알면 화면이 조용히 거짓말한다.
                              *    다만 여덟 줄을 늘 펴 두면 폰에서 필터가 화면을 다 먹는다. 그래서
                              *    **닫히면 한 줄, 누르면 전부**다 (목업 그대로 · 기사님 2026-09-09).
                              * 🔴 **닫힌 줄에서는 지우지 못한다** — 잘린 글을 누르다 실수로 되살아나면 안 된다.
                              *    펼쳐야 ✕ 가 달린 칩이 된다.
                              * 🔴 **다 지웠어도 줄은 남는다** — 안 그러면 「💾 저장」이 같이 사라져
                              *    «전부 되살리기»를 적용할 길이 없다.
                              */}
                            {(exDraft.length > 0 || !exApplied) && (!exListOpen ? (
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => setExListOpen(true)}
                                        className={`flex items-center gap-1 min-w-0 flex-1 px-1.5 py-1 rounded-md border bg-background text-left ${
                                            !exApplied ? 'border-warning/55' : 'border-border-card hover:border-danger'}`}>
                                        <span className="shrink-0 text-[10.5px] font-black text-danger">⛔ 제외 {exDraft.length}곳</span>
                                        <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-text-muted">
                                            {exDraft.map(excludedLabel).join(' · ')}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-black text-text-muted">▾ 전부</span>
                                    </button>
                                    {/* 🔴 닫아 둔 채로 고쳤어도 «아직 안 들어갔다»가 보여야 한다 — 여기서 바로 저장한다 */}
                                    {!exApplied && (
                                        <button type="button" onClick={applyExcluded}
                                            className="shrink-0 px-2 py-1 rounded-md border border-info/55 bg-info/15 text-info text-[11px] font-black">
                                            💾 저장
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <div className="flex flex-wrap gap-1">
                                        {exDraft.length === 0 && <span className="text-[10.5px] font-bold text-text-muted">제외한 곳이 없습니다 — 저장하면 전국이 그물에 듭니다</span>}
                                        {exDraft.map(k => (
                                            <button key={k} type="button" onClick={() => toggleEx(k)} title="누르면 되살립니다"
                                                className="px-1.5 py-0.5 rounded-md bg-danger/15 text-danger text-[10.5px] font-black">
                                                ⛔ {excludedLabel(k)} ✕
                                            </button>
                                        ))}
                                    </div>
                                    {/* 💾 접기 옆에 저장 (기사님 2026-09-09 그대로) — 고친 것은 여기를 눌러야 그물에 들어간다 */}
                                    <div className="flex items-center gap-1">
                                        <button type="button" onClick={() => setExListOpen(false)}
                                            className="text-[10px] font-black text-text-muted px-1">▴ 접기</button>
                                        <button type="button" disabled={exApplied} onClick={applyExcluded}
                                            className={`px-2 py-1 rounded-md border text-[11px] font-black ${!exApplied
                                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-card bg-background text-text-muted opacity-50'}`}>
                                            💾 저장{!exApplied ? ` (${exDraft.length}곳)` : ' 완료'}
                                        </button>
                                        {!exApplied && (
                                            <button type="button" onClick={() => setExDraft(filter?.excludedRegions ?? [])}
                                                className="px-2 py-1 rounded-md border border-border-card bg-background text-[11px] font-black text-text-muted">
                                                ↩︎ 되돌리기
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>


                    </div>

                    {/**
                      * 💬 **설명 줄들** — 손잡이는 전부 위로 갔고 여기 남은 것은 «무슨 뜻인가»다.
                      *
                      * 🔴 **테두리 박스를 벗겼다** (C4-7). 반경 칸이 위 3칸으로 옮겨 간 뒤
                      *    이 박스는 **설명만 담은 빈 상자**가 됐다 — 목업에는 이런 상자가 없다.
                      * 🔴 **제목은 «지금 무엇을 하나»를 말한다** (기사님이 국면을 걷으며 남기라 하신 둘 중 하나).
                      *    고르는 탭이 아니라 **지금 국면**을 따라간다.
                      */}
                    <div className="space-y-1.5 px-0.5">
                        <div className="flex items-start justify-between gap-2">
                            <span className={`text-[11px] font-black ${TAB_STYLE[tab].text}`}>{SECTION[tab].title}</span>
                            <span className="text-[10px] text-text-muted/70 text-right leading-tight">{SECTION[tab].hint}</span>
                        </div>

                        {/* ⏱️ 시간 축 예고 (필터 확정안 v2 구현 4 — 계측 단계).
                            상차 반경의 축은 km → 도달 시간(분)으로 개편 예정이다. 계수(분/km)가
                            실측으로 확정되기 전에는 **거르지 않고 안내만** 한다 (기사님 확정 3). */}
                        {/* 🔴 현위반경은 늘 쓰인다 — 국면마다 감추던 규칙이 사라졌다 (C3-3b) */}
                        {(
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                <b className={TAB_STYLE[tab].text}>상차 반경</b>은 곧 <b className="text-text-primary">도달 시간</b>에서
                                자동으로 정해집니다 — 상차 약속(잡은 시각 + {judgmentCfg.unknown.pickupPromiseMin}분) 안에 닿는 거리
                                ≈ {reachRadiusKm(judgmentCfg.unknown.pickupPromiseMin)}km <span className="opacity-70">(잠정 계수 — 실측 수집 중, 아직 거르지 않습니다)</span>
                            </p>
                        )}

                        {/**
                          * 📏 **라인반경이 무슨 뜻인지** (목업 이름 · 기사님 확정 2026-09-09).
                          *
                          * 🔴 **여기 있던 설명이 거짓말이었다** (2026-09-11 정정).
                          *    *"경유 허용 = 카카오 총거리가 늘어나는 만큼 (100km → 105km 면 5km)"* 이라 적어
                          *    뒀는데, 이 값은 실제로 **길 양옆 폭**으로 쓰인다. 목업이 그 사고를 미리
                          *    경고해 뒀다 — *"둘 다 km 라 한 이름으로 부르면 조용히 섞인다."*
                          *    기사님이 «5» 를 넣을 때 **화면이 말하는 뜻과 실제가 달랐다** (규칙 ⑤-4 ④).
                          */}
                        {inUse('detourRadiusKm') && (
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                <b className={TAB_STYLE[tab].text}>라인반경</b> = 지금 경로의 <b className="text-text-primary">길 중심선에서 한쪽으로</b> 몇 km 까지 콜을 받나.
                                {' '}노선일 때만 쓰입니다 — 콜을 안 쥐었으면 마름모가 판단합니다.
                                {cur.detourRadiusKm === '0' && ' 0 이면 길 위의 콜만 잡습니다 — 콜 잡기를 멈추는 게 아닙니다.'}
                            </p>
                        )}

                        {/**
                         * 🔴 **팝업 안에 국면 전환 버튼을 두지 않는다** (명세 §4-2 · 2026-08-14).
                         *
                         * 여기 `🏘️ 이 동네에서 찾기로 전환` · `🏠 복귀행으로 전환` 이 있었다. 뺀 이유 셋:
                         *
                         *   ① 명세가 이미 "팝업에서 삭제 → 메인으로" 라고 정해 뒀다. 내가 어겼다
                         *   ② 같은 조작인데 **한쪽만 확인창이 뜬다.** 요약줄 버튼에는 confirm 이 있고
                         *      여기엔 없었다. 기사님이 *"필터가 쉽게 바뀌면 오작동"* 이라며 넣기로 한
                         *      확인 절차를 이 버튼이 우회했다
                         *   ③ 🔴 **저장 안 한 값을 조용히 버렸다.** 전환 버튼이 `onClose()` 를 부르므로,
                         *      관내 반경을 5 로 고치고 전환을 누르면 5 는 사라지고 서버는 **옛 저장값**으로
                         *      전환한다. 화면에 보이던 숫자와 실제 콜 잡기 기준이 달라진다.
                         *      국면별 저장(§2-4)이 들어오면서 새로 생긴 해악이다
                         *
                         * 국면 전환은 **요약줄 버튼 3개 + confirm** 하나뿐이다 (`OrderFilterStatus`).
                         */}
                        {tab === 'drive' && (
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-text-muted pl-1">지나온 구간</label>
                                {/* 목업은 여기가 선택(자동 제외/유지)이지만 서버에는 **자동 제외뿐이다.**
                                    고를 수 없는 것을 고르는 것처럼 그리면 화면이 거짓말을 한다 */}
                                <div className="h-9 flex items-center px-2 rounded-md bg-surface-alt/30 border border-dashed border-border text-[10px] text-text-muted/80">
                                    자동으로 제외 — GPS 가 지난 구간은 경유에서 빠집니다
                                </div>
                            </div>
                        )}

                        {tab === 'drive' && (
                            <p className="text-[10px] text-text-muted/70">
                                🚀 출발은 <b className="text-text-primary">지도 좌하단 버튼</b>에 있습니다 (운전 중에 팝업을 열지 않도록).
                            </p>
                        )}

                        {/* 🏘️ 관내는 국면이 아니라 **파생**이다 (C4-8b) — 고르는 것이 아니라 «지금 그렇다» */}
                        {filter.localMode && (
                            <p className="text-[10px] text-text-muted leading-relaxed">
                                🏘️ <b className="text-text-primary">관내로 재고 있습니다</b> —
                                상차지와 하차지가 <b className="text-text-primary">모두 같은 시</b>여야 통과합니다
                                (방향은 안 봅니다).
                            </p>
                        )}

                        {tab === 'home' && (
                            <>
                                <p className="text-[10px] text-text-muted leading-relaxed">
                                    기점은 <b className="text-text-primary">짐이 남았으면 마지막 하차지</b>, 다 내렸으면 <b className="text-text-primary">현재 위치</b>입니다.
                                    <br />🏠 전환은 <b className="text-text-primary">요약줄 버튼</b>에 있습니다.
                                </p>
                                {/* 귀가콜은 국면 전환이 **아니다** — 집까지 가는 가상 오더를 만든다.
                                    지금 이것 말고 부르는 곳이 없어서 남겨 뒀다 (§4-2 삭제 목록에도 없다) */}
                                <Button
                                    onClick={() => {
                                        logRoadmapEvent("웹", "귀가콜 시작 버튼 클릭 (복귀 국면 값으로)");
                                        setHomeReturnLoading(true);
                                        const home = toValues(cur, filterValuesFrom(filter as any));
                                        socket.emit("create-home-return", {
                                            detourRadiusKm: home.detourRadiusKm,
                                            destinationRadiusKm: home.destinationRadiusKm
                                        });
                                    }}
                                    disabled={homeReturnLoading || hasHomeReturnActive}
                                    className={`w-full h-10 rounded-xl bg-gradient-to-r from-accent-alt to-accent-alt/70 text-white font-black text-[11px] ${homeReturnLoading || hasHomeReturnActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {homeReturnLoading ? '⏳ 계산중' : hasHomeReturnActive ? '🏠 진행중' : '🏠 귀가콜 만들기'}
                                </Button>
                            </>
                        )}
                    </div>

                    {/**
                      * 🧾 **지역 카드가 여기 있었다** (걷어냄 2026-09-12 · 이식 C4-9).
                      *
                      * 기사님 2026-09-11: *"이건 **지도의 영역으로 표시 되는거라 없어져도
                      * 될꺼 같고** 필터 상태바에 «… · 200읍면동» 이렇게 표현해 주면 될듯."*
                      *
                      * 🔴 «163개 동이 걸립니다» · 시·군·구 칩 · 「🔍 지금 값으로 미리보기」 —
                      *    셋 다 **지도가 이미 그리는 것을 글자로 또 적는 것**이었다.
                      *    값을 만지면 지도가 그 자리에서 바뀌니 미리 볼 것도 없다.
                      * 🔴 수는 **요약줄**이 말한다 (`OrderFilterStatus` · «200 읍면동»).
                      * ⚠️ 시·군·구별 내역은 **현황판의 «🗂️ 영역 — 시군구별»** 칸에 있다.
                      */}

                    {/* 콜 잡기 모드 통제 버튼 영역 (1열 5버튼 구조) */}
                    <div className="pt-2">
                        <div className="grid grid-cols-2 gap-1.5">
                            {/* 💾 **서버 저장** — 하나뿐인 저장. 안 누르고 닫으면 «오늘만»이 된다 */}
                            <Button
                                onClick={handleSaveToServer}
                                title="지금 값을 DB에 저장합니다 (내일 아침에도 이 조건으로 시작)"
                                className="h-11 relative group overflow-hidden rounded-xl bg-gradient-to-r from-success to-success/70 text-white font-black text-[11px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] transition-all px-1"
                            >
                                <span className="relative z-10 drop-shadow-md tracking-wider flex flex-col leading-tight">
                                    💾 서버 저장
                                    <span className="text-[8px] font-bold opacity-80">
                                        {unsaved ? '서버와 다름' : '서버와 같음'}
                                    </span>
                                </span>
                            </Button>

                            {/* ↩︎ **되돌리기** — 서버에 저장된 값으로. 메모리까지 함께 되돌린다 */}
                            <Button
                                onClick={handleRevert}
                                disabled={!baseFilter || !unsaved}
                                title="서버에 저장된 값으로 되돌립니다"
                                className="h-11 rounded-xl bg-gradient-to-r from-surface-alt to-surface-hover text-text-primary font-black text-[11px] shadow-soft hover:shadow-md transition-all px-1 disabled:opacity-40"
                            >
                                ↩︎ 되돌리기
                            </Button>
                        </div>

                        <p className="text-[10px] text-text-muted text-center mt-2">
                            값을 만지면 <b>바로 적용</b>된다 (앱 메모리 · 제외 지역만 칩 줄의 💾 저장) · <b>💾 서버 저장</b>을 눌러야 내일 아침에도 남는다
                        </p>

                        {/* 🩺 **모니터 — 지금 앱에 내려가 있는 필터, 원본 그대로** (필터 정의 6장 ·
                            확정안 구현 7). "이것이 기기이고 오류나 버그가 있을 수 있으니 항상 현재
                            필터 상황을 모니터할 수 있어야 한다." 파생값(키워드·단가표)까지 편다 —
                            이 화면과 폼 위의 값이 다르면 저장이 안 됐거나 서버가 옛 코드다. */}
                        {filter && (
                            <details className="mt-3 rounded-lg border border-border bg-surface-alt/30 px-3 py-2">
                                <summary className="text-[11px] font-bold text-text-muted cursor-pointer select-none">
                                    🩺 지금 앱에 내려간 필터 (원본) — 콜 잡기 {filter.isActive ? 'ON' : 'OFF'}
                                </summary>
                                <div className="mt-2 flex flex-col gap-1 text-[11px] text-text-primary tabular-nums">
                                    <div>국면 <b>{filter.callTarget ?? 'DEST'}</b> · 단계 <b>{filter.dispatchPhase ?? 'STANDBY'}</b>{filter.isSharedMode ? ' · 합짐 모드' : ''}</div>
                                    <div>상차 반경 <b>{filter.pickupRadiusKm}km</b> · 도착 <b>{filter.destinationCity || '—'} {filter.destinationRadiusKm ?? 0}km</b> · 경유 <b>{filter.detourRadiusKm ?? 0}km</b></div>
                                    <div>콜할인율 <b>{filter.callDiscountPct ?? 10}%</b> · 적재 <b>{Math.round(filter.slotsUsed ?? 0)}/{TRUCK_CAPACITY_SLOTS}박스</b> ({filter.capacityConfidence ? CAPACITY_CONFIDENCE_LABEL[filter.capacityConfidence] : '—'})</div>
                                    <div className="text-text-muted">단가 하한(원/km): {RATE_TABLE_ORDER.map(v => `${v} ${filter.ratePerKm?.[v]?.toLocaleString() ?? '—'}`).join(' · ')}</div>
                                    <div className="text-text-muted break-keep">경유 지역 <b className="text-text-primary">{filter.destinationKeywords?.length ?? 0}개 동</b>{(filter.destinationKeywords?.length ?? 0) > 0 && <> — {filter.destinationKeywords!.slice(0, 8).join(', ')}{filter.destinationKeywords!.length > 8 ? ' …' : ''}</>}</div>
                                    <div className="text-text-muted">제외 단어: {(filter.excludedKeywords?.length ?? 0) > 0 ? filter.excludedKeywords!.join(', ') : '없음'}</div>
                                    {/* 앱 호환 파생 — 입력 화면은 철거됐고 값만 내려간다 (확정안 ①-삭제) */}
                                    <div className="text-text-muted opacity-80">피기백 하한/상한(앱 호환 파생): {filter.minFare?.toLocaleString() ?? '—'} / {filter.maxFare?.toLocaleString() ?? '—'}원</div>
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            </section>
        </>
    );
}
