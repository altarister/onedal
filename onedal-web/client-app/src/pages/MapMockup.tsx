import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    PHASE_KEYS, PHASE_LABEL, PHASE_FIELDS, PHASE_AUTO_SOURCE, fieldLabel,
    DEFAULT_PHASE_SETTINGS, normalizePhaseSettings, rateFloorsFrom,
    reachRadiusKm, NET_RATE_PER_KM, VEHICLE_CAPACITY, CAPACITY_CONFIDENCE_LABEL, CALL_TARGET_LABEL,
    type FieldMode, type PhaseKey, type PhaseSettings, type PhaseSettingsMap,
} from '@onedal/shared';
import { buildAppFilterOutput, labPhaseOf, TRUCK_CAPACITY_SLOTS } from './labFilterOutput';
// 🚚 이식 대응표가 이 타입의 원천이다 — 실물 `step_*` 칸과 맞는지는 labPortMap.test.ts 가 지킨다
import { promiseTimes, type StopStep } from './labPortMap';
import {
    buildNet, buildRoadNet, roadZoneOf, judgeGoals, nearestDong, orderStopsInsert, cityCenter, quadTesterOf, isLocalPhase, NET_SRC, NET_DST,
    GONJIAM_DROP, DONGWON_DROP, BORAM_DROP,
    GONJIAM_CALL_PATH, DONGWON_CALL_PATH, BORAM_CALL_PATH, TRAP_DONGS,
    type NetPoint, type TwoStageVerdict,
} from './callNet';
import sidoDataRaw from '../mapData/sidoData.json';
import { apiBase } from '../lib/serverTarget';
import { YEOJU_ROADS } from './roadsYeoju';
import { PAJU_ROADS } from './roadsPaju';

/** 🛣️ 목적지별 실측 길 (카카오 대안 경로 전부) — 없는 목적지는 노선 탭에서 «길 데이터 없음» */
/** 길 하나 — option 은 실시간 결과에만 있다 (추천/최단시간/최단거리/고속도로 피하기/톨게이트 피하기 ×대안) */
type LabRoad = { option?: string; name: string; distKm: number; durMin: number; tollWon?: number | null; line: Array<[number, number]> };
/** 옵션 라벨 → 카카오 호출 축. «대안N» 꼬리는 뗀다 — 대안 번호는 그 검색에서만 유효한 번호라 다른 출발·도착에 못 옮긴다 */
function comboOfOption(option?: string): { priority: string; avoid?: string; label: string } {
    const base = (option ?? '추천').replace(/ 대안\d+$/, '');
    if (base === '최단시간') return { priority: 'TIME', label: base };
    if (base === '최단거리') return { priority: 'DISTANCE', label: base };
    if (base === '톨게이트 피하기') return { priority: 'RECOMMEND', avoid: 'toll', label: base };
    return { priority: 'RECOMMEND', label: '추천' };
}

/** 🛣️ 실시간 길 찾기의 **폴백** — 서버가 안 될 때만 쓴다 (2026-09-08 부터 기본은 카카오 실시간) */
const ROADS_BY_DEST: Record<string, LabRoad[]> = {
    '여주 시내': YEOJU_ROADS,
    '파주 시내': PAJU_ROADS,
};

/** 시도 + 경기 시·군·구 경계 60구역 — 시트 목업 지도(PinnedRouteCanvas)와 같은 재료 */
const SIDO = (sidoDataRaw as { features: Array<{ properties: { name: string }; geometry: { type: string; coordinates: number[][][][] | number[][][] } }> }).features;

/**
 * 🗺️ **지도 실험실** — `/mockup/map` (기사님 요청 2026-09-07: *"지도만 테스트, 다른 것에 영향 없이"*
 * → *"배경 지도, 오른쪽에 버튼 영역"*)
 *
 * 배경은 **OSM 타일** — 시트 목업의 지도(PinnedRouteCanvas)와 같은 원천이다.
 * 🔴 카카오 지도(SDK)는 **버렸다** (기사님 결정 2026-09-07: *"미리 지도를 가져오는 것이
 * 아니라서 사용자가 포커스를 자꾸 잃는다"*). 카카오는 남의 DOM 위에 우리 캔버스를 얹는
 * 2층이라 z-index 묻힘·줌 애니메이션 배율 어긋남·접착 루프가 다 그 틈에서 났다.
 * OSM 은 한 캔버스에 타일과 도형을 같은 투영으로 그리는 1층이라 어긋날 자리가 없고,
 * 타일 캐시도 우리 손에 있다. **길찾기(REST·콜 확정 시 실경로)는 카카오 그대로 쓴다** — 서버가 부른다.
 *
 * 무엇을 검증하나 — **필터 두 단계** (같은 날 확정):
 *   1단계 · 영역 — 하차지가 그물 안 + 상차지가 현위치 둘레 안 (어디까지 보나)
 *   2단계 · 거리 — 목적지까지 «상차 : 하차 : 현위치»로 역주행 둘을 자른다 (어느 쪽으로 가나)
 *
 * 쓰는 법: 오른쪽 패널에서 국면을 고르고, **지도를 두 번 클릭**하면 콜이 된다
 * (첫 클릭 = 상차 ▲ · 둘째 = 하차 ▼) — 판정 카드가 그 자리에서 나온다.
 *
 * 🔒 다른 화면에 영향 없음: 자기 캔버스·자기 타일 캐시로 그리고, 계산은 callNet(순수 함수)을
 * 읽기만 한다. 판정 수식은 callNet.test.ts 가 잠근다.
 * 🔴 사각형의 기점은 **내 위치**다 (기사님 재확정 2026-09-07 오후 — 하차지 기점은 출발 전
 * 내 앞길 콜을 버린다). 내 위치는 「📍 내 위치 찍기」로 옮긴다.
 */

interface Stage { label: string; vertex: NetPoint; path: Array<{ x: number; y: number; label: string; color?: string }> }
const STAGES: Stage[] = [
    { label: '⏳ 대기 — 초월(집)', vertex: NET_SRC, path: [] },
    { label: '① 곤지암성당 하차 후', vertex: GONJIAM_DROP, path: GONJIAM_CALL_PATH },
    { label: '② 동원대 하차 후', vertex: DONGWON_DROP, path: DONGWON_CALL_PATH },
    { label: '③ 보람여주 하차 후', vertex: BORAM_DROP, path: BORAM_CALL_PATH },
];

type Pt = { lng: number; lat: number };
/** 전체 경로의 한 구간 — 카카오가 나눠 준 그대로 (기사님 2026-09-08) */
type ChainLeg = {
    from: string | null; to: string | null;
    /** 🔴 못 잰 구간은 null 이다 — 0 이라고 지어내지 않는다 (서버가 구간별로 격리해 준다) */
    distKm: number | null; durMin: number | null; failed?: boolean;
    line: Array<{ x: number; y: number }>;
};

/** 🎯 목적지 후보 — 도시 «시내» = 그 시 법정동 평균. 집은 목록에 없다 — 행선(복귀)으로 승격 (기사님 2026-09-08) */
const DESTS: NetPoint[] = [
    NET_DST,
    cityCenter('이천시'),
    cityCenter('파주시'),
    cityCenter('시흥시'),
    cityCenter('평택시'),
    cityCenter('김포시'),
    cityCenter('화성시'),
    cityCenter('안산시'),
];

/** 콜 번호별 경로 색 — ①은 프리셋 경로의 기본색과 같은 장미로 잇는다 */
const CALL_COLORS = ['#e11d48', '#a78bfa', '#2dd4bf', '#fb923c', '#facc15', '#34d399', '#60a5fa', '#f472b6'];
const circled = (n: number) => n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;

/* ── 웹 메르카토르 — OSM 타일과 같은 투영이라야 배경과 도형이 어긋나지 않는다 ── */
const TILE = 256;
const worldPx = (lng: number, lat: number, z: number): [number, number] => {
    const n = TILE * 2 ** z;
    const x = (lng + 180) / 360 * n;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return [x, y];
};
const fromWorldPx = (x: number, y: number, z: number): Pt => {
    const n = TILE * 2 ** z;
    const lng = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return { lng, lat };
};

/** 타일은 페이지 수명 동안 캐시 — 국면을 오가도 다시 안 받는다 */
const tileCache = new Map<string, HTMLImageElement>();

/** 주행 속도 — 한 틱(120ms)에 가는 km. 버튼이 순환시킨다 (기사님 2026-09-07 «너무 빨라») */
const SPEEDS = [
    { label: '🐢 느림', kmPerTick: 0.08 },
    { label: '🚗 보통', kmPerTick: 0.2 },
    { label: '🚀 빠름', kmPerTick: 0.5 },
] as const;

/** 판정 칩 — 통과/탈락 한 줄 */
function Chip({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
            {ok ? `✅ ${yes}` : `❌ ${no}`}
        </span>
    );
}

/**
 * 🧩 **실물로 들고 갈 공용 부품** (기사님 2026-09-07: *"왼쪽 필터와 오른쪽 필터옵션은
 * 컴포넌트 단위 구조·레이아웃을 같이 — 그래야 가져가기 편하다"*).
 * 두 사이드바가 똑같이 `FilterPanel > NumRow/TextRow` 로 조립된다. 디자인 최소 — 로직이 주인공.
 * `mode` 는 실물 `PHASE_FIELDS` 의 FieldMode 그대로: input/override = 고침, auto = 보이되 잠김, hidden = 없음.
 */
function FilterPanel({ title, children, className = '', tone }: {
    title: ReactNode; children: ReactNode; className?: string;
    /** 층을 색으로 가른다 — 'filter'(집기 전·파랑) · 'judge'(집은 뒤·주황). 없으면 평범한 구획 */
    tone?: 'filter' | 'judge';
}) {
    if (tone) {
        const c = tone === 'filter'
            ? { box: 'border-info/45 bg-info/[0.06]', head: 'bg-info/15 text-info' }
            : { box: 'border-warning/45 bg-warning/[0.06]', head: 'bg-warning/15 text-warning' };
        return (
            <div className={`shrink-0 rounded-[10px] border ${c.box} overflow-hidden ${className}`}>
                <div className={`px-2 py-1 text-[11px] font-black ${c.head}`}>{title}</div>
                <div className="p-2 flex flex-col gap-1">{children}</div>
            </div>
        );
    }
    return (
        <div className={`border-t border-border-card pt-2 flex flex-col gap-1 ${className}`}>
            <span className="text-[10.5px] font-black text-text-muted">{title}</span>
            {children}
        </div>
    );
}
function NumRow({ label, value, onChange, min = 0, max = 999, mode = 'input', autoWhy }: {
    label: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; mode?: FieldMode; autoWhy?: string;
}) {
    if (mode === 'hidden') return null;
    const locked = mode === 'auto';
    return (
        <label className="flex flex-col gap-0.5 text-[10.5px] font-bold text-text-muted">
            <span>{label}{locked && <span className="font-normal"> · 자동{autoWhy ? ` — ${autoWhy}` : ''}</span>}</span>
            <input type="number" inputMode="numeric" value={value} min={min} max={max} disabled={locked}
                onChange={e => onChange(Number(e.target.value))}
                className={`px-2 py-1 rounded-[6px] border border-border-hover bg-background text-[13px] font-black text-text-primary ${locked ? 'opacity-60' : ''}`} />
        </label>
    );
}
function TextRow({ label, value, mode = 'input', autoWhy, hint }: {
    label: string; value: string; mode?: FieldMode; autoWhy?: string; hint?: string;
}) {
    if (mode === 'hidden') return null;
    const locked = mode === 'auto';
    return (
        <div className="flex flex-col gap-0.5 text-[10.5px] font-bold text-text-muted">
            <span>{label}{locked && <span className="font-normal"> · 자동{autoWhy ? ` — ${autoWhy}` : ''}</span>}</span>
            <span className={`px-2 py-1 rounded-[6px] border border-border-card bg-background text-[13px] font-black text-text-primary ${locked ? 'opacity-60' : ''}`}>
                {value}{hint && <span className="text-[10px] font-bold text-text-muted"> {hint}</span>}
            </span>
        </div>
    );
}
/** 아웃풋 키-값 한 줄 — 하단 분류 표의 기본 단위. 숨김(undefined)도 «숨김»으로 보여준다 (화면이 거짓말 안 하게) */
function OutKv({ k, v }: { k: string; v: ReactNode }) {
    const hiddenVal = v === undefined || v === null;
    return (
        <div className="flex justify-between gap-2 py-0.5 border-b border-border-card/50 last:border-0">
            <span className="text-text-muted font-bold shrink-0">{k}</span>
            <span className={`text-right break-all ${hiddenVal ? 'text-text-muted/60 font-bold' : 'font-black'}`}>
                {hiddenVal ? '— 숨김' : v}
            </span>
        </div>
    );
}

/** 켜고 끄는 칩 목록 — 차종·제외 단어가 같은 모양을 쓴다 */
function ChipToggleRow({ options, selected, onToggle }: {
    options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            {options.map(o => (
                <button key={o} type="button" onClick={() => onToggle(o)}
                    className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-black border ${selected.includes(o)
                        ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                    {o}
                </button>
            ))}
        </div>
    );
}

export default function MapMockup() {
    const stageIdx = 0;   // 국면 프리셋 버튼은 2026-09-07 삭제(기사님) — 대기 판 고정. STAGES 데이터는 남긴다
    const [pickup, setPickup] = useState<Pt | null>(null);
    const [drop, setDrop] = useState<Pt | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 900, h: 640 });
    /** 화면px ↔ 좌표 역변환 재료 (클릭용) */
    const viewRef = useRef({ z: 10, originX: 0, originY: 0 });
    const drawRef = useRef<() => void>(() => { });

    /**
     * 🎚️ 그물 셋업 — 각도 둘·반경 둘 (기사님 요청 2026-09-07 «아까처럼 만들어 넣어줘»).
     * 사각형의 기점 = 내 위치라 현위치각·출발각은 같은 자리 — 각도는 둘만 받는다.
     * 현위치 반경은 그물의 출발 원이면서 **상차 반경(1단계)과 ② 여유값**까지 겸한다 — 판정과 한 값.
     */
    const [knobs, setKnobs] = useState({
        srcAngleDeg: 100, dstAngleDeg: 100,        // 각은 둘 다 100° (기사님 2026-09-07 — ⑭ 검산의 50° 대신)
    });
    /**
     * 🎚️ **국면 다섯 벌 — 유일한 원천** (기사님 2026-09-08 «옵션에 첫짐~복귀가 필요»).
     * 실물 그대로: `user_filter_phases` 행 = 사용자×국면, 기본값도 실물 `DEFAULT_PHASE_SETTINGS`.
     * 반경·우회·할인율이 전부 여기 살고, **활성 국면(자동 파생)의 벌**이 지도·요약줄·아웃풋을 움직인다.
     * 오른쪽 5탭은 «어느 벌을 편집하나»일 뿐이다. 예전의 knobs 반경·discountPct·detourAllowKm
     * 낱개 상태는 이 맵으로 흡수됐다 — 같은 값을 두 그릇에 두지 않는다 (규칙 ③).
     */
    const [phaseSettings, setPhaseSettings] = useState<PhaseSettingsMap>(() => {
        // 실험실 기본 반경 15/15 (기사님 2026-09-08) — 실물 기본값(10)보다 넓게 잡아 그물을 먼저 본다
        const base = normalizePhaseSettings(DEFAULT_PHASE_SETTINGS);
        return Object.fromEntries(Object.entries(base).map(([k, v]) =>
            [k, { ...v, pickupRadiusKm: 15, dropoffRadiusKm: 15 }])) as PhaseSettingsMap;
    });
    const patchPhase = (tab: PhaseKey, patch: Partial<PhaseSettings>) =>
        setPhaseSettings(m => ({ ...m, [tab]: { ...m[tab], ...patch } }));

    /**
     * ✅ 확정한 콜들 (기사님 요청 2026-09-07 «확정하면 콜 리스트로, 지도에 색·경유 번호로»).
     * 확정해도 그물은 안 움직인다 — 그물의 기점은 내 위치이고, 확정은 경로와
     * «첫 콜을 잡았다»(상차 영역이 ∩ 로 조여짐)만 바꾼다. 국면을 바꾸면 판이 새로 시작된다.
     */
    const [confirmed, setConfirmed] = useState<Array<{
        id: number; pickup: Pt; drop: Pt;
        /**
         * 배송(상차→하차) 실측 — 확정 순간 카카오 1회.
         * 🔴 **못 쟀으면 값이 없다** (규칙 ④ · 2026-09-09). 예전엔 직선 km 를 지어내고
         *    `straight: true` 를 붙였는데, 그 숫자가 시급(요금 ÷ 분)에 들어가면 **색이 틀린다.**
         *    실물도 카카오가 실패하면 `kakaoSoloDurationMin` 을 null 로 남긴다.
         */
        distKm?: number | null; durMin?: number | null; tollWon?: number | null; optionUsed?: string;
        /**
         * 🕗 **경로를 언제 쟀나** — 실물 `orders.routeComputedAt` 자리.
         * 「아직 응답 안 옴」과 「재 봤는데 못 쟀다」를 가르는 유일한 값이다:
         *   `null` = 아직 · 값 있고 `durMin == null` = 못 쟀다
         */
        routeComputedAt?: number | null;
        /**
         * 상차지까지(잡을 때의 내 위치 → 상차) 실측 — 🔴 **올릴 때 이미 잰 것을 그대로 저장한다**
         * (기사님 순서 ⑦ 2026-09-08: *"그 정보로 첫 콜 정보창에 1번 상차시간 2번 배송시간을 저장하고"*).
         * 저장을 안 해서 «그림은 그려져 있는데 기존 경로는 ?» 이 나왔다.
         */
        approachKm?: number | null; approachMin?: number | null;
        /**
         * 🔴 **최초 약속 — 확정한 순간에 못 박고 다시는 안 바꾼다** (기사님 2026-09-08:
         * *"앞자리는 최초 약속 시간인 거고 뒤 시간은 이 콜을 받았을 때 수정될 시간"*,
         * *"n분 늦어짐의 값이 같이 늘어나야 해"*).
         *
         * «분»이 아니라 **시각**으로 저장한다 — 분으로 두면 시간이 흐를수록 약속이 함께
         * 밀려서 지연이 영영 0 으로 보인다. 합짐을 둘 셋 얹어도 지연은 이 시각을 기준으로
         * **쌓인다.**
         */
        steps: { pickup: StopStep; dropoff: StopStep };
        /** 잡을 당시의 목적지 — 판 그룹 경로의 열쇠 (기사님 2026-09-08: 다음 판 콜을 미리 잡아 공백을 줄인다) */
        destName: string;
    }>>([]);
    /**
     * 📍 내 위치 (기사님 확정 2026-09-07 오후) — **사각형의 기점은 마지막 하차지가 아니라 현위치다.**
     * 하차지 기점이면 출발 전에 내 앞길(현위치~하차지 사이) 콜을 통째로 버린다 — 실측으로 잡힌 문제.
     * 국면 버튼은 «그 하차를 마치고 거기 서 있다»는 가정으로 내 위치를 옮겨 줄 뿐이고,
     * 「내 위치 찍기」로 아무 데나 옮겨 실험할 수 있다.
     */
    const [myPos, setMyPos] = useState<Pt>({ lng: NET_SRC.lng, lat: NET_SRC.lat });
    const [clickMode, setClickMode] = useState<'call' | 'me'>('call');
    /** 🎯 목적지 — 셀렉바로 고른다 (기사님 2026-09-07) */
    // 기본 목적지 = 파주 (기사님 2026-09-07 저녁 «목적지에 파주를 넣어주고» — 큰 판이라 시군구 분류·제외가 여기서 필요해진다)
    const [dstIdx, setDstIdx] = useState(Math.max(0, DESTS.findIndex(d => d.name.startsWith('파주'))));
    /**
     * ↩️ **행선 — 목적지행 ↔ 복귀** (기사님 확정 2026-09-08). 복귀를 누르면:
     *   · 방식(노선/동선)은 그 자리에서 그대로 — 노선이면 집 방향 길 찾기를 «지금» 한다
     *   · 그물 = 관내 원 ∪ 복귀 트랙, **콜 처리 중에도** 양방향 (복귀 콜을 미리 노린다)
     *   · 복귀 콜을 잡으면(homeCaught) 관내는 원 ∩ 복귀 트랙(길목 조각)만 남는다
     */
    const HOME_DST: NetPoint = useMemo(() => ({ ...NET_SRC, name: '복귀(집)' }), []);
    const [homeOn, setHomeOn] = useState(false);
    const dst = DESTS[dstIdx];
    /** 🎯 살아 있는 목적지들 — 그물·판정·화면이 전부 이 목록 하나를 읽는다 (⑮ 기준 1·2) */
    const goals: NetPoint[] = useMemo(() => homeOn ? [dst, HOME_DST] : [dst], [homeOn, dst, HOME_DST]);
    /**
     * ⛔ 제외지역 (기사님 2026-09-07) — 그물에 들어도 필터에 안 싣는 곳.
     * 키 두 모양: `R|시군구`(통째) · `D|시군구|읍면동`(하나). 이름만 쓰면 동명이인(창전동)이 섞인다.
     */
    /**
     * 🎛️ 필터 옵션 (기사님 2026-09-07: 오른쪽 사이드바 — **실물 필터에 있는 요소만**, 값은 목업).
     * 국면 규칙은 실물 원천(`PHASE_FIELDS`)을 그대로 import — 여기 다시 적지 않는다 (규칙 ③).
     * 상차 반경·하차지 주변은 왼쪽 손잡이(knobs)와 **같은 상태**를 읽는다 — 원천 하나.
     */
    // callTarget 은 행선·도착 인지에서 파생된다 — 아래 localMode 뒤에서 계산
    const [vehicles, setVehicles] = useState<string[]>(['1t', '다마스']);             // 목업값 (DTO 예시 그대로)
    const [excludedWords, setExcludedWords] = useState<string[]>(['착불', '수거']);   // 목업값 (DTO 예시 그대로)
    const [slotsUsed, setSlotsUsed] = useState(0);
    const [capacityConfirmed, setCapacityConfirmed] = useState(false);               // 실물 «확정» 버튼 자리
    /** 🚗 모의 주행 — 경로가 있으면 내 위치가 경로를 따라간다, 없으면 대기 */
    const [driving, setDriving] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(1);
    /**
     * ⏸ 주행 중 새 콜이 생기면 멈추고, 처리(확정/지우기)되면 다시 달린다 (기사님 2026-09-07).
     * 실물의 흐름 그대로다 — 콜이 뜨면 결재하고, 끝나면 계속 간다.
     */
    const [pausedForCall, setPausedForCall] = useState(false);
    /**
     * ⏱️ **안전취소 30초** — 실전에서 콜을 집으면 위약금 없이 무를 수 있는 30초가 흐르고
     * 그 사이 서버가 심사한다. 시뮬도 그 시계를 돌려야 «주행 중 콜»이 실감난다
     * (기사님 2026-09-08: *"좀 더 시뮬레이션처럼"*). 30초가 지나면 그냥 지나갈 뿐 —
     * 자동으로 버리지 않는다 (규칙 ①: 콜의 주인은 기사님).
     */
    /**
     * 🪜 **투 스텝** (기사님 2026-09-08): 콜을 찍으면 ① 앱 필터가 먼저 답하고,
     * **「필터 통과 → 올린다」를 눌러야** ② 서버로 올라가 심사·경로가 시작된다 —
     * 실물 그대로다(앱이 올린 콜만 서버가 본다). 이식 때 ①은 앱, ②는 서버로 간다.
     */
    const [uploaded, setUploaded] = useState(false);
    /**
     * 🗄️ **구간 캐시 — 한 번 그린 궤적을 두 번 그리지 않는다** (기사님 2026-09-08).
     * 키는 «시작→끝+옵션». 올릴 때 받은 곡선을 여기 넣어 두면 확정 후 그 구간은 다시 안 묻는다.
     */
    const legCacheRef = useRef(new Map<string, { line: Pt[]; failed: boolean }>());
    /**
     * 🛰️ **시스템 — 카카오 호출 기록** (기사님 2026-09-08: *"어떤 시점에 어떤 값으로 호출하고
     * 무엇을 리턴받았는지"*). 서버(/api/sim/*)를 거쳐 카카오를 부르는 **모든 자리**가 이 문
     * 하나를 통과한다 — 자리마다 따로 적으면 한 곳을 빼먹는다 (규칙 ③: 원천 하나).
     */
    const [apiLog, setApiLog] = useState<Array<{
        t: string; who: string; path: string; ms: number; req: string; res: string; ok: boolean;
        /** 어느 콜을 올리며 부른 것인가 — 심사 영역이 «이 콜의 호출»만 골라 보여준다 */
        tag?: string;
        /** 보낸 값·받은 값 **전체** (팝업용). 폴리라인은 «점 N개» 로 접는다 — 그대로 두면 수만 자다 */
        reqJson: string; resJson: string;
    }>>([]);
    /** 🔎 팝업으로 펼쳐 볼 호출 하나 (null 이면 닫힘) */
    const [apiPeek, setApiPeek] = useState<number | null>(null);
    /** 📋 저장된 콜 전부를 날것 그대로 — 제목을 누르면 열린다 (기사님 2026-09-09) */
    const [callsPeek, setCallsPeek] = useState(false);
    /** 지금 심사 중인 콜의 호출 꼬리표 — 심사 영역이 «이 콜의 카카오 호출»만 골라 보여준다 */
    const [uploadTag, setUploadTag] = useState<string | null>(null);
    /** 좌표 배열은 «점 N개» 로 접는다 — 값을 보러 여는 창인데 폴리라인이 화면을 덮으면 못 본다 */
    const foldLines = (v: unknown) => JSON.stringify(v, (k, val) =>
        (k === 'line' || k === 'vertexes') && Array.isArray(val) ? `«점 ${val.length}개»` : val, 2).slice(0, 20000);
    const callApi = async (who: string, path: string, body: Record<string, unknown>, reqSummary: string, tag?: string) => {
        const t0 = Date.now();
        const t = new Date().toTimeString().slice(0, 8);
        try {
            const r = await fetch(`${apiBase()}${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            const res = Array.isArray(d.roads)
                ? `길 ${d.roads.length}개: ${d.roads.map((x: { option: string; distKm: number; durMin: number }) => `${x.option} ${x.distKm}km/${x.durMin}분`).join(' · ')}`
                : Array.isArray(d.legs)
                // 🔴 `/sim/route` 는 legInfo 로, `/sim/chain` 은 legs 안에 값을 담는다 —
                //    legInfo 만 읽어서 전체 경로 응답이 «구간 4: » 로 텅 비어 보였다 (2026-09-08)
                ? `구간 ${d.legs.length}: ${(d.legInfo ?? d.legs).map((li: { distKm: number; durMin: number; tollWon?: number | null; failed?: boolean }) =>
                    li.failed ? '실패(직선)' : `${li.distKm}km/${li.durMin}분${li.tollWon != null ? `/톨${li.tollWon}` : ''}`).join(' · ')}`
                : JSON.stringify(d).slice(0, 80);
            setApiLog(l => [{ t, who, path, ms: Date.now() - t0, req: reqSummary, res, ok: true, tag, reqJson: foldLines(body), resJson: foldLines(d) }, ...l].slice(0, 40));
            return d;
        } catch (err) {
            setApiLog(l => [{ t, who, path, ms: Date.now() - t0, req: reqSummary, res: `❌ ${String((err as Error)?.message ?? err)}`, ok: false, tag, reqJson: foldLines(body), resJson: '(응답 없음)' }, ...l].slice(0, 40));
            throw err;
        }
    };

    /** 올린 콜의 실도로 곡선 — 필터 통과 순간 받아온다 (서버가 심사하며 보는 그 경로) */
    const [uploadedLeg, setUploadedLeg] = useState<Pt[] | null>(null);
    /**
     * 🔴 **합짐의 «지금 경로» 미리보기** (기사님 2026-09-08: *"값은 받아 왔는데 경로를 그리지 않는다"*).
     * ⑮ 고유 호출을 «확정 뒤»로 옮기면서 `uploadedLeg`·`approachLeg` 가 **첫짐일 때만** 채워지게 됐고,
     * 합짐은 ⑬⑭ 전체 경로를 받아 두고도 **그릴 그릇이 없어** 직선 점선만 남았다.
     * 전체 경로는 재배치한 순서 그대로이므로 이걸 그리면 «이 콜을 끼면 이렇게 간다»가 그대로 보인다.
     *
     * 🔴 **⑭ 에서 전부 실선으로 그린다** (기사님 2026-09-08: *"14에서 다 그려야 하는데…
     * 점선이면 사용자가 확정을 해야 할지 취소를 해야 할지 몰라"*). ⑭-1 심사와 ⑭-2 확정은
     * **이 그림을 보고** 하는 것이므로, 전체 경로가 오면 직선 점선은 걷어낸다.
     * `isNew` = 이 콜 때문에 생긴 구간 — 판정색으로 굵게, 나머지는 파랑.
     */
    const [chainPreview, setChainPreview] = useState<Array<{ line: Pt[]; isNew: boolean }> | null>(null);
    /** 🚚 «상차지까지» 구간 — 현위치→상차지. **상차 약속의 재료**다 (몇 분 뒤 도착하나) */
    const [approachLeg, setApproachLeg] = useState<Pt[] | null>(null);
    const [approachInfo, setApproachInfo] = useState<{ distKm: number | null; durMin: number | null; failed?: boolean } | null>(null);
    /** 올릴 때 받은 그 콜의 실측 — 확정하면 그대로 카드에 쓴다 (같은 구간을 두 번 묻지 않는다) */
    const uploadedInfoRef = useRef<{ distKm: number | null; durMin: number | null; tollWon: number | null; failed: boolean } | null>(null);
    const [callSeenAt, setCallSeenAt] = useState<number | null>(null);
    const [nowTick, setNowTick] = useState(Date.now());
    useEffect(() => {
        if (!callSeenAt) return;
        const t = setInterval(() => setNowTick(Date.now()), 250);
        return () => clearInterval(t);
    }, [callSeenAt]);
    const safeCancelLeft = callSeenAt ? Math.max(0, 30 - Math.floor((nowTick - callSeenAt) / 1000)) : null;
    const pauseForCall = () => { if (driving) { setDriving(false); setPausedForCall(true); } };
    const targetIdxRef = useRef(1);
    /** 지금 향하는 정거장 순번 — 왼쪽 노선 패널의 «▶ 다음» 표시용 (ref 를 화면에 비추는 거울) */
    const [targetSeq, setTargetSeq] = useState(1);
    const myPosRef = useRef(myPos);
    useEffect(() => { myPosRef.current = myPos; }, [myPos]);
    /**
     * 🐾 지나온 길 (기사님 2026-09-07 밤 «내가 지나온 길을 표시해 줘») — 주행이 실제로 밟은 점들.
     * 🔴 경로가 다시 짜여도(합짐 수락) 이 흔적은 **지우지 않는다** — 새 경로는 이 위에 더해진다.
     * 구간 배열인 이유: 「내 위치 찍기」 순간이동(>2km 튐)은 주행이 아니다 — 끊고 새 구간을 연다.
     * ref 인 이유: 120ms 틱마다 setState 를 또 하면 재렌더가 두 배가 된다 — 그리기는 myPos 변화가 이미 부른다.
     */
    const trailRef = useRef<Pt[][]>([]);
    useEffect(() => {
        const segs = trailRef.current;
        const seg = segs[segs.length - 1];
        const last = seg?.[seg.length - 1];
        const jumpKm = last ? Math.hypot((myPos.lng - last.lng) * 88.6, (myPos.lat - last.lat) * 110.574) : Infinity;
        if (jumpKm < 0.05) return;                    // 제자리 — 점을 안 쌓는다
        if (jumpKm > 2 || !seg) segs.push([myPos]);   // 순간이동 — 새 구간
        else seg.push(myPos);
    }, [myPos]);
    useEffect(() => {
        setConfirmed([]); setPickup(null); setDrop(null); setDriving(false); setPausedForCall(false);
        const v = STAGES[stageIdx].vertex;
        setMyPos({ lng: v.lng, lat: v.lat });
    }, [stageIdx]);

    const stage = STAGES[stageIdx];
    const baseCallCount = stage.path.length ? (stage.path.length - 1) / 2 : 0;
    /** 첫 콜을 잡았는가 — 프리셋 국면도 콜을 쥔 상태다. 잡았으면 상차 영역 = 내 반경 ∩ 사각형 */
    const routeStarted = confirmed.length > 0 || stage.path.length > 0;
    /**
     * 🏘️ 관내(도착) 인지 — 목적지 원 안 + 출발지(집) 원 밖. 반경은 **운행 중(drive) 벌**로
     * 고정한다: 활성 벌을 읽으면 «관내 인지→국면→벌→관내 인지» 순환이 생긴다 (09-08 설계)
     */
    const localMode = isLocalPhase({
        srcAngleDeg: knobs.srcAngleDeg, dstAngleDeg: knobs.dstAngleDeg,
        srcDiamKm: phaseSettings.drive.pickupRadiusKm * 2, dstDiamKm: Math.max(6, phaseSettings.drive.dropoffRadiusKm * 2),
    }, NET_SRC, dst, myPos);
    /** 콜 타겟 — 행선·도착 인지에서 **파생** (수동 버튼 없음): 복귀행 / 관내 / 노선행 */
    const callTarget: 'DEST' | 'LOCAL' | 'HOME' = homeOn ? 'HOME' : localMode ? 'LOCAL' : 'DEST';
    /** 운행 상태 — 실험실 상태에서 파생: 콜 0 = 대기 · 콜 쥠 = 합짐 수집 · 주행 = 운행 중 */
    const dispatchPhaseSim = confirmed.length > 0 ? (driving ? 'DELIVERING' as const : 'GATHERING' as const) : 'STANDBY' as const;
    /** 국면 — 실물 그대로 resolvePhaseKey(callTarget × 운행 상태)로 **자동** 파생. 수동 선택 없음 */
    const phase = labPhaseOf({ callTarget, dispatchPhase: dispatchPhaseSim });
    /** 오른쪽 5탭 — 어느 국면의 벌을 «편집»하나. 활성 국면이 바뀌면 탭이 따라간다 */
    const [phaseTab, setPhaseTab] = useState<PhaseKey>('first');
    useEffect(() => { setPhaseTab(phase); }, [phase]);
    /** 활성 국면의 벌 — 지도·요약줄·아웃풋이 읽는 유일한 값 */
    const ps = phaseSettings[phase];
    const params = useMemo(() => ({
        srcAngleDeg: knobs.srcAngleDeg, dstAngleDeg: knobs.dstAngleDeg,
        srcDiamKm: ps.pickupRadiusKm * 2, dstDiamKm: ps.dropoffRadiusKm * 2,
    }), [knobs, ps]);
    /**
     * 🛣️ 길 고르기 (기사님 확정 2026-09-07 «노선은 길을 잡아서 작동») — 여주 판에서만.
     * -1 = 사각형(길 미정 — 모든 길을 담는다) · 0~ = 카카오 대안 경로 중 하나를 골라
     * 영역이 «그 길의 경유 띠(±5km) ∪ 목적지 원»으로 바뀐다. 길 미정→확정이 ⑭의 두 국면이다.
     */
    const [roadIdx, setRoadIdx] = useState(-1);
    /**
     * 🧭 오늘의 노선 모드 (기사님 시나리오 2026-09-07) — 켜면 동선(사각형)은 쉬고,
     * 목적지 + 반경 셋(경로·현위치·목적지) → 길 찾기 → 길 선택 → 걸친 읍면동이 영역이 된다.
     */
    const [routeMode, setRouteMode] = useState(false);
    const [excluded, setExcluded] = useState<string[]>([]);
    /** 🔴 노선에서는 제외지역을 안 쓴다 (기사님 2026-09-08: «거기가 젤 빠른 길 — 가는 길에 주워 간다»).
     *  동선에서는 필요하다 — 골라둔 제외는 지워지지 않고, 동선으로 돌아오면 다시 산다 */
    const isExcluded = (region: string, name: string) =>
        !routeMode && (excluded.includes(`R|${region}`) || excluded.includes(`D|${region}|${name}`));
    const [roadSearched, setRoadSearched] = useState(false);
    /** 경로 반경(경유 띠 폭) km — 길 양옆으로 콜을 받는 폭. 기본 5km(볼트 실측) */
    /**
     * 🔴 **«우회 허용»과 다른 값이다 — 이름을 갈라 둔다** (2026-09-09 스키마 대조에서 잡힘).
     *   여기(`detourWidthKm`)      길 **양옆으로 콜을 받는 폭** (용어집: 경유 반경)
     *   실물(`detour_allow_km`)  카카오 **총거리 증가분** 허용치 (앱 평면 이름은 `detourRadiusKm`)
     * 둘 다 km 라 예전 이름(`detourKm`)으로는 이식할 때 조용히 섞인다. 실물의 경유 반경은
     * `detour_allow_km` 에서 **서버가 파생**한다 — 그 자리가 이것이다.
     */
    const [detourWidthKm, setDetourWidthKm] = useState(5);
    /**
     * 🔍 길 찾기 결과 — **누를 때마다 카카오 실시간, 모든 옵션 그대로** (기사님 2026-09-08
     * «합하지 말고 카카오 모든 옵션을 뿌려라 — 카카오 호출하자는 이야기»).
     * 원점은 내 위치(밤에 누르면 밤의 소요시간). null = 아직/호출 중, [] = 후보 없음.
     * 서버(/api/sim/roads · 개발 전용)가 5옵션×대안을 병합 없이 준다. 못 받으면 미리 만든
     * 파일(ROADS_BY_DEST)로 폴백 — 폴백에 들어가면 반드시 소리를 낸다 (버그 대장 #101 교훈).
     */
    const [liveRoads, setLiveRoads] = useState<LabRoad[] | null>(null);
    /** 🗄️ 길 찾기 캐시 — 한 번 부르면 카카오 4회다. 같은 출발·목적지면 다시 안 묻는다 */
    const roadsCacheRef = useRef(new Map<string, LabRoad[]>());
    const searchRoads = async () => {
        setRoadSearched(true); setRoadIdx(-1); setLiveRoads(null);
        const ck = `${myPos.lng.toFixed(3)},${myPos.lat.toFixed(3)}>${dst.name}`;
        const hit = roadsCacheRef.current.get(ck);
        if (hit) { setLiveRoads(hit); return; }          // 캐시 — 카카오 0회
        try {
            const d = await callApi('🔍 길 찾기(4옵션)', '/sim/roads',
                { origin: { x: myPos.lng, y: myPos.lat }, dest: { x: dst.lng, y: dst.lat } },
                `내 위치 ${myPos.lng.toFixed(4)},${myPos.lat.toFixed(4)} → ${dst.name}`);
            const roads = Array.isArray(d.roads) ? d.roads : [];
            roadsCacheRef.current.set(ck, roads);
            setLiveRoads(roads);
        } catch (err) {
            console.warn('[길 찾기] 실시간 호출 실패 — 미리 만든 길로 폴백:', err);
            setLiveRoads(ROADS_BY_DEST[dst.name] ?? []);
        }
    };
    useEffect(() => { setRoadIdx(-1); setRoadSearched(false); setLiveRoads(null); }, [routeMode, dstIdx]);
    const destRoads = roadSearched ? liveRoads ?? undefined : undefined;
    const road = routeMode && roadIdx >= 0 && destRoads ? destRoads[roadIdx] : null;
    const roadMode = !!road;
    /** 지금 고른 길의 옵션 축 — 콜 실측·확정 경로가 이걸 따라간다 (길 미선택·동선이면 추천) */
    const routeCombo = comboOfOption(road?.option);
    const legKey = (aLng: number, aLat: number, bLng: number, bLat: number) =>
        `${aLng.toFixed(5)},${aLat.toFixed(5)}>${bLng.toFixed(5)},${bLat.toFixed(5)}|${routeCombo.priority}|${routeCombo.avoid ?? ''}`;
    const callSeqRef = useRef(0);
    /**
     * 🧅 레이어 (기사님 2026-09-07 «각각 레이어 처리 — 켜고 끄고») — 그리기 순서의 켜기/끄기.
     * 모든 레이어가 한 투영(줌·원점)을 쓰므로 켜고 꺼도 드래그·줌은 그대로다.
     */
    const [layers, setLayers] = useState({ base: true, border: true, roads: true, net: true, route: true, trail: true, call: true });
    /**
     * 🔍 보기 — 자동 맞춤(내용에 맞춰 줌) ↔ 수동(드래그·휠줌). 움직이면 수동이 되고 ⌖ 가 자동으로 되돌린다.
     */
    const [view, setView] = useState<{ manual: boolean; z: number; center: Pt }>({ manual: false, z: 10, center: { lng: 127.46, lat: 37.33 } });
    const dragRef = useRef({ sx: 0, sy: 0, moved: false, down: false });
    /** 화면을 dx,dy px 만큼 끈다 — 수동 보기로 들어간다 */
    const panBy = (dx: number, dy: number) => {
        const v = viewRef.current;
        setView({ manual: true, z: v.z, center: fromWorldPx(v.originX + size.w / 2 - dx, v.originY + size.h / 2 - dy, v.z) });
    };
    /**
     * 📌 지금 화면을 그대로 얼린다 (기사님 2026-09-08 «탭을 바꾸면 원점이 바뀐다») —
     * 자동 맞춤은 «그물 내용»에 맞추므로 노선↔동선 전환 때 담을 도형이 달라져 화면이 점프했다.
     * 내 위치·목적지가 그대로면 화면도 그대로여야 한다. ⌖ 를 누르면 다시 자동 맞춤.
     */
    const freezeView = () => {
        const v = viewRef.current;
        setView({ manual: true, z: v.z, center: fromWorldPx(v.originX + size.w / 2, v.originY + size.h / 2, v.z) });
    };
    /** 커서 자리를 고정한 채 줌 — 지도 앱들의 그 손맛 */
    const zoomAt = (px: number, py: number, delta: number) => {
        const v = viewRef.current;
        const z2 = Math.max(8, Math.min(13, v.z + delta));
        if (z2 === v.z) return;
        const geo = fromWorldPx(v.originX + px, v.originY + py, v.z);
        const [wx, wy] = worldPx(geo.lng, geo.lat, z2);
        setView({ manual: true, z: z2, center: fromWorldPx(wx - px + size.w / 2, wy - py + size.h / 2, z2) });
    };

    /** 프리셋 국면의 콜들 — 경로 상수(출발 + 상차·하차 짝)에서 되꺼낸다 */
    const presetCalls = useMemo(() => {
        const arr: Array<{ pickup: Pt; drop: Pt }> = [];
        for (let i = 1; i + 1 < stage.path.length + 1; i += 2) {
            const a = stage.path[i], b = stage.path[i + 1];
            if (a && b) arr.push({ pickup: { lng: a.x, lat: a.y }, drop: { lng: b.x, lat: b.y } });
        }
        return arr;
    }, [stage.path]);

    /**
     * 🛣️ **경로 순서** (기사님 2026-09-07 «서버가 경로를 수정할 거야» + 2026-09-08 재확정
     * *"가는 중이면 기존 경로 순서 뒤에 오는 번호를 붙여야 — 가까운 경로 찾기 로직을 피해야"*).
     *
     * 🔴 **번호는 약속이다 — 주행을 시작한 뒤에는 재정렬하지 않는다.**
     *   · 출발 전(수집): 가까운 곳 먼저(greedy) — 하차는 제 상차 뒤 (기존 확정)
     *   · 주행 후: 기존 순서 스냅샷 고정, 새 콜은 **맨 뒤에** 상차→하차로 붙는다
     * ⚠️ 이 규칙은 순서만 만진다 — **그물 기점은 내 위치, 고정 끝은 목적지 그대로다**
     *   (09-08 오전: 기점을 «마지막 하차지»로 옮겼다가 그물이 목적지를 안 보게 되어 되돌림.
     *    그물은 목적지를 보는 눈이다 — 기사님: *"목적지를 보고 있어야 해"*).
     */
    const [departed, setDeparted] = useState(false);
    /**
     * 🕒 **모의 시계 — 약속·예정·통과를 한 시계 위에 올린다** (기사님 2026-09-09:
     * *"시간이 빨라진 건 지금 모의 주행이라 차 속도가 엄청 빨라서 … 아닐까?"*).
     *
     * 실측: «보통»이 0.2km/틱 · 120ms → **약 6000km/h**. 약속·예정은 카카오가 준 **실제 분**인데
     * 통과만 벽시계로 찍히니 늘 «40분 빨라짐»이 나왔다 — 사실이 아니라 **시계가 둘이라서** 생긴 값이다.
     * 그래서 주행이 나아간 거리를 그 경로의 속도(㎞/분)로 나눠 **모의 분**을 쌓고, 세 값이 모두
     * 이 시계를 쓴다. 서 있는 동안은 시계도 선다 — 생각하는 사이에 약속이 밀리지 않는다.
     */
    const clockBaseRef = useRef(Date.now());
    const simMinRef = useRef(0);
    const [simMin, setSimMin] = useState(0);
    const clockNow = clockBaseRef.current + simMin * 60000;
    /** ㎞/분 — 지금 경로의 실제 속도. 못 구하면 40km/h 로 본다 */
    const paceRef = useRef(40 / 60);
    useEffect(() => { if (driving) setDeparted(true); }, [driving]);
    useEffect(() => { if (confirmed.length === 0) setDeparted(false); }, [confirmed.length]);
    /** 마지막으로 계산한 방문 순서 — 방문 고정(visited)의 원천 */
    const prevOrderRef = useRef<Array<{ call: number; kind: '상차' | '하차' }>>([]);
    /**
     * 🔴 «몇 정거장 지나왔나»는 targetSeq 로 읽으면 안 된다 (2026-09-08 실측 사고 · 규칙 ⑤-4 ⑤).
     * targetSeq 는 «주행 재개가 다음 향할 점»이고, 재개 로직이 지리적으로 가까운 정거장으로
     * 점프할 수 있다 — 그걸 방문 수로 읽자 안 지나간 정거장까지 잠겼다.
     * 방문 수는 **드라이브가 정거장에 실제로 도달한 순간에만** 여기서 센다.
     */
    const visitedCountRef = useRef(0);
    /**
     * ⏱️ **실제 통과 시각** (기사님 2026-09-08: *"지금 내가 하고 있는 것은 예상 시간인 거고
     * 진짜 통과 시간도 있으면 좋겠다 — 지나간 후 값이 생기면"*).
     * 키는 `①상차` 같은 정거장 이름, 값은 지난 순간의 시각. **지나기 전엔 아예 없다**
     * (0 이나 예상값으로 채우지 않는다 — 규칙 ④).
     */
    /** 🔎 지나는 순간 얼릴 «마지막 예상» — 키는 `콜id-상차/하차` (실물의 `predicted_at` 자리) */
    const etaRef = useRef<Record<string, number | null>>({});
    useEffect(() => { if (confirmed.length === 0) visitedCountRef.current = 0; }, [confirmed.length]);
    const effPath = useMemo(() => {
        const allCalls = [
            ...presetCalls.map(c => ({ ...c, destName: dst.name })),
            ...confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })),
        ];
        if (allCalls.length === 0) {
            prevOrderRef.current = [];
            return [] as Array<{ x: number; y: number; label: string; color?: string; seq?: number; call?: number }>;
        }
        // 지나간 정거장은 사실 — 그 순서 그대로 고정 (주행 전엔 자유 재배치)
        const visited = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        const ordered = orderStopsInsert(NET_SRC, allCalls, visited);
        prevOrderRef.current = ordered.map(o => ({ call: o.call, kind: o.kind }));
        return [
            { x: NET_SRC.lng, y: NET_SRC.lat, label: '출발 · 초월(집)' },
            ...ordered.map((s, i) => ({
                x: s.pt.lng, y: s.pt.lat, seq: i + 1, call: s.call,
                label: `${circled(s.call)} ${s.kind} · ${nearestDong(s.pt).name}`,
                color: CALL_COLORS[(s.call - 1) % CALL_COLORS.length],
            })),
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presetCalls, confirmed, departed, dst.name]);

    const anchor: NetPoint = useMemo(() => ({ name: '내 위치', ...myPos }), [myPos]);

    /**
     * 🛣️ 실도로 곡선 (기사님 2026-09-07 «콜을 잡으면 카카오에서 진짜 길찾기») —
     * 경로가 다시 짜일 때 서버(/api/sim/route, 개발 전용)가 카카오를 불러 구간별 폴리라인을 준다.
     * 못 받으면(서버 꺼짐 등) 직선 폴백 — 실험은 계속된다. legs[i] = effPath[i]→effPath[i+1] 구간.
     */
    const [realLegs, setRealLegs] = useState<Pt[][] | null>(null);
    /** 구간별 실측 실패 여부 — 실패 구간은 지도에 점선(도로 탐색 불가를 화면이 말한다) */
    const [legFailed, setLegFailed] = useState<boolean[]>([]);
    const routeFetchSeq = useRef(0);
    /**
     * 🔴 재요청 기준은 **내용(정거장 좌표)**이지 배열 정체성이 아니다 (2026-09-08 실측:
     * 주행 시작 때 departed 가 켜지며 같은 내용의 새 배열이 만들어졌고, 그걸 «경로가
     * 바뀌었다»로 오판해 재호출 — 곡선이 지워졌다 다시 그려졌다).
     */
    const effPathKey = useMemo(() => effPath.map(pt => `${pt.x},${pt.y}`).join('|'), [effPath]);
    useEffect(() => {
        if (effPath.length < 2) { setRealLegs(null); setLegFailed([]); return; }
        // ① 캐시에 있는 구간으로 **먼저** 그린다 — 화면이 비는 순간이 없다
        const cached = effPath.slice(1).map((pt, i) => legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y)));
        if (cached.every(c => c && !c.failed)) {   // 🔴 실패 구간은 다시 묻는다 (2026-09-08 리뷰)
            setRealLegs(cached.map(c => c!.line));
            setLegFailed(cached.map(c => c!.failed));
            return;                                   // ② 전부 있으면 카카오를 안 부른다
        }
        // ③ 모르는 구간만 묻는다 — 아는 구간은 캐시에서 (카카오 호출을 아낀다)
        const missing: Array<{ i: number; a: typeof effPath[number]; b: typeof effPath[number] }> = [];
        cached.forEach((c, i) => { if (!c) missing.push({ i, a: effPath[i], b: effPath[i + 1] }); });
        const seq = ++routeFetchSeq.current;
        // 🔴 apiBase() 가 이미 `/api` 를 포함한다 — `/api` 를 또 붙이면 404 → 직선 폴백 (2026-09-07 실측)
        Promise.all(missing.map(m =>
            callApi(`🛣️ 경로 구간 ${m.i + 1}`, '/sim/route',
                { points: [{ x: m.a.x, y: m.a.y }, { x: m.b.x, y: m.b.y }], priority: routeCombo.priority, avoid: routeCombo.avoid },
                `${m.a.label?.slice(0, 12) ?? ''} → ${m.b.label?.slice(0, 12) ?? ''}`)
                .then(d => ({ m, line: (d.legs?.[0] ?? []).map((p: { x: number; y: number }) => ({ lng: p.x, lat: p.y })) as Pt[], failed: !!d.legInfo?.[0]?.failed }))
        ))
            .then(got => {
                if (seq !== routeFetchSeq.current) return;
                for (const g of got) if (g.line.length >= 2)
                    legCacheRef.current.set(legKey(g.m.a.x, g.m.a.y, g.m.b.x, g.m.b.y), { line: g.line, failed: g.failed });
                const all = effPath.slice(1).map((pt, i) => legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y)));
                setRealLegs(all.map(c => c?.line ?? []));
                setLegFailed(all.map(c => c?.failed ?? true));
            })
            // 🔴 폴백에 들어가면 반드시 소리를 낸다 — 조용한 폴백이 /api 이중 붙임 404 를
            //    «원래 직선인가 보다»로 몇 시간 살게 했다 (버그 대장 #101)
            .catch(err => console.warn('[실경로] 못 받아 직선 폴백:', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effPathKey, routeCombo.priority, routeCombo.avoid]);

    /**
     * 🖌️ **그릴 곡선 — 상태(realLegs)가 아니라 «캐시 우선»으로 꺼낸다** (기사님 2026-09-08:
     * *"확정하면 직선으로 깜빡인다"*). 확정 순간 effPath 는 새 경로인데 realLegs 는 아직
     * 옛 값/null 이라 **한 박자(0.16초) 직선**이 그려졌다 — 실측(window.__drawLog):
     * `straight:legs=null/2` 두 프레임 뒤 `curve:legs=2/2`. 캐시에 있으면 그 프레임부터 곡선이다.
     */
    const drawLegs = useMemo(() => {
        if (effPath.length < 2) return null;
        const fresh = realLegs && realLegs.length === effPath.length - 1 ? realLegs : null;
        // 구간마다: 캐시 → 방금 받은 값 → **그 구간만** 직선 (전체가 직선으로 떨어지지 않는다)
        return effPath.slice(1).map((pt, i) =>
            legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y))?.line
            ?? fresh?.[i]
            ?? [{ lng: effPath[i].x, lat: effPath[i].y }, { lng: pt.x, lat: pt.y }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effPathKey, realLegs, routeCombo.priority, routeCombo.avoid]);

    /** 주행이 따라갈 점 목록 — 실도로가 오면 그 곡선, 아니면 정거장 직선. seq = 향하는 정거장 순번 */
    const drivePath = useMemo(() => {
        const out: Array<{ lng: number; lat: number; seq: number }> = [];
        if (drawLegs) {
            drawLegs.forEach((leg, i) => {
                for (const pt of leg) out.push({ lng: pt.lng, lat: pt.lat, seq: i + 1 });
                out.push({ lng: effPath[i + 1].x, lat: effPath[i + 1].y, seq: i + 1 });
            });
        } else {
            effPath.slice(1).forEach((p, i) => out.push({ lng: p.x, lat: p.y, seq: i + 1 }));
        }
        return out;
    }, [drawLegs, effPath]);

    /** 🎯 목적지마다 마름모 하나 — 노선(길 띠)이면 그 목적지의 띠로 (⑮ 기준 1) */
    const goalNets = useMemo(() => goals.map(g => ({
        goal: g,
        net: routeMode && g.name === dst.name
            ? buildRoadNet(road ? road.line : [], g, params.dstDiamKm, detourWidthKm)
            : buildNet(params, anchor, g),
    })), [goals, routeMode, road, detourWidthKm, params, anchor, dst.name]);
    const net = goalNets[0].net;                     // 대표 하나가 필요한 자리 (자동 맞춤 등)
    const zone = useMemo(
        () => routeMode ? roadZoneOf(road ? road.line : [], dst, params.dstDiamKm, detourWidthKm) : undefined,
        [routeMode, road, dst, params.dstDiamKm, detourWidthKm]);
    /** 화면·아웃풋이 읽는 영역 = **살아 있는 마름모들의 합집합** (⑮ 기준 3) */
    const areaNet = useMemo(() => {
        const seen = new Set<string>();
        const pass: typeof goalNets[number]['net']['pass'] = [];
        for (const { net: n } of goalNets) for (const pt of n.pass) {
            const k = `${pt.region}|${pt.name}`;
            if (!seen.has(k)) { seen.add(k); pass.push(pt); }
        }
        const grouped = new Map<string, string[]>();
        for (const pt of pass) grouped.set(pt.region, [...(grouped.get(pt.region) ?? []), pt.name]);
        return {
            groups: [...grouped.entries()].map(([region, names]) => ({ region, names })).sort((x, y) => y.names.length - x.names.length),
            pass, count: pass.length,
        };
    }, [goalNets]);
    /**
     * 📦 **앱에 내려갈 필터 아웃풋** (기사님 2026-09-07: *"DB 도 서버통신도 없이, 필터 로직을
     * 잘 만들어 앱에 전달할 아웃풋만 만든다"*) — 실험실 상태에서 곧장 파생하는 순수 계산.
     * 🔴 필드 이름은 실물 규격(shared `AutoDispatchFilter`) 그대로 쓴다 — 이식 때
     * «실험실 아웃풋 ↔ 서버 아웃풋» 대조만으로 끝나게. 제외지역은 여기서 이미 빠져 있다.
     */
    const appFilterOutput = useMemo(() => buildAppFilterOutput({
        callTarget, dispatchPhase: dispatchPhaseSim, driving,
        dstName: dst.name, groups: areaNet.groups, pass: areaNet.pass, excluded: routeMode ? [] : excluded,
        pickupRadiusKm: ps.pickupRadiusKm, dropoffRadiusKm: ps.dropoffRadiusKm,
        detourAllowKm: ps.detourAllowKm, discountPct: ps.discountPct,
        vehicles, excludedWords, slotsUsed, capacityConfirmed,
        modeDesc: `🎯 ${goals.map(g => g.name).join(' ∪ ')} · ` + (road ? `길 ±${detourWidthKm}km — ${road.name}` : routeMode ? '노선 (길 미선택 — 목적지 원만)' : localMode ? '관내 (목적지 원)' : `동선 사각형 ${params.srcAngleDeg}°/${params.dstAngleDeg}°`),
    }), [callTarget, dispatchPhaseSim, driving, dst, areaNet, excluded, ps, vehicles, excludedWords, slotsUsed, capacityConfirmed, road, routeMode, detourWidthKm, localMode, params, goals]);
    /**
     * 🔴 **«짐을 실은 목적지» — 원천 하나** (2026-09-08 리뷰: 화면과 판정이 다른 답을 냈다).
     * ∩(상차 조이기)를 거는 기준이다. 판정(judgeGoals)·그리기·판정 칩이 **모두 이걸** 읽는다 —
     * 그리기가 옛 전역 routeStarted 를 읽으면 «지도에 안 그린 자리의 콜이 통과»한다.
     */
    const loadedGoalNames = useMemo(() => [...new Set(confirmed.map(c => c.destName))], [confirmed]);
    const isLoaded = (goalName: string) => loadedGoalNames.includes(goalName);
    /** 🎯 목적지별 판정 — 하나라도 통과하면 통과, 둘 다면 복귀 우선 (⑮ 기준 3) */
    const goalsVerdict = useMemo(() => pickup && drop
        ? judgeGoals(params, anchor, goals, myPos, pickup, drop, {
            loadedNames: loadedGoalNames,     // ∩ 는 «짐을 실은 목적지»에만 (⑮ 기준 5)
            isLocal: g => g.name === dst.name && localMode,
            zoneOf: g => (routeMode && g.name === dst.name) ? zone : undefined,
            preferName: HOME_DST.name,
        })
        : null, [pickup, drop, params, anchor, goals, myPos, loadedGoalNames, localMode, routeMode, zone, dst.name, HOME_DST.name]);
    const verdict: TwoStageVerdict | null = goalsVerdict?.won ?? goalsVerdict?.results[0]?.verdict ?? null;

    /**
     * 🧮 **합짐 우회 — 실물 계산을 그대로 쓴다** (기사님 확정 2026-09-08:
     * *"합짐 판단은 기존 경로와 지금 경로가 얼마나 차이가 있는가를 아는 것"*).
     *
     * 🔴 직선 근사를 **버렸다.** 서버 `/api/sim/detour` → 실물 `calculateDetourRoute` 가
     * base(기존 전부)와 merged(합짐 낀 경로)를 각각 카카오로 재서 차이를 준다 —
     * 목업이 실물과 다른 답을 내면 실험이 거짓말이 된다 (규칙 ③: 원천 하나).
     * 콜을 **올릴 때 한 번만** 부른다 (심사 = 집은 뒤의 일).
     */
    /**
     * 🧭 **전체 경로 실측 — 구간별로 그대로** (기사님 확정 2026-09-08).
     * 카카오가 구간마다 nkm/n분을 나눠 주므로 **합치지 않는다.** 우회는 같은 구간의
     * «전(기존 경로) vs 후(합짐 낀 경로)» 차이로 여기서 낸다:
     *   우회상차 = (합짐 낀 경로의 내위치→첫콜상차) − (기존 경로의 내위치→첫콜상차)
     *   우회하차 = 하차 구간들의 합 차이
     */
    /**
     * `measuredAt` — 🔴 **이 경로를 «언제» 쟀나** (실물 `orders.routeComputedAt` 자리).
     * 구간 분은 **잰 그 순간의 내 위치**에서 나온 값이라, 예정 시각을 낼 때 «지금»에 더하면
     * 달릴수록 예정이 함께 뒤로 밀린다 — 실측(2026-09-09): 예정 04:42 라 해 놓고 실제로는
     * 03:53 에 닿았다. 30분 달리면 예정도 30분 밀려 있었던 것이다.
     */
    type ChainResult = { legs: ChainLeg[]; totalKm: number | null; totalMin: number | null; partial?: boolean; note?: string; measuredAt?: number };
    const [chainNow, setChainNow] = useState<ChainResult | null>(null);
    const [chainBefore, setChainBefore] = useState<ChainResult | null>(null);
    /**
     * 🗄️ **⑦ 저장 — 콜을 확정한 순간의 전체 경로.** 다음 합짐의 «기존 경로»가 바로 이것이다.
     * 다시 재지 않으므로 카카오 호출이 한 번 줄고, 실패해서 «?» 가 되는 일도 없다.
     */
    const lastChainRef = useRef<ChainResult | null>(null);
    /** ✅ 콜 확정 — 리스트에 넣고, 그 콜의 배송 거리·시간·톨비를 실측해 카드에 붙인다 (기사님 2026-09-08).
     *  ⚠️ 옵션은 카카오 «추천» 하나다 (서버 calculateSoloRoute 기본값) — 길 찾기의 5옵션과 다르다. 카드에 표기함 */
    const confirmCall = (p: Pt, d: Pt) => {
        const id = ++callSeqRef.current;
        const caughtDest = goalsVerdict?.wonGoal?.name ?? dst.name;   // 통과한 목적지가 곧 판 (⑮ 기준 3)
        const merge = confirmed.length > 0;                            // 합짐인가 — 첫짐과 저장 경로가 다르다
        const known = uploadedInfoRef.current;   // 🗄️ 첫짐: ⑤⑥ 전체 경로에서 이미 꺼낸 값
        const app = approachInfo;                // 🗄️ 첫짐: 전체 경로의 첫 구간(내 위치→상차)
        lastChainRef.current = chainNow;         // 🗄️ ⑦ 이 전체 경로가 다음 합짐의 «기존 경로»가 된다
        // ⏰ 최초 약속 — 확정한 이 순간 전체 경로가 말한 도착 시각. 이후 어떤 합짐이 와도 안 바뀐다
        const t0 = clockNow, noNew = circled(confirmed.length + 1);   // 🕒 모의 시계
        /** 병합 경로의 그 정거장까지 누적 분 — 🔴 약속에는 안 쓴다 (`promiseTimes` 참조) */
        const cumMin = (label: string) => {
            let acc = 0;
            for (const lg of chainNow?.legs ?? []) {
                if (lg.durMin == null) return null;
                acc += lg.durMin;
                if (lg.to === label) return acc;
            }
            return null;
        };
        const chainCum = { pickupMin: cumMin(`${noNew}상차`), dropoffMin: cumMin(`${noNew}하차`) };
        const mkStep = (promisedAt: number | null): StopStep => ({ promisedAt, predictedAt: null, occurredAt: null, source: null });
        /**
         * ⏰ 약속은 **직행 기준**이다. 첫짐은 ⑤⑥ 전체 경로가 곧 직행이라 지금 바로 서고,
         * 합짐은 ⑮ 가 와야 선다 — 그때까지 **비워 둔다** (병합 값으로 대신 채우지 않는다).
         */
        const p0 = promiseTimes({ confirmedAt: t0, chainCum,
            direct: merge ? { approachMin: null, durMin: null }
                : { approachMin: app?.durMin ?? null, durMin: known?.durMin ?? null } });
        const steps = { pickup: mkStep(p0.pickupAt), dropoff: mkStep(p0.dropoffAt) };
        setConfirmed(c => [...c, { id, pickup: p, drop: d, optionUsed: routeCombo.label, destName: caughtDest,
            steps,
            ...(app && !merge ? { approachKm: app.distKm, approachMin: app.durMin } : {}),
            ...(merge || !known ? {} : {                     // 🔴 `failed` 는 콜의 칸이 아니다 — 골라 담는다
                distKm: known.failed ? null : known.distKm,
                durMin: known.failed ? null : known.durMin,
                tollWon: known.tollWon, routeComputedAt: Date.now(),
            }) }]);
        if (!merge && known) return;             // 첫짐은 ⑦ 이 이미 끝났다 — 더 안 묻는다
        /**
         * 🔴 **⑮⑯ 합짐 고유 배송 — 확정한 «뒤»에 한 번** (기사님 순서 개정 2026-09-08:
         * *"14-2 기사가 콜 확정을 클릭 · 15. 합짐의 고유의 배송시간을 알기 위해
         * (내위치 - 합짐상차지좌표 - 합짐하차지좌표)로 카카오 api 를 호출해"*).
         *
         * 심사(⑭-1)는 전체 경로만으로 끝난다 — **안 잡을 콜에 카카오를 쓰지 않는다.**
         * 여기서 받은 두 구간이 곧 ⑯ 의 «상차 시간·배송 시간»이다.
         */
        const from = { ...myPos };
        callApi(merge ? '✅ ⑮ 합짐 고유(내 위치→상차→하차)' : '✅ 콜 확정 실측', '/sim/route',
            { points: [{ x: from.lng, y: from.lat }, { x: p.lng, y: p.lat }, { x: d.lng, y: d.lat }], priority: routeCombo.priority, avoid: routeCombo.avoid },
            `내 위치 ${from.lng.toFixed(4)},${from.lat.toFixed(4)} → 상차 ${p.lng.toFixed(4)},${p.lat.toFixed(4)} → 하차 ${d.lng.toFixed(4)},${d.lat.toFixed(4)}`, uploadTag ?? undefined)
            .then(res => {
                const [ai, di] = res.legInfo ?? [];
                const pickMin = ai && !ai.failed ? ai.durMin : null;
                const dropMin = di && !di.failed ? di.durMin : null;
                setConfirmed(c => c.map(x => x.id === id ? {
                    ...x,
                    routeComputedAt: Date.now(),
                    ...(ai ? { approachKm: ai.failed ? null : ai.distKm, approachMin: ai.failed ? null : ai.durMin } : {}),
                    ...(di ? { distKm: di.failed ? null : di.distKm, durMin: di.failed ? null : di.durMin, tollWon: di.tollWon } : {}),
                    /**
                     * ⏰ **약속이 아직 비어 있으면 여기서 세운다** (기사님 2026-09-09:
                     * *"각각 따로 받고 있어 — 상차지까지 시간과 하차지까지 시간. 이 둘을
                     * 킵할 때 저장해 두는 거 아냐?"*).
                     * 전체 경로 호출이 통째로 실패해도 이 두 구간은 따로 잰 값이라 살아 있다 —
                     * 그러면 약속도 서야 한다. 이미 선 약속은 **덮지 않는다**(못 박은 것이다).
                     */
                    steps: (() => {
                        // ⏰ ⑮ 가 왔다 — 직행 기준으로 약속을 세운다 (이미 선 약속은 못 박은 것이라 안 덮는다)
                        const pr = promiseTimes({ confirmedAt: t0, chainCum, direct: { approachMin: pickMin, durMin: dropMin } });
                        return {
                            pickup: { ...x.steps.pickup, promisedAt: x.steps.pickup.promisedAt ?? pr.pickupAt },
                            dropoff: { ...x.steps.dropoff, promisedAt: x.steps.dropoff.promisedAt ?? pr.dropoffAt },
                        };
                    })(),
                } : x));
            })
            .catch(err => {
                // 🔴 직선 km 를 지어내지 않는다 — 「재 봤는데 못 쟀다」로 남긴다 (규칙 ④)
                console.warn('[⑮ 고유 배송] 못 받았다 — 값 없이 남긴다:', err);
                setConfirmed(c => c.map(x => x.id === id
                    ? { ...x, distKm: null, durMin: null, tollWon: null, routeComputedAt: Date.now() } : x));
            });
    };

    /** 🔴 올리기 경합 가드 — 늦게 온 옛 콜 응답이 새 콜 값을 덮어쓰면 안 된다 (2026-09-08 리뷰) */
    const uploadSeqRef = useRef(0);
    /**
     * 🔴 콜을 처리하면 시험 콜 상태만 지운다 — **`chainNow` 는 남긴다.**
     * 확정된 콜의 정거장 시각(콜 리스트의 «이동시간 · 지연 · 도착»)을 그 값이 물고 있다.
     * (다음 콜을 올리면 어차피 새 값이 덮는다)
     */
    const resumeAfterCall = () => { setCallSeenAt(null); setUploaded(false); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++; if (pausedForCall) { setPausedForCall(false); setDriving(true); } };
    const uploadCall = () => {
        if (!pickup || !drop) return;
        const seq = ++uploadSeqRef.current;
        const fresh = () => seq === uploadSeqRef.current;
        const callTag = `콜#${seq}`;          // 🔎 이 콜을 올리며 부른 것들 — 심사 영역이 이걸로 고른다
        setUploadTag(callTag);
        setUploaded(true); setCallSeenAt(Date.now()); setNowTick(Date.now()); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); uploadedInfoRef.current = null;
        // 🔴 **«상차지까지» 구간(현위치→상차지)을 함께 받는다** (기사님 2026-09-08: *"상차지 약속을
        //    잡을 수 없다 — 얼마나 시간과 거리가 되는지 모르니까"*). 상차 약속의 재료다.
        const me = { ...myPos };
        /**
         * 🔴 **⑮ 는 여기서 안 부른다 — «콜 확정» 뒤다** (기사님 순서 개정 2026-09-08:
         * *"14-1 이 정보들로 심사 진행 · 14-2 기사가 콜 확정을 클릭 · 15. 합짐의 고유의
         * 배송시간을 알기 위해 …"*).
         *
         * 심사(⑭-1)에 쓰는 값은 **전체 경로가 다 준다.** 고유 배송은 «잡은 콜의 장부»에 적을 값이라
         * 확정한 뒤에 한 번 부르면 된다 — 안 잡을 콜에 카카오를 쓰지 않는다. `confirmCall` 참조.
         */

        /**
         * 🧭 **기사님 순서 ②~⑥ · ⑫~⑯** (2026-09-08):
         *   ④⑫ 우리 시스템이 «최적경로»로 재배치 → ⑤⑬ 그 순서로 카카오 1회
         *   → ⑥⑭ **구간별** nkm/n분을 그대로 받는다 (합치지 않는다)
         *   기존 경로도 같은 방식으로 재서, 우회는 **같은 구간의 차이**로 낸다
         */
        setChainNow(null); setChainBefore(null); setChainPreview(null);
        /**
         * ④⑫ 재배치 — 🔴 **기점은 «지금 내 위치»다** (기사님 2026-09-08: *"왜 출발부터 재는 거야?
         * 내 위치에서 상차까지면 훨씬 가까워진 것일 텐데"*).
         *
         * 집(NET_SRC)에서 재면 **이미 지나온 거리가 통째로 들어간다** — 실측에서 159km 가 나왔다.
         * 판단은 «지금 여기서 이 콜을 붙이면»이므로 기점도 지금 자리여야 한다.
         * 지나온 정거장은 빼고 **남은 것만** 재배치한다 (그래야 «가는 길에 하나 더»가 나온다).
         */
        const chainOf = (calls: Array<{ pickup: Pt; drop: Pt; destName: string }>) => {
            if (calls.length === 0) return null;
            const visited = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
            const stops = orderStopsInsert(me, calls, visited)
                .filter(st => !visited.some(v => v.call === st.call && v.kind === st.kind));   // 지나온 곳은 뺀다
            if (stops.length === 0) return null;      // 다 다녀왔다 — 잴 구간이 없으니 묻지 않는다
            return [{ x: me.lng, y: me.lat, label: '내 위치' },
                ...stops.map(st => ({ x: st.pt.lng, y: st.pt.lat, label: `${circled(st.call)}${st.kind}` }))];
        };
        const baseCalls = confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName }));
        const caught = goalsVerdict?.wonGoal?.name ?? dst.name;
        const withCall = [...baseCalls, { pickup, drop, destName: caught }];
        const nowStops = chainOf(withCall)!;
        callApi('🧭 전체 경로 실측(재배치 후)', '/sim/chain',
            { stops: nowStops, priority: routeCombo.priority, avoid: routeCombo.avoid },
            `정거장 ${nowStops.length}: ${nowStops.map(x => x.label).join(' → ')}`, callTag)
            .then(d => {
                if (!fresh()) return;
                setChainNow({ ...d, measuredAt: clockBaseRef.current + simMinRef.current * 60000 });
                const newNo = circled(confirmed.length + 1);   // 전체 경로 라벨은 calls 배열 순번 — 새 콜이 마지막
                setChainPreview((d.legs ?? [])
                    .filter((lg: ChainLeg) => !lg.failed && lg.line.length >= 2)
                    .map((lg: ChainLeg) => ({
                        line: lg.line.map(q => ({ lng: q.x, lat: q.y })),
                        isNew: lg.from?.startsWith(newNo) === true || lg.to?.startsWith(newNo) === true,
                    })));
                /**
                 * ⑥⑦ 첫짐 — 카카오가 나눠 준 **그 구간 그대로** 저장·표시·궤적에 쓴다
                 * (기사님: *"그 정보로 첫 콜 정보창에 1번 상차시간 2번 배송시간을 저장하고"*).
                 * 합짐일 때는 ⑮ 고유 호출이 이미 채웠으므로 건드리지 않는다.
                 */
                if (confirmed.length === 0) {
                    const [ap, dl] = (d.legs ?? []) as ChainLeg[];
                    if (ap && !ap.failed) {
                        const aline: Pt[] = ap.line.map(q => ({ lng: q.x, lat: q.y }));
                        setApproachLeg(aline);
                        setApproachInfo({ distKm: ap.distKm, durMin: ap.durMin, failed: false });
                    }
                    if (dl && !dl.failed) {
                        setUploadedLeg(dl.line.map(q => ({ lng: q.x, lat: q.y })));
                        uploadedInfoRef.current = { distKm: dl.distKm, durMin: dl.durMin, tollWon: d.tollWon ?? null, failed: false };
                    }
                }
                // 🗄️ 확정되면 이 구간들이 경로에 그대로 들어간다 — 캐시에 넣어 다시 안 묻는다
                (d.legs ?? []).forEach((lg: ChainLeg, i: number) => {
                    const a2 = nowStops[i], b2 = nowStops[i + 1];
                    if (!a2 || !b2 || lg.failed || lg.line.length < 2) return;   // 못 잰 구간은 캐시에 안 넣는다
                    legCacheRef.current.set(legKey(a2.x, a2.y, b2.x, b2.y),
                        { line: lg.line.map(p => ({ lng: p.x, lat: p.y })), failed: false });
                });
            })
            .catch(err => { console.warn('[전체 경로] 못 받음:', err); if (fresh()) setChainNow({ legs: [], totalKm: null, totalMin: null, partial: true, note: `못 쟀다: ${String(err)}` }); });
        /**
         * 🔴 **기존 경로는 다시 재지 않는다 — ⑦ 에 저장해 둔 전체 경로가 곧 «기존»이다**
         * (기사님 2026-09-08: *"저장하라고 했잖아 … 그림까지 그려져 있는데 모른다는 게 말이 되니"*).
         *
         * 재배치는 «가장 싸게 끼워 넣기»라 **기존 콜들의 상대 순서를 안 바꾼다** — 그래서
         * 직전 전체 경로가 그대로 비교 기준이 된다. 다시 부르면 카카오 1회가 더 나가고,
         * 그 호출이 실패하면 «?» 만 남았다 (그 사고를 이걸로 없앤다).
         */
        setChainBefore(confirmed.length === 0
            ? { legs: [], totalKm: null, totalMin: null, note: '첫짐 — 기존 경로가 없다' }
            : lastChainRef.current
                ?? { legs: [], totalKm: null, totalMin: null, note: '직전 전체 경로를 아직 못 쟀다' });
    };
    /**
     * 📌 **기존 콜이 얼마나 밀리나** (기사님 2026-09-08: *"이 합짐이 기존 콜에 얼마나 영향이
     * 있는지 알아야 해 — 첫짐의 상차가 얼마나 늦어지는지, 첫짐이 하차지에 시간 안에 도착할 수
     * 있는지"*).
     *
     * 🔴 구간을 **합치지 않고** 누적한다: 전체 경로의 구간 를 순서대로 더하면 정거장마다 도착까지의
     * 분이 나온다. 같은 정거장을 두 경로(기존 · 합짐 낀)에서 찾아 빼면 **그 정거장이 몇 분
     * 밀리는지**가 나온다 — 총합 하나로는 «어느 약속이 깨지나»를 답할 수 없다.
     */
    /**
     * 🔴 **우회 — «첫짐을 하차지에 언제 가져다 주느냐»** (기사님 2026-09-08).
     *
     * 로직은 하나다: **첫콜 하차까지의 누적을, ⑦ 에 저장한 누적과 견준다.**
     * ```
     * 저장 도착 = (저장 상차지까지) + (저장 배송)
     * 지금 도착 = Σ 지금 전체 경로의  내 위치 → … → 첫콜하차   (사이에 낀 것이 몇이든 다 더한다)
     * 우회하차 = 지금 도착 − 저장 도착
     * ```
     * 🔴 **구간 하나만 보면 안 된다.** 기사님 손식은 `(합짐상차→첫콜하차) − (저장 배송)`
     * 이었는데, 그러면 사이에 낀 `(첫콜상차→합짐상차)` 가 통째로 빠진다 — 실측에서
     * 그 구간이 37분이었고, 13분이라고 답할 뻔한 지연이 실제로는 50분이었다.
     * **누적으로 재면 몇 개가 끼든 저절로 맞는다.**
     *
     * 🔴 **뒤 항(첫콜하차→합짐하차)은 안 더한다** — 기사님 말씀대로 그건 합짐 제 짐을
     * 내리러 더 가는 길이지 첫짐이 늦는 양이 아니다. 누적은 첫콜 하차에서 끊는다.
     *
     * 시한: **저장 배송 × 1.5 + 상차 약속 20분** (콜 시한 규칙). 넘으면 전화로 물린다.
     */
    const detourRows = useMemo(() => {
        if (!chainNow || confirmed.length === 0) return [];
        const first = confirmed[0], firstNo = circled(baseCallCount + 1);
        const rows: Array<{ name: string; min: number; how: string; budget?: { limitAt: number; usedAt: number } }> = [];
        /** 지금 전체 경로에서 그 정거장까지의 누적 분 — 못 잰 구간이 하나라도 있으면 null */
        const cumTo = (label: string) => {
            let acc = 0;
            for (const lg of chainNow.legs) {
                if (lg.durMin == null) return null;
                acc += lg.durMin;
                if (lg.to === label) return acc;
            }
            return null;
        };
        /**
         * 🔴 **분끼리 빼지 않는다 — 시각끼리 뺀다** (2026-09-09에 잡은 버그).
         *
         * 예전엔 `지금 누적분 − 저장 누적분` 이었다. 그런데 «지금 누적»은 **지금 내 위치**에서
         * 재고 «저장 누적»은 **확정하던 그 자리**에서 잰 값이다 — 기준점이 다른 두 분을 빼면
         * **그 사이에 흐른 시간이 통째로 빠진다.** 실측: 콜 리스트는 +70분이라는데 결론줄은
         * +40분이라고 했다(주행 30분이 사라진 것). 약속은 **절대 시각**으로 못 박아 뒀으니
         * 지금 도착 예정도 절대 시각으로 만들어 그것끼리 견준다.
         */
        const base = chainNow.measuredAt ?? clockNow;   // 🕒 잰 시각 기준 (위와 같은 규약)
        const etaOf = (label: string) => { const m = cumTo(label); return m == null ? null : base + m * 60000; };
        const lateMin = (etaAt: number | null, promisedAt: number | null | undefined) =>
            etaAt != null && promisedAt != null ? Math.round((etaAt - promisedAt) / 60000) : null;
        const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);

        const pickEta = etaOf(`${firstNo}상차`), pickLate = lateMin(pickEta, first.steps.pickup.promisedAt);
        if (pickLate != null)
            rows.push({ name: '우회상차', min: pickLate,
                how: `예정 ${hhmm(pickEta!)} − 약속 ${hhmm(first.steps.pickup.promisedAt!)}` });

        const dropEta = etaOf(`${firstNo}하차`), dropLate = lateMin(dropEta, first.steps.dropoff.promisedAt);
        if (dropLate != null && first.approachMin != null && first.durMin != null) {
            // ⏳ 하차 시한도 절대 시각으로 — 확정 순간부터 «배송×1.5 + 상차 약속 20분» 까지
            const confirmedAt = first.steps.dropoff.promisedAt! - (first.approachMin + first.durMin) * 60000;
            const deadlineAt = confirmedAt + (Math.round(first.durMin * 1.5) + 20) * 60000;
            rows.push({ name: '우회하차', min: dropLate,
                how: `예정 ${hhmm(dropEta!)} − 약속 ${hhmm(first.steps.dropoff.promisedAt!)}`,
                budget: { limitAt: deadlineAt, usedAt: dropEta! } });
        }
        return rows;
    }, [chainNow, confirmed, baseCallCount, clockNow]);
    /**
     * 📦 **콜 하나가 한 덩어리** (기사님 2026-09-08: *"좌우로 표현하지 말고 첫콜 합짐1 합짐2
     * 이렇게 순차적으로 덩어리감 있게"*).
     *
     * 기존↔지금을 좌우로 놓으면 «어느 콜이 어떻게 되는가»를 눈이 스스로 짜맞춰야 했다.
     * 콜마다 자기 상차·하차의 «기존 도착 → 지금 도착»을 들고 있게 바꾼다 — 마지막 덩어리가
     * 지금 심사하는 후보콜이다.
     */
    // 🕒 모의 시계의 속도 — 지금 경로가 말하는 ㎞/분 (카카오 실측). 없으면 40km/h 를 쓴다
    useEffect(() => {
        const c = chainNow ?? lastChainRef.current;
        if (c?.totalKm != null && c.totalMin) paceRef.current = c.totalKm / c.totalMin;
    }, [chainNow]);
    const callImpacts = useMemo(() => {
        const cand = !!(pickup && drop);                         // 후보콜은 전체 경로에서 마지막 번호
        const last = confirmed.length + (cand ? 1 : 0);
        /**
         * ⏱️ **예정 시각은 «계산»한다** (기사님 2026-09-09: *"아직 안 지났으면 언제 지날지
         * 예정 시간을 계산해서 넣는 것이 맞아"*).
         *
         * 얼어붙은 약속을 그대로 베끼지 않는다 — 약속은 «그때 정한 것»이고 예정은 «지금 가면
         * 언제 닿나»다. 남은 정거장을 방문 순서대로 걸으며 구간 분을 더한다:
         *   구간 분 = 방금 잰 전체 경로에 있으면 그 값 · 없으면 ⑦ 에 저장해 둔 그 콜의 구간
         * 하나라도 모르면 **거기서 멈춘다** (그 뒤는 빈칸 — 지어내지 않는다).
         */
        const legMin = new Map<string, number | null>();
        for (let n = 1; n <= last; n++) {
            const no = circled(n), c = n <= confirmed.length ? confirmed[n - 1] : null;
            legMin.set(`${no}상차`, c ? c.approachMin ?? null : approachInfo?.durMin ?? null);
            legMin.set(`${no}하차`, c ? c.durMin ?? null : uploadedInfoRef.current?.durMin ?? null);
        }
        for (const lg of chainNow?.legs ?? []) if (lg.to && lg.durMin != null) legMin.set(lg.to, lg.durMin);
        const visitedNow = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        const chainOrder = (chainNow?.legs ?? []).map(l => l.to).filter((x): x is string => !!x);
        const order = chainOrder.length ? chainOrder
            : orderStopsInsert(myPos, [
                ...confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })),
                ...(cand ? [{ pickup: pickup!, drop: drop!, destName: goalsVerdict?.wonGoal?.name ?? dst.name }] : []),
            ], visitedNow)
                .filter(st => !visitedNow.some(v => v.call === st.call && v.kind === st.kind))
                .map(st => `${circled(st.call)}${st.kind}`);
        /**
         * 🔢 **실제 방문 순번** — 지나온 정거장 다음에 남은 순서가 이어진다.
         *
         * 🔴 **겹치는 것을 빼고 잇는다.** 경로(`chainNow`)는 **주행 전에** 잰 것이라 지금
         * 지나온 정거장까지 그대로 품고 있다. 그냥 이어 붙이면 그 수만큼 번호가 밀린다 —
         * 실측(2026-09-09): 방문 순서 패널은 «4 관산동 · 5 지영동», 콜 리스트 배지는
         * «⑦관산동 · ⑧지영동». 지나온 셋을 두 번 세서 정확히 +3 이었다.
         */
        const visitedLabels = visitedNow.map(v => `${circled(v.call)}${v.kind}`);
        const fullOrder = [...visitedLabels, ...order.filter(l => !visitedLabels.includes(l))];
        // 🕒 기준은 «지금»이 아니라 **이 경로를 잰 시각**이다 — 안 그러면 달릴수록 예정이 뒤로 도망간다
        const t = chainNow?.measuredAt ?? clockNow;
        const now = new Map<string, number>();
        let acc = 0;
        for (const label of order) {
            const m = legMin.get(label);
            if (m == null) break;                     // 모르는 구간부터는 예정을 못 낸다
            acc += m; now.set(label, t + acc * 60000);
        }
        return Array.from({ length: last }, (_, i) => {
            const n = i + 1, no = circled(n), isNew = cand && n === last;
            const c = isNew ? null : confirmed[n - 1];
            const from = isNew ? pickup : c!.pickup, to = isNew ? drop : c!.drop;
            return {
                no, disp: circled(baseCallCount + n), isNew, id: c?.id ?? null,
                where: from && to ? `${nearestDong(from).name} → ${nearestDong(to).name}` : '',
                stops: (['상차', '하차'] as const).map(kind => {
                    const label = `${no}${kind}`;
                    /**
                     * 🔴 **줄은 값이 없어도 남긴다** (기사님 2026-09-08: *"값이 없다고 그 줄이
                     * 없어지면 비교가 어려우니 모든 줄을 다 적어줘"*). 지나온 정거장은 전체 경로에
                     * 없으므로 ⑦ 에 저장한 구간을 대신 적고, 없으면 `--` 로 둔다.
                     */
                    const fromChain = chainNow?.legs.find(l => l.to === label) ?? null;
                    /**
                     * 🔴 **덩어리는 «그 콜의 것»만 보인다** (기사님 2026-09-09: *"이 영역은 첫짐의
                     * 영역이니까 첫짐이 가진 저장된 정보만 보여야 하는데"*).
                     *
                     * 지금 경로에서 그 정거장으로 **들어오는** 구간을 적었더니 첫짐 칸에
                     * `②하차 → ①하차 9.4km · 21분` 같은 남의 구간이 들어왔다 — «중대동에서
                     * 탄현동까지 21분» 으로 읽혀 거짓말이 된다. 저장한 자기 두 구간을 먼저 쓴다.
                     */
                    const saved = kind === '상차'
                        ? (c?.approachKm != null ? { from: '내 위치', to: label, distKm: c.approachKm, durMin: c.approachMin ?? null } : null)
                        : (c?.distKm != null ? { from: `${no}상차`, to: label, distKm: c.distKm, durMin: c.durMin ?? null } : null);
                    const step = c ? (kind === '상차' ? c.steps.pickup : c.steps.dropoff) : null;
                    const promised = step?.promisedAt ?? null;
                    return {
                        kind, label,
                        leg: saved ?? fromChain, fromSaved: !!saved,
                        seq: fullOrder.indexOf(label) + 1 || null,   // 🔢 실제 방문 순번
                        promisedAt: promised,
                        /**
                         * 🔴 **지나간 정거장에 «예정»은 없다** (기사님 2026-09-09: *"이 지역을
                         * 지나갔으면 … 지나간 시간을 적어 주는 것이 맞을 것 같아"*).
                         * 예정은 «앞으로 언제 닿나»의 답이라, 이미 닿은 곳에서는 **빈칸이 맞다** —
                         * 통과 시각으로 메우면 «예측»과 «사실»이 한 칸에서 섞인다.
                         * 아직 안 지났으면 위에서 **걸으며 계산한** 예정을 쓴다.
                         */
                        etaAt: step?.occurredAt != null ? null : now.get(label) ?? null,
                        passedAt: step?.occurredAt ?? null,
                    };
                }),
            };
        });
    }, [chainNow, confirmed, baseCallCount, pickup, drop, departed, myPos, approachInfo, goalsVerdict, dst.name, clockNow]);
    const stopImpacts = useMemo(() => {
        if (!chainNow || !chainBefore) return [];
        const cumOf = (legs: ChainLeg[]) => {
            const out = new Map<string, number>();
            let acc = 0;
            for (const lg of legs) {
                if (lg.durMin == null) return out;      // 못 잰 구간부터는 누적을 못 한다 (지어내지 않는다)
                acc += lg.durMin;
                if (lg.to) out.set(lg.to, acc);
            }
            return out;
        };
        const before = cumOf(chainBefore.legs), now = cumOf(chainNow.legs);
        const rows: Array<{ stop: string; beforeMin: number; nowMin: number; delayMin: number }> = [];
        for (const [stop, b] of before) {
            const n = now.get(stop);
            if (n == null) continue;
            rows.push({ stop, beforeMin: b, nowMin: n, delayMin: n - b });
        }
        return rows;
    }, [chainNow, chainBefore]);

    /**
     * ⏱️ **확정 경로의 정거장 시각** (기사님 2026-09-08: 콜 리스트에 «(이동시간 − 늦어진 시간, 도착시각)»).
     * 재료는 이미 있다 — `drawLegs`(구간별 실측 곡선)와 같은 순서인 `effPath`.
     * 구간 시간은 캐시된 전체 경로 값에서 오고, 지연은 «이 콜을 잡기 전 경로»과의 차이다.
     * 🔴 못 잰 구간이 있으면 그 뒤는 **null** 이다 — 시각을 지어내지 않는다 (규칙 ④).
     */
    /**
     * ⏱️ **콜 리스트가 쓰는 정거장 시계 — `callImpacts` 에서 파생한다** (규칙 ③: 원천 하나).
     * 두 벌로 세면 같은 정거장이 두 화면에서 다른 시각을 말한다.
     * 다섯 값: 이동분 · 밀리는 분 · **약속**(못 박힌 것) · **예정**(지금 전체 경로) · **통과**(GPS).
     */
    // 🔎 지나는 순간 얼릴 «마지막 예상» 을 늘 최신으로 들고 있는다 (실물 `predicted_at` 자리)
    useEffect(() => {
        const m: Record<string, number | null> = {};
        for (const ci of callImpacts) if (ci.id != null) for (const st of ci.stops) m[`${ci.id}-${st.kind}`] = st.etaAt;
        etaRef.current = m;
    }, [callImpacts]);
    const stopClock = useMemo(() => {
        const out = new Map<string, {
            seq: number | null; legKm: number | null; legMin: number | null; delayMin: number | null;
            promisedAt: number | null; etaAt: number | null; passedAt: number | null;
        }>();
        for (const ci of callImpacts) for (const st of ci.stops) {
            const real = st.passedAt ?? st.etaAt;
            out.set(`${ci.disp}${st.kind}`, {
                seq: st.seq, legKm: st.leg?.distKm ?? null,
                legMin: st.leg?.durMin ?? null,
                delayMin: real != null && st.promisedAt != null ? Math.round((real - st.promisedAt) / 60000) : null,
                promisedAt: st.promisedAt, etaAt: st.etaAt, passedAt: st.passedAt,
            });
        }
        return out;
    }, [callImpacts]);

    /** ⛔ 제외지역에 걸린 콜 — 필터에 그 동이 안 실리므로 실전에선 애초에 안 올라온다 */
    const exclusionHit = useMemo(() => {
        if (!verdict) return null;
        if (isExcluded(verdict.pickupDong.region, verdict.pickupDong.name)) return `상차 ${verdict.pickupDong.region} ${verdict.pickupDong.name}`;
        if (isExcluded(verdict.dropDong.region, verdict.dropDong.name)) return `하차 ${verdict.dropDong.region} ${verdict.dropDong.name}`;
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verdict, excluded]);
    /** 화면·기록이 쓰는 최종 통과 — 기하 판정(verdict.pass)에 제외지역을 겹친 값 */
    const finalPass = !!goalsVerdict?.pass && !exclusionHit;

    /**
     * 📜 판정 기록 (기사님 요청 2026-09-07 «한 바퀴 돌고 검토») — 처리(확정/버림)된 콜만 남긴다.
     * 한 바퀴 돌고 나서 이 목록으로 복기한다 — 최근 것이 위.
     */
    const [logs, setLogs] = useState<Array<{ t: string; from: string; to: string; dists: string; pass: boolean; local: boolean; act: '확정' | '버림' }>>([]);
    const pushLog = (act: '확정' | '버림') => {
        if (!verdict) return;
        const t = new Date().toTimeString().slice(0, 8);
        setLogs(l => [{
            t, from: verdict.pickupDong.name, to: verdict.dropDong.name,
            dists: `${verdict.distPickKm} : ${verdict.distDropKm} : ${verdict.distMeKm}`,
            pass: finalPass, local: localMode, act,
        }, ...l].slice(0, 40));
    };

    /** 주행 목표를 지금 자리에서 다시 잡는다 — 경로가 다시 짜였거나 주행을 새로 시작할 때 */
    const retarget = () => {
        if (drivePath.length < 1) { targetIdxRef.current = 0; return; }
        let bi = 0, bd = Infinity;
        drivePath.forEach((p2, i) => {
            const d = Math.hypot((p2.lng - myPosRef.current.lng) * 88.6, (p2.lat - myPosRef.current.lat) * 110.574);
            if (d < bd) { bd = d; bi = i; }
        });
        targetIdxRef.current = Math.min(bi + 1, drivePath.length - 1);
        setTargetSeq(drivePath[targetIdxRef.current]?.seq ?? 1);
    };
    useEffect(() => { retarget(); /* 경로(직선→실도로 포함)가 바뀌면 다음 점을 다시 찾는다 */ }, [drivePath]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!driving) return;
        if (drivePath.length < 1) { setDriving(false); return; }
        const STEP_KM = SPEEDS[speedIdx].kmPerTick;
        const id = setInterval(() => {
            simMinRef.current += STEP_KM / paceRef.current;   // 🕒 나아간 거리만큼 «모의 분»을 쌓는다
            setSimMin(simMinRef.current);
            setMyPos(pos => {
                let ti = targetIdxRef.current;
                let remain: number = STEP_KM;
                let cur = pos;
                // 실도로 점은 촘촘하다 — 한 틱 걸음이 남는 만큼 여러 점을 이어 삼킨다
                while (remain > 0 && ti < drivePath.length) {
                    const t = drivePath[ti];
                    const dx = (t.lng - cur.lng) * 88.6, dy = (t.lat - cur.lat) * 110.574;
                    const d = Math.hypot(dx, dy);
                    if (d <= remain) { cur = { lng: t.lng, lat: t.lat }; remain -= d; ti++; setTargetSeq(t.seq);
                        // 🔴 `seq` 는 **향하는** 정거장이다 — 그걸 «지나왔다»고 세면 한 칸 앞서 잠긴다.
                        //    (2026-09-08 실측: 양벌동으로 가는 중인데 주교동까지 방문으로 잠겨
                        //     방문 순서가 양벌→주교→신장→의정부 로 굳었다. 실제 최적은 양벌→신장→의정부→주교)
                        const passed = t.seq - 1;
                        if (passed > visitedCountRef.current) {
                            const now = clockBaseRef.current + simMinRef.current * 60000;   // 🕒 모의 시계로 찍는다
                            const just = prevOrderRef.current.slice(visitedCountRef.current, passed);
                            // ⏱️ 실측(`occurredAt`)과 **그때의 마지막 예상**(`predictedAt`)을 같은 행에 남긴다
                            if (just.length) setConfirmed(cs => cs.map((c, idx) => {
                                const hits = just.filter(v => v.call - 1 - baseCallCount === idx);
                                if (!hits.length) return c;
                                const st = { ...c.steps };
                                for (const v of hits) {
                                    const k = v.kind === '상차' ? 'pickup' : 'dropoff';
                                    if (st[k].occurredAt != null) continue;      // 한 번 지난 곳은 다시 안 덮는다
                                    st[k] = { ...st[k], occurredAt: now, source: '자동(GPS)',
                                        predictedAt: st[k].predictedAt ?? etaRef.current[`${c.id}-${v.kind}`] ?? null };
                                }
                                return { ...c, steps: st };
                            }));
                            visitedCountRef.current = passed;
                        } }
                    else { cur = { lng: cur.lng + dx / d * remain / 88.6, lat: cur.lat + dy / d * remain / 110.574 }; remain = 0; }
                }
                targetIdxRef.current = ti;
                if (ti >= drivePath.length) setDriving(false);   // 경로 끝 — 대기로
                return cur;
            });
        }, 120);
        return () => clearInterval(id);
    }, [driving, drivePath, speedIdx]);

    useEffect(() => {
        const measure = () => {
            const el = boxRef.current;
            if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // 휠 줌 — 커서 자리를 고정한 채 즉시 건다 (passive:false 라 페이지 스크롤을 막을 수 있다)
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size]);

    useEffect(() => {
        const draw = () => {
            const cv = canvasRef.current;
            if (!cv || size.w < 50) return;
            const dpr = window.devicePixelRatio || 1;
            cv.width = size.w * dpr; cv.height = size.h * dpr;
            const ctx = cv.getContext('2d')!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // 범위: 그물 + 경로 + 시험 점 → 다 담기는 줌을 고른다 (9~12)
            // 🔴 내 위치·목적지는 항상 넣는다 — 노선 탭(길 미확정)은 그물이 비어 목적지만 잡히고
            //    내 위치가 화면 밖으로 잘렸다 (기사님 2026-09-07 «노선을 클릭해도 함께 노출»)
            // 🔴 자동 맞춤은 **모든 목적지 마름모**를 담는다 — 첫 목적지만 보면 복귀 마름모가 화면 밖이다
            const pts: Array<[number, number]> = [
                ...goalNets.flatMap(g => g.net.tri), [myPos.lng, myPos.lat],
                ...goals.map(g => [g.lng, g.lat] as [number, number]),
            ];
            if (road) pts.push(...road.line);
            if (realLegs) for (const leg of realLegs) for (const p of leg) pts.push([p.lng, p.lat]);
            for (const g of goalNets) for (const c of g.net.circles) pts.push(...c.ring);
            for (const p of effPath) pts.push([p.x, p.y]);
            if (pickup) pts.push([pickup.lng, pickup.lat]);
            if (drop) pts.push([drop.lng, drop.lat]);
            let z: number, originX: number, originY: number;
            if (view.manual) {
                // 🔍 수동 보기 — 드래그·휠줌이 정한 중심과 줌 그대로
                z = view.z;
                const [ccx, ccy] = worldPx(view.center.lng, view.center.lat, z);
                originX = ccx - size.w / 2; originY = ccy - size.h / 2;
            } else {
                z = 12;
                for (; z >= 9; z--) {
                    const ws = pts.map(([lng, lat]) => worldPx(lng, lat, z));
                    const spanX = Math.max(...ws.map(w => w[0])) - Math.min(...ws.map(w => w[0]));
                    const spanY = Math.max(...ws.map(w => w[1])) - Math.min(...ws.map(w => w[1]));
                    if (spanX + 60 <= size.w && spanY + 60 <= size.h) break;
                }
                const ws = pts.map(([lng, lat]) => worldPx(lng, lat, z));
                const cx = (Math.max(...ws.map(w => w[0])) + Math.min(...ws.map(w => w[0]))) / 2;
                const cy = (Math.max(...ws.map(w => w[1])) + Math.min(...ws.map(w => w[1]))) / 2;
                originX = cx - size.w / 2; originY = cy - size.h / 2;
            }
            viewRef.current = { z, originX, originY };
            const S = (lng: number, lat: number): [number, number] => {
                const [x, y] = worldPx(lng, lat, z);
                return [x - originX, y - originY];
            };

            ctx.fillStyle = '#e8e4dc'; ctx.fillRect(0, 0, size.w, size.h);
            // 🗺️ OSM 타일 — (레이어: 배경 지도)
            if (layers.base) {
            const t0x = Math.floor(originX / TILE), t0y = Math.floor(originY / TILE);
            const t1x = Math.floor((originX + size.w) / TILE), t1y = Math.floor((originY + size.h) / TILE);
            for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
                const key = `${z}/${tx}/${ty}`;
                let img = tileCache.get(key);
                if (!img) {
                    img = new Image();
                    img.onload = () => drawRef.current();
                    img.src = `https://tile.openstreetmap.org/${key}.png`;
                    tileCache.set(key, img);
                }
                if (img.complete && img.naturalWidth > 0)
                    ctx.drawImage(img, tx * TILE - originX, ty * TILE - originY, TILE, TILE);
            }
            // 도형이 읽히게 타일을 살짝 가라앉힌다
            ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, size.w, size.h);
            }

            // 🧭 지역 구분선 — (레이어: 경계선)
            if (layers.border) for (const f of SIDO) {
                const polys = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
                ctx.beginPath();
                let inView = false;
                for (const poly of polys) for (const ring of poly) {
                    ring.forEach(([lng, lat], i) => {
                        const [px, py] = S(lng, lat);
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        if (px > -60 && px < size.w + 60 && py > -60 && py < size.h + 60) inView = true;
                    });
                    ctx.closePath();
                }
                if (!inView) continue;
                ctx.strokeStyle = 'rgba(71,85,105,.6)'; ctx.lineWidth = 1.6; ctx.stroke();
            }

            // km → px 환산 (경유 띠 폭·원을 땅 위 크기로)
            const kmBase = S(dst.lng, dst.lat);
            const kmProbe = S(dst.lng + 1 / (111.32 * Math.cos(dst.lat * Math.PI / 180)), dst.lat);
            const pxPerKm = Math.hypot(kmProbe[0] - kmBase[0], kmProbe[1] - kmBase[1]);

            /**
             * 🎯 **목적지마다 마름모 하나 + 원 둘** (⑮ 동선의 기준 · 기사님 2026-09-08).
             * 목적지가 둘이면 사각형도 둘, **목적지 원도 둘**. 출발각은 각자 제 목적지를 향한다.
             * 첫 콜 뒤에는 내 위치 원을 **그 목적지 원뿔과의 교집합**만 남긴다 (기준 5).
             */
            if (layers.net) for (const { goal, net: gn } of goalNets) {
                const isRoad = routeMode && goal.name === dst.name;
                if (!isRoad && gn.tri.length) {
                    ctx.beginPath();
                    gn.tri.forEach(([lng, lat]: [number, number], i: number) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(14,165,233,.10)'; ctx.fill();
                    ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2.5; ctx.stroke();
                }
                // 🔴 노선(길 띠)의 그물에는 내 위치 원이 없다 — 직접 두른다. 판정은 이 반경을 쓰므로
                //    안 그리면 «화면에 없는 선이 콜을 떨어뜨린다» (2026-09-08 리뷰에서 잡힘)
                if (isRoad) {
                    const [mx, my] = S(myPos.lng, myPos.lat);
                    ctx.strokeStyle = 'rgba(217,119,6,.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(mx, my, (params.srcDiamKm / 2) * pxPerKm, 0, Math.PI * 2); ctx.stroke();
                    ctx.setLineDash([]);
                }
                const inQuadFn = quadTesterOf(params, anchor, goal);
                ctx.strokeStyle = '#d97706'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
                gn.circles.forEach((c: { ring: Array<[number, number]> }, ci: number) => {
                    if (ci === 0 && isLoaded(goal.name) && !isRoad) {   // ∩ 는 짐 실은 목적지에만 (원천: loadedGoalNames)
                        for (let i = 1; i < c.ring.length; i++) {
                            const [lng1, lat1] = c.ring[i - 1], [lng2, lat2] = c.ring[i];
                            if (!inQuadFn({ lng: lng1, lat: lat1 }) || !inQuadFn({ lng: lng2, lat: lat2 })) continue;
                            const a2 = S(lng1, lat1), b2 = S(lng2, lat2);
                            ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
                        }
                    } else {
                        ctx.beginPath();
                        c.ring.forEach(([lng, lat]: [number, number], i: number) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                        ctx.stroke();
                    }
                });
                ctx.setLineDash([]);
                const [gx, gy] = S(goal.lng, goal.lat);
                ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
            }
            // 🛣️ 길 후보 (레이어: 길) — 목적지별 카카오 실측 길 전부. 고른 길은 굵게, 나머지는 얇게
            // 「길 찾기」 뒤에만 보이고, **경로 반경만큼 두껍게** (기사님 시나리오)
            // 🔴 첫 콜을 잡으면 길 «라인»은 지운다 (기사님 2026-09-07 밤: *"길찾기 했을 때 정해진
            //    라인이지 가는 경로가 아니다"*) — 실제 경로는 콜 색 곡선이 따로 그린다.
            //    고른 길의 **띠(±경로반경)는 남긴다** — 그건 장식이 아니라 필터 영역이다.
            if (layers.roads && routeMode && roadSearched && destRoads) {
                destRoads.forEach((r, ri) => {
                    const sel = ri === roadIdx;
                    if (routeStarted && !sel) return;             // 콜을 쥐면 안 고른 후보는 통째로 지운다
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    // 경유 띠 — **고른 길에만** 두른다 (기사님 2026-09-08: 후보 전부가 띠를 그리면 지도가 뒤덮인다)
                    if (sel) {
                        ctx.beginPath();
                        r.line.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                        ctx.strokeStyle = 'rgba(29,78,216,.25)';
                        ctx.lineWidth = Math.max(3, detourWidthKm * 2 * pxPerKm);
                        ctx.stroke();
                    }
                    if (routeStarted) return;                     // 콜을 쥐면 중심선도 지운다
                    // 중심선 — 후보는 얇게, 고른 길은 굵게
                    ctx.beginPath();
                    r.line.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.strokeStyle = sel ? '#1d4ed8' : 'rgba(71,85,105,.65)';
                    ctx.lineWidth = sel ? 3.5 : 1.5;
                    ctx.stroke();
                });
            }
            // 그물에 든 동 — 파란 점 · 제외지역은 흐린 ✕ (빠졌다는 것이 지도에서 보여야 한다)
            if (layers.net) for (const p of areaNet.pass) {
                const [px, py] = S(p.x, p.y);
                if (isExcluded(p.region, p.name)) {
                    ctx.strokeStyle = 'rgba(107,114,128,.75)'; ctx.lineWidth = 1.6;
                    ctx.beginPath(); ctx.moveTo(px - 3.5, py - 3.5); ctx.lineTo(px + 3.5, py + 3.5);
                    ctx.moveTo(px + 3.5, py - 3.5); ctx.lineTo(px - 3.5, py + 3.5); ctx.stroke();
                    continue;
                }
                ctx.fillStyle = 'rgba(2,132,199,.8)';
                ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2; ctx.stroke();
            }
            // ⛔ 가면 안 되는 지역 — 노하우 출처가 있는 것만 (그물과 무관하게 항상 보인다)
            for (const t of TRAP_DONGS) {
                const [px, py] = S(t.pt.lng, t.pt.lat);
                if (px < -30 || px > size.w + 30 || py < -30 || py > size.h + 30) continue;
                ctx.fillStyle = 'rgba(220,38,38,.18)';
                ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px - 5.5, py - 5.5); ctx.lineTo(px + 5.5, py + 5.5);
                ctx.moveTo(px + 5.5, py - 5.5); ctx.lineTo(px - 5.5, py + 5.5); ctx.stroke();
                ctx.font = '800 11px system-ui'; ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
                ctx.strokeText(`⛔ ${t.dong}`, px, py - 18);
                ctx.fillStyle = '#dc2626'; ctx.fillText(`⛔ ${t.dong}`, px, py - 18);
            }
            // 🐾 지나온 길 — 어두운 회색 실선, 경로 아래에 깔린다. 새 경로가 와도 남는다
            /**
             * 🎨 **구간 색 = 그 구간을 «만든» 콜** (기사님 확정 2026-09-09: *"원인색, 그러니까 콜 색"*).
             *
             * 예전엔 «도착하는 정거장»의 색이었다. 그러면 `②상차 → ①하차` 가 **①색**으로 칠해진다 —
             * 도착지가 ①이니까. 그런데 그 구간을 만든 건 **②번 합짐**이다. 합짐이 어디를 늘렸는지가
             * 색에서 사라졌다. 두 정거장 중 **나중에 잡은 콜**이 그 짝을 만든 콜이다.
             */
            const legColor = (i: number) => {
                const from = effPath[i]?.call, to = effPath[i + 1]?.call;
                const call = Math.max(from ?? to ?? 0, to ?? 0);
                return call > 0 ? CALL_COLORS[(call - 1) % CALL_COLORS.length] : (effPath[i + 1]?.color ?? '#e11d48');
            };
            // 잡은 콜 경로 — 구간 색 + 이름표 (레이어: 내 경로). 실도로 곡선이 오면 그걸로 잇는다
            if (layers.route) {
                if (drawLegs) {
                    drawLegs.forEach((leg, i) => {
                        ctx.beginPath();
                        const legPts = [{ lng: effPath[i].x, lat: effPath[i].y }, ...leg, { lng: effPath[i + 1].x, lat: effPath[i + 1].y }];
                        legPts.forEach((p, j) => { const [px, py] = S(p.lng, p.lat); j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                        ctx.strokeStyle = legColor(i); ctx.lineWidth = 5; ctx.lineJoin = 'round';
                        if (legFailed[i]) ctx.setLineDash([6, 5]);      // 도로 탐색 불가 — 직선 구간은 점선
                        ctx.stroke(); ctx.setLineDash([]);
                    });
                } else {
                    for (let i = 1; i < effPath.length; i++) {
                        const a = S(effPath[i - 1].x, effPath[i - 1].y), b = S(effPath[i].x, effPath[i].y);
                        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                        ctx.strokeStyle = legColor(i - 1); ctx.lineWidth = 5; ctx.stroke();
                    }
                }
            }
            /**
             * 🚗 **지나온 궤적은 경로 «위에», 더 가늘게** (기사님 확정 2026-09-09).
             *
             * 순서: 계획한 경로를 깔고 **실제 달린 길을 그 위에** 얹는다 — 나중에 일어난 일이 위다.
             * 토글도 갈랐다(«경로» ↔ «동선») — 계획만, 실제만, 둘 다를 따로 볼 수 있어야
             * 오차가 눈에 든다. 굵기: 경로 5px · 동선 2.5px. 🔴 **덮으면 안 된다** — 기사님이 이 두 줄을 겹쳐 두는
             * 이유가 *"경로와 지나간 길의 오차를 확인하기 위해"* 라서, 궤적이 경로를 가리면
             * 그 목적이 사라진다. 겹치면 색 줄 한가운데 검은 실선, 어긋나면 두 줄이 갈라져 보인다.
             */
            if (layers.trail) for (const seg of trailRef.current) {
                if (seg.length < 2) continue;
                ctx.beginPath();
                seg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                ctx.strokeStyle = 'rgba(17,24,39,.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
            }
            const chip = (px: number, py: number, text: string, tone: string) => {
                ctx.font = '800 11px system-ui';
                const w = ctx.measureText(text).width + 12;
                ctx.fillStyle = 'rgba(255,255,255,.94)';
                ctx.strokeStyle = tone; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(px - w / 2, py - 26, w, 18, 6); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.fillText(text, px, py - 13);
            };
            if (layers.route) for (const p of effPath) {
                const [px, py] = S(p.x, p.y);
                if (p.seq) {
                    // 방문 순번 배지 — 콜 색 원 안에 흰 번호 (기사님 2026-09-07 «경로에 번호»)
                    ctx.fillStyle = p.color ?? '#e11d48';
                    ctx.beginPath(); ctx.arc(px, py, 9.5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff'; ctx.fillText(String(p.seq), px, py + 0.5);
                    ctx.textBaseline = 'alphabetic';
                } else {
                    ctx.fillStyle = '#111827';
                    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
                }
                chip(px, py, p.label, p.color ?? '#111827');
            }
            // 꼭짓점(현위치) · 목적지
            for (const [pt, tone, mark] of [[anchor, '#111827', '📍'] as const,
                ...goals.map(g => [g, '#d97706', '🎯'] as const)]) {
                const [px, py] = S(pt.lng, pt.lat);
                ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
                chip(px, py, `${mark} ${pt.name}`, tone);
            }
            // 시험 콜 — (레이어: 시험 콜)
            if (layers.call && pickup && drop) {
                // ⏱️ 안전취소 30초 동안은 **굵게 깜빡인다** — «지금 결정해야 하는 콜»이라는 신호
                //    (기사님 2026-09-08 «좀 더 시뮬레이션처럼»). 30초가 지나면 조용한 점선으로
                const urgent = (safeCancelLeft ?? 0) > 0;
                const blink = urgent ? 0.45 + 0.55 * Math.abs(Math.sin(nowTick / 260)) : 1;
                // 🧭 «이 콜을 끼면 이렇게 간다» — 재배치한 전체 경로를 먼저 깐다 (합짐의 유일한 그림)
                if (chainPreview) for (const leg of chainPreview) {
                    if (leg.line.length < 2) continue;
                    ctx.beginPath();
                    leg.line.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    // 이 콜 때문에 생긴 구간은 판정색으로 굵게 — «무엇이 늘었나»가 보여야 확정을 누른다
                    ctx.strokeStyle = leg.isNew ? (finalPass ? '#16a34a' : '#dc2626') : 'rgba(37,99,235,.5)';
                    ctx.lineWidth = leg.isNew ? (urgent ? 5.5 : 4) : 5;
                    ctx.globalAlpha = leg.isNew ? blink : 1;
                    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                // 🚚 «상차지까지» — 내 위치 → 상차지. 전체 경로가 이미 그 구간을 품고 있으면 겹쳐 긋지 않는다
                //    (첫짐·합짐이 **같은 로직**이어야 한다 — 기사님 2026-09-08)
                if (!chainPreview?.length && approachLeg && approachLeg.length >= 2) {
                    ctx.beginPath();
                    approachLeg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.stroke();
                }
                const a = S(pickup.lng, pickup.lat), b = S(drop.lng, drop.lat);
                ctx.globalAlpha = blink;
                // 🔴 전체 경로가 오면 그것이 곧 «지금 경로»다 — 직선 점선을 위에 또 긋지 않는다.
                //    점선은 «아직 안 재 봤다»는 표시일 뿐이라 확정을 판단할 그림이 못 된다
                if (!chainPreview?.length) {
                    ctx.beginPath();
                    if (uploadedLeg && uploadedLeg.length >= 2) {   // 올린 뒤 — 카카오 실도로
                        uploadedLeg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    } else { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
                    ctx.strokeStyle = finalPass ? '#16a34a' : '#dc2626'; ctx.lineWidth = urgent ? 4.5 : 2.5;
                    ctx.setLineDash(uploadedLeg ? [] : urgent ? [12, 7] : [7, 5]); ctx.stroke(); ctx.setLineDash([]);
                }
                if (urgent) {   // 상차 자리에 퍼지는 고리 — 새 콜이 여기 떴다
                    const r = 12 + 10 * (1 - (safeCancelLeft ?? 0) / 30 % 1);
                    ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, Math.PI * 2);
                    ctx.strokeStyle = finalPass ? 'rgba(22,163,74,.55)' : 'rgba(220,38,38,.55)';
                    ctx.lineWidth = 2; ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
            /** 상·하차 마커 — 원 안에 「상」「하」 (기사님 2026-09-08: 삼각형은 방향으로 오해된다) */
            const stopDot = (x: number, y: number, label: '상' | '하', tone: string) => {
                ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 0.5);
                ctx.textBaseline = 'alphabetic';
            };
            if (layers.call && pickup) { const [px, py] = S(pickup.lng, pickup.lat); stopDot(px, py, '상', '#16a34a'); }
            if (layers.call && drop) { const [px, py] = S(drop.lng, drop.lat); stopDot(px, py, '하', '#dc2626'); }
        };
        drawRef.current = draw;
        draw();
    }, [net, areaNet, goalNets, loadedGoalNames, legFailed, approachLeg, chainPreview, safeCancelLeft, nowTick, finalPass, uploadedLeg, effPath, anchor, pickup, drop, verdict, size, params, dst, routeStarted, road, roadIdx, dstIdx, view, layers, routeMode, roadSearched, destRoads, detourWidthKm, knobs, myPos, drawLegs, excluded]);

    /** 클릭 한 점을 콜/내위치로 배치 */
    const placeAt = (pt: Pt) => {
        if (clickMode === 'me') { setMyPos(pt); setClickMode('call'); return; }
        if (!pickup || (pickup && drop)) { if (pickup && drop) pushLog('버림'); pauseForCall(); setPickup(pt); setDrop(null); setUploaded(false); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainNow(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++; setCallSeenAt(null); }
        else { setDrop(pt); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainNow(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++; }
    };

    const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const v = viewRef.current;
        if (dragRef.current.moved) { dragRef.current.moved = false; return; }   // 드래그 끝의 클릭은 콜이 아니다
        placeAt(fromWorldPx(v.originX + (e.clientX - rect.left), v.originY + (e.clientY - rect.top), v.z));
    };

    return (
        <div className="h-screen bg-background text-text-primary flex flex-col overflow-hidden">
            {/* 📋 저장된 콜 전부 — 화면이 파생값으로 말하니, 원본도 볼 수 있어야 한다 (기사님 2026-09-09) */}
            {callsPeek && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setCallsPeek(false)}>
                    <div className="w-full max-w-[900px] max-h-[85vh] overflow-auto rounded-[10px] border border-border-card bg-surface p-3 flex flex-col gap-2"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="text-[12px] font-black leading-snug">
                                📋 저장된 콜 {confirmed.length}건 — 날것 그대로
                                <div className="text-[10.5px] font-bold text-text-muted">
                                    화면의 괄호 다섯 값은 여기서 파생한다 · 시각은 모의 시계 기준
                                </div>
                            </div>
                            <button type="button" onClick={() => setCallsPeek(false)}
                                className="shrink-0 px-2 py-1 rounded-[8px] border border-border-card text-[11px] font-black">닫기</button>
                        </div>
                        {/* 🔴 **날것 그대로 찍는다** (기사님 2026-09-09: *"이런 형식으로 저장하고 있는 거 확실해?"*).
                            보기 좋으라고 이름을 바꿔 찍었더니 «저장 형태»로 읽혔다 — 그러면 팝업이 거짓말이다.
                            동 이름·시:분:초는 **저장된 값이 아니라 파생**이라 여기 안 넣는다. */}
                        <div className="text-[10px] font-black text-text-muted">confirmed — 콜 배열 (그대로)</div>
                        <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all rounded-md border border-border-card bg-background p-1.5 overflow-auto">
{JSON.stringify(confirmed, null, 2)}
                        </pre>
                        <div className="text-[9.5px] text-text-muted leading-snug">
                            시각은 <b>밀리초 숫자</b>로 저장한다(모의 시계 기준) · 동 이름은 좌표에서 그때그때 찾는 값이라 저장하지 않는다 ·
                            <b>steps</b> 는 실물의 <code>step_*</code> 여섯 표와 같은 모양이다 (약속·예상·실측·출처가 한 행에)
                        </div>
                        <div className="text-[9.5px] text-text-muted">null = 아직 못 잰 값. 0 으로 채우지 않는다</div>
                    </div>
                </div>
            )}
            {/* 🔎 카카오 한 건의 전문 — 보낸 값 / 받은 값 (기사님 2026-09-08) */}
            {apiPeek != null && apiLog[apiPeek] && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setApiPeek(null)}>
                    <div className="w-full max-w-[900px] max-h-[85vh] overflow-auto rounded-[10px] border border-border-card bg-surface p-3 flex flex-col gap-2"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="text-[12px] font-black leading-snug">
                                {apiLog[apiPeek].ok ? '✅' : '❌'} {apiLog[apiPeek].who}
                                <div className="text-[10.5px] font-bold text-text-muted">
                                    {apiLog[apiPeek].path} · {apiLog[apiPeek].ms}ms · {apiLog[apiPeek].t}
                                    {apiLog[apiPeek].tag && ` · ${apiLog[apiPeek].tag}`}
                                </div>
                            </div>
                            <button type="button" onClick={() => setApiPeek(null)}
                                className="shrink-0 px-2 py-1 rounded-[8px] border border-border-card text-[11px] font-black">닫기</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {([['↗ 보낸 값', apiLog[apiPeek].reqJson], ['↙ 받은 값', apiLog[apiPeek].resJson]] as const).map(([t, v]) => (
                                <div key={t} className="flex flex-col gap-1 min-w-0">
                                    <div className="text-[10px] font-black text-text-muted">{t}</div>
                                    <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all rounded-md border border-border-card bg-background p-1.5 max-h-[60vh] overflow-auto">{v}</pre>
                                </div>
                            ))}
                        </div>
                        <div className="text-[9.5px] text-text-muted">좌표 배열은 «점 N개» 로 접었습니다 — 값을 보려고 여는 창이라 폴리라인이 화면을 덮지 않습니다</div>
                    </div>
                </div>
            )}
            {/* ⚙️ 상단 — 설정 모음 (기사님 2026-09-07 «상단은 설정을 모으고») */}
            {/* ⚙️ 상단 — 설정 (필터는 왼쪽 탭으로 — 기사님 2026-09-07) */}
            <header className="shrink-0 border-b border-border-card bg-surface px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="min-w-[150px]">
                    <h1 className="text-[14px] font-black">🗺️ 지도 실험실</h1>
                    <p className="text-[11px] font-bold text-text-muted">
                        🎯 {dst.name} · {localMode ? '🏘️ 관내' : routeStarted ? (driving ? '🚗 주행 중' : '🛣️ 콜을 쥠') : '⏳ 대기'} · 지도 두 번 클릭 = 콜 (▲상차·▼하차)
                    </p>
                </div>
                <button type="button" onClick={() => setClickMode(clickMode === 'me' ? 'call' : 'me')}
                    className={`px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${clickMode === 'me'
                        ? 'bg-danger/15 border-danger/55 text-danger' : 'border-border-hover bg-background hover:border-danger'}`}>
                    {clickMode === 'me' ? '📍 지도 클릭 → 내 위치…' : '📍 내 위치 찍기'}
                </button>
                <div className="flex items-center gap-1 flex-wrap max-w-[340px]">
                    <span className="text-[11px] font-black text-info">🧅</span>
                    {([['base', '배경'], ['border', '경계'], ['roads', '길'], ['net', '그물'], ['route', '경로'], ['trail', '동선'], ['call', '시험콜']] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setLayers({ ...layers, [k]: !layers[k] })}
                            className={`px-2 py-1 rounded-[7px] border text-[10.5px] font-black ${layers[k] ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                            {layers[k] ? '👁' : '🚫'} {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-info">🚗</span>
                    {effPath.length > 1 ? (
                        <>
                            <button type="button" onClick={() => { if (!driving) retarget(); setDriving(!driving); }}
                                className={`px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${driving
                                    ? 'bg-success/15 border-success/55 text-success' : 'border-border-hover bg-background hover:border-success'}`}>
                                {driving ? '⏸ 멈춤' : '▶️ 주행'}
                            </button>
                            <span className="px-1.5 py-0.5 rounded-md bg-background border border-border-card text-[10.5px] font-black tabular-nums">
                                🕒 {new Date(clockNow).toTimeString().slice(0, 5)}
                                <span className="font-bold text-text-muted"> 모의</span>
                            </span>
                            <button type="button" onClick={() => setSpeedIdx((speedIdx + 1) % SPEEDS.length)}
                                className="px-2 py-1.5 rounded-[8px] border border-border-hover bg-background text-[11.5px] font-black hover:border-info whitespace-nowrap">
                                {SPEEDS[speedIdx].label}
                            </button>
                        </>
                    ) : (
                        <span className="px-2.5 py-1.5 rounded-[8px] border border-border-card bg-background text-[10.5px] text-text-muted font-bold">
                            🅿️ 대기 — 콜 확정 후 주행
                        </span>
                    )}
                    {safeCancelLeft !== null && (
                        <span className={`px-2 py-1 rounded-[8px] border text-[11px] font-black tabular-nums ${safeCancelLeft > 0
                            ? 'border-danger/55 bg-danger/10 text-danger' : 'border-border-hover bg-background text-text-muted'}`}>
                            {safeCancelLeft > 0 ? `⏱️ 안전취소 ${safeCancelLeft}초` : '⏱️ 안전취소 끝 — 결재는 기사님'}
                        </span>
                    )}
                    {pausedForCall && !driving && (
                        <span className="px-2 py-1 rounded-[8px] border border-warning/55 bg-warning/10 text-warning text-[10.5px] font-black">
                            ⏸ 새 콜 — 처리하면 재개
                        </span>
                    )}
                </div>
            </header>

            <div className="flex-1 min-h-0 flex">
                {/* 🗂️ 왼쪽 — 필터 (기사님 2026-09-07 와이어프레임: 필터 → 판정 → 콜 리스트) */}
                <aside className="w-[460px] shrink-0 border-r border-border-card bg-surface p-3 flex flex-col gap-2 overflow-y-auto">
                    {/* 🎯 요약줄 — 실물 규격 그대로 (OrderFilterStatus: «🎯 노선행 · 여기서 10km → 서울 1km · 📦 90/100»).
                        라벨은 shared CALL_TARGET_LABEL, 값은 지금 필터 상태에서 파생 (기사님 2026-09-07) */}
                    <div className="rounded-[8px] border border-border-card bg-background px-2 py-1.5 text-[11px] font-black leading-snug">
                        🎯 {CALL_TARGET_LABEL[callTarget]} · 여기서 {ps.pickupRadiusKm}km → {goals.map(g => g.name).join(' ∪ ')} {ps.dropoffRadiusKm}km
                        {' · 📦 '}{slotsUsed}/{TRUCK_CAPACITY_SLOTS}
                    </div>

                    {/* ↩️ 복귀 — «집»을 목적지로 **추가**한다 (⑮ 기준 2: 목적지는 의도다).
                        모드 전환이 아니라 목록에 하나 더 얹는 것 — 기존 목적지도 그대로 살아 있다 */}
                    <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => { freezeView(); setHomeOn(!homeOn); }}
                            className={`px-2 py-1.5 rounded-[8px] border text-[12px] font-black ${homeOn
                                ? 'bg-warning/15 border-warning/55 text-warning' : 'border-border-hover bg-background text-text-muted hover:border-warning'}`}>
                            {homeOn ? '↩️ 복귀 켜짐 — 목적지 둘 (누르면 끔)' : '↩️ 복귀 — 집을 목적지에 추가'}
                        </button>
                        <p className="text-[10.5px] text-text-muted leading-snug">
                            🎯 목적지 <b className="text-text-primary">{goals.map(g => g.name).join(' · ')}</b> — 마름모 {goals.length}개 ·
                            {' '}운행 <b className="text-text-primary">{dispatchPhaseSim === 'STANDBY' ? '대기' : dispatchPhaseSim === 'GATHERING' ? '콜 쥠' : '주행 중'}</b>
                            {' → 국면 '}<b className="text-info">{PHASE_LABEL[phase]}</b>
                        </p>
                    </div>

                    {/* 🔴 콜을 쥔 동안 동선→노선은 잠근다 (기사님 확정 2026-09-08: 노선은 새로 긋는 길이라
                        이미 잡은 콜들의 경로를 인지 못한다). 노선→동선은 늘 열림 — 동선이 더 넓어 콜들을 품는다 */}
                    <div className="flex gap-1">
                        {(() => { const lockRoute = !routeMode && confirmed.length > 0; return (
                        <button type="button" disabled={lockRoute}
                            title={lockRoute ? '콜을 쥔 동안은 노선으로 못 갑니다' : undefined}
                            onClick={() => { freezeView(); setRouteMode(true); }}
                            className={`flex-1 px-2 py-1.5 rounded-[8px] border text-[12px] font-black ${routeMode
                                ? 'bg-warning/15 border-warning/55 text-warning'
                                : lockRoute ? 'border-border-card bg-background text-text-muted/40 cursor-not-allowed'
                                : 'border-border-hover bg-background text-text-muted hover:border-warning'}`}>
                            {lockRoute ? '🔒 노선' : '🛣️ 노선'}
                        </button>
                        ); })()}
                        <button type="button" onClick={() => { freezeView(); setRouteMode(false); }}
                            className={`flex-1 px-2 py-1.5 rounded-[8px] border text-[12px] font-black ${!routeMode
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted hover:border-info'}`}>
                            🔷 동선
                        </button>
                    </div>
                    {!routeMode && confirmed.length > 0 && (
                        <p className="text-[10px] text-text-muted leading-snug">
                            🔒 콜을 쥔 동안은 노선으로 못 갑니다 — 새 길은 잡아둔 콜의 경로를 모릅니다. 콜을 다 비우면 열립니다
                        </p>
                    )}

                    {/* 🎯 목적지 — 복귀행에서도 산다: 주 마름모의 끝점이다 (두 마름모) */}
                    <label className="flex flex-col gap-0.5 text-[10.5px] font-bold text-text-muted">
                        🎯 목적지
                        <select value={dstIdx} onChange={e => setDstIdx(Number(e.target.value))}
                            className="px-2 py-1 rounded-[6px] border border-border-hover bg-background text-[13px] font-black text-text-primary">
                            {DESTS.map((d, i) => <option key={d.name} value={i}>{d.name}</option>)}
                        </select>
                    </label>

                    {routeMode ? (
                        <>
                            <NumRow label="경유 폭㎞" value={detourWidthKm} onChange={setDetourWidthKm} min={1} max={30} />
                            <NumRow label="현위치반경㎞" value={ps.pickupRadiusKm} onChange={v => patchPhase(phase, { pickupRadiusKm: v })} max={60} />
                            <NumRow label="목적지반경㎞" value={ps.dropoffRadiusKm} onChange={v => patchPhase(phase, { dropoffRadiusKm: v })} max={60} />
                            {/* 카카오 실시간 — 어느 목적지든, 원점은 내 위치, 옵션 전부 병합 없이 */}
                            <button type="button" onClick={searchRoads}
                                className="px-2.5 py-1.5 rounded-[8px] border border-info/55 bg-info/10 text-info text-left text-[11.5px] font-black">
                                🔍 길 찾기 (카카오 실시간){destRoads ? ` — ${destRoads.length}개` : ''}
                            </button>
                            {roadSearched && !destRoads && (
                                <p className="text-[10.5px] text-text-muted font-bold">⏳ 카카오 호출 중…</p>
                            )}
                            {destRoads && destRoads.length === 0 && (
                                <p className="text-[10.5px] text-warning font-bold leading-snug">후보를 못 받았습니다 — 서버 로그를 봐 주세요</p>
                            )}
                            {destRoads && destRoads.map((r, i) => (
                                <button key={`${r.option ?? ''}${r.name}${i}`} type="button" onClick={() => setRoadIdx(i)}
                                    className={`px-2.5 py-1.5 rounded-[8px] border text-left text-[11px] font-black ${roadIdx === i
                                        ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background hover:border-info'}`}>
                                    {r.option && <span className="text-[9.5px] px-1 py-px rounded bg-warning/15 text-warning mr-1">{r.option}</span>}
                                    {r.name}<br />
                                    <span className="text-[10px] font-bold text-text-muted">
                                        {r.distKm}km · {r.durMin}분{r.tollWon != null ? ` · 톨 ${r.tollWon.toLocaleString()}원` : ''}
                                    </span>
                                </button>
                            ))}
                            {road && (
                                <p className="text-[10.5px] text-text-muted leading-snug">
                                    ✅ 이 길 ±{detourWidthKm}km 의 <b className="text-text-primary">{areaNet.count}동</b>이 필터
                                </p>
                            )}
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                            <NumRow label="출발각°" value={knobs.srcAngleDeg} max={170} onChange={v => setKnobs({ ...knobs, srcAngleDeg: v })} />
                            <NumRow label="목적각°" value={knobs.dstAngleDeg} max={170} onChange={v => setKnobs({ ...knobs, dstAngleDeg: v })} />
                            <NumRow label="현위㎞" value={ps.pickupRadiusKm} max={60} onChange={v => patchPhase(phase, { pickupRadiusKm: v })} />
                            <NumRow label="목적㎞" value={ps.dropoffRadiusKm} max={60} onChange={v => patchPhase(phase, { dropoffRadiusKm: v })} />
                        </div>
                    )}

                    {/* ⛔ 제외지역 — 동선에서만 (기사님 2026-09-08: 노선은 길이 곧 선별이라 필요 없다) */}
                    {!routeMode && <div className="mt-1 border-t border-border-card pt-2 flex flex-col gap-1">
                        <span className="text-[10.5px] font-black text-danger">⛔ 제외지역</span>
                        <select value="" onChange={e => { const v = e.target.value; if (v) setExcluded(x => x.includes(v) ? x : [...x, v]); }}
                            className="w-full px-2 py-1 rounded-[7px] border border-border-hover bg-background text-[11px] font-bold">
                            <option value="">제외할 지역 고르기…</option>
                            {areaNet.groups.map(g => (
                                <optgroup key={g.region} label={g.region}>
                                    <option value={`R|${g.region}`}>◼ {g.region} 전체 ({g.names.length}동)</option>
                                    {g.names.map(n => <option key={n} value={`D|${g.region}|${n}`}>{n}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        {excluded.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {excluded.map(k => (
                                    <button key={k} type="button" onClick={() => setExcluded(x => x.filter(v => v !== k))}
                                        title="누르면 되살립니다"
                                        className="px-1.5 py-0.5 rounded-md bg-danger/15 text-danger text-[10.5px] font-black">
                                        ⛔ {k.startsWith('R|') ? `${k.slice(2)} 전체` : k.split('|')[2]} ✕
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>}

                    {/* 🧪 판정 — 필터와 콜 리스트 사이 (기사님 2026-09-07 와이어프레임 확정) */}
                    {/* 🔴 두 층은 완전히 격리되어 각각 따로 작동한다 (규칙: 필터=집기 전 · 심사=집은 뒤).
                        기사님 2026-09-08: *"판정영역을 상하로 나눠서 상은 필터가 하는 일, 하는 심사가 하는 일"* */}
                    <FilterPanel tone="filter" title={`🔍 ① 콜 필터 — 집기 전 · 앱이 하는 일 · 그물 ${areaNet.count}동${roadMode && road ? ' · 길' : ''}`}>
                        {localMode && (
                            <div className="px-2 py-1 rounded-lg bg-info/15 text-info text-[11px] font-black">
                                🏘️ 관내 — 방향 안 봄, 둘 다 원 안만
                            </div>
                        )}
                        {!verdict && <p className="text-[10.5px] text-text-muted leading-snug">지도 두 번 클릭으로 콜을 만들면 여기 판정 — 1단계(영역) 뒤 2단계(거리)</p>}
                        {verdict && (
                            <div className="flex flex-col gap-1">
                                <div className="text-[11px]">▲ <b>{verdict.pickupDong.region} {verdict.pickupDong.name}</b> → ▼ <b>{verdict.dropDong.region} {verdict.dropDong.name}</b></div>
                                {/* 찍은 좌표 — 화면만 보고 그대로 재현·검산할 수 있게 (기사님 제안 2026-09-08) */}
                                {pickup && drop && (
                                    <div className="text-[9.5px] font-mono text-text-muted tabular-nums leading-tight">
                                        ▲{pickup.lng.toFixed(5)},{pickup.lat.toFixed(5)} ▼{drop.lng.toFixed(5)},{drop.lat.toFixed(5)} 📍{myPos.lng.toFixed(5)},{myPos.lat.toFixed(5)}
                                    </div>
                                )}
                                <span className={`self-start px-2 py-0.5 rounded-lg text-[12px] font-black ${finalPass ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                    {finalPass ? '✅ 올린다 (필터 통과)' : exclusionHit ? '⛔ 제외지역 — 안 올린다' : '❌ 안 올린다'}
                                </span>
                                {goalsVerdict && goalsVerdict.results.length > 1 && (
                                    <div className="flex gap-1 flex-wrap items-center">
                                        {goalsVerdict.results.map(r => (
                                            <Chip key={r.goal.name} ok={r.verdict.pass} yes={`${r.goal.name} 안`} no={`${r.goal.name} 밖`} />
                                        ))}
                                        {goalsVerdict.wonGoal && (
                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-warning/15 text-warning">
                                                판 {goalsVerdict.wonGoal.name}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {exclusionHit && (
                                    <div className="text-[10.5px] text-danger font-bold leading-snug">
                                        ⛔ {exclusionHit} — 제외한 동입니다. 필터에 안 실려 실전에선 이 콜이 안 올라옵니다.
                                    </div>
                                )}
                                <div className="text-[10px] font-black text-text-muted">1단계 · 영역</div>
                                {localMode ? (
                                    <div className="flex gap-1 flex-wrap">
                                        <Chip ok={verdict.pickupNearMe} yes="상차 원 안" no="상차 원 밖" />
                                        <Chip ok={verdict.dropInNet} yes="하차 원 안" no="하차 원 밖" />
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-1 flex-wrap">
                                            <Chip ok={verdict.dropInNet} yes="하차 그물 안" no="하차 그물 밖" />
                                            <Chip ok={verdict.pickupNearMe} yes="상차 반경 안" no="상차 반경 밖" />
                                            {isLoaded(goalsVerdict?.wonGoal?.name ?? dst.name) &&
                                                <Chip ok={verdict.pickupInNet} yes={roadMode ? '상차 경유 띠 안' : '상차 사각형 안'} no={roadMode ? '상차 경유 띠 밖' : '상차 사각형 밖(뒤)'} />}
                                        </div>
                                        <div className="text-[10px] font-black text-text-muted">2단계 · 거리(방향)</div>
                                        <div className="font-black tabular-nums text-[12.5px]">{verdict.distPickKm} : {verdict.distDropKm} : {verdict.distMeKm}
                                            <span className="text-[10px] text-text-muted font-bold"> (상차:하차:현위치→목적지)</span></div>
                                        <div className="flex gap-1 flex-wrap">
                                            <Chip ok={!verdict.dropBackward} yes="하차 전진" no="하차 역주행" />
                                            <Chip ok={!verdict.pickupBackward} yes="상차 앞" no="상차 역주행" />
                                        </div>
                                    </>
                                )}
                                {/* 🪜 스텝 1 — 앱이 «올린다». 이걸 눌러야 서버(심사)가 깨어난다 (실물 그대로) */}
                                {!uploaded ? (
                                    <button type="button"
                                        onClick={uploadCall}
                                        className={`self-start px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${finalPass
                                            ? 'border-info/55 bg-info/15 text-info' : 'border-warning/55 bg-warning/10 text-warning'}`}>
                                        {finalPass ? '⬆️ 필터 통과 — 서버로 올린다' : '⚠️ 탈락인데 올려 보기'}
                                    </button>
                                ) : (
                                    <span className="self-start px-2 py-0.5 rounded-md text-[11px] font-black bg-info/15 text-info">
                                        ⬆️ 올렸다 — 서버가 심사 중
                                    </span>
                                )}
                            </div>
                        )}
                    </FilterPanel>

                    <div className="flex items-center gap-1.5 my-0.5">
                        <span className="flex-1 h-px bg-border-card" />
                        <span className="text-[9.5px] font-black text-text-muted">🔒 두 층은 서로 남남 — 따로 작동합니다</span>
                        <span className="flex-1 h-px bg-border-card" />
                    </div>

                    {/* ⚖️ ② 심사 — 집은 뒤 (서버). 필터와 **완전히 격리**되어 따로 작동한다.
                        실물은 안전취소 30초 안에 색(🔵🟢🟡🔴)을 낸다 — 여기는 그 재료를 보여준다 */}
                    <FilterPanel tone="judge" title={`⚖️ ② 심사 — 집은 뒤 · 서버가 하는 일${safeCancelLeft !== null ? ` · ⏱️ ${safeCancelLeft}초` : ''}`}>
                        {!verdict && <p className="text-[10.5px] text-text-muted leading-snug">콜을 집으면 여기서 심사 — 판정 기준 다섯이 색을 낸다</p>}
                        {verdict && !uploaded && (
                            <p className="text-[10.5px] text-text-muted leading-snug">
                                🔒 아직 안 올라온 콜입니다 — 위에서 <b>필터 통과</b>를 눌러야 서버가 봅니다
                            </p>
                        )}
                        {verdict && uploaded && (
                            <div className="flex flex-col gap-1.5">

                                {/* ══ ① 후보콜에 대한 보유정보 — 지금 아는 것을 다 편다 ══ */}
                                <div className="text-[10px] font-black text-info">① 후보콜에 대한 보유정보</div>
                                <div className="rounded-[8px] border border-border-card bg-background px-2 py-1 text-[10.5px] leading-snug">
                                    <div className="font-black text-[11px]">
                                        {circled(baseCallCount + confirmed.length + 1)} 심사 중 —{' '}
                                        {verdict.pickupDong.region} {verdict.pickupDong.name} → {verdict.dropDong.region} {verdict.dropDong.name}
                                    </div>
                                    <div className="text-text-muted tabular-nums">
                                        판 <b className="text-text-primary">{goalsVerdict?.wonGoal?.name ?? dst.name}</b>
                                        {' · 국면 '}<b className="text-text-primary">{PHASE_LABEL[phase]}</b>
                                        {uploadedInfoRef.current?.distKm != null && <>
                                            {' · 이 콜만 '}<b className="text-text-primary">{uploadedInfoRef.current.distKm}km · {uploadedInfoRef.current.durMin ?? '?'}분</b>
                                            {uploadedInfoRef.current.tollWon != null && ` · 톨 ${uploadedInfoRef.current.tollWon.toLocaleString()}원`}
                                        </>}
                                    </div>
                                    <div className="text-text-muted tabular-nums">
                                        목적지까지 <b className="text-text-primary">상차 {verdict.distPickKm}km · 하차 {verdict.distDropKm}km · 나 {verdict.distMeKm}km</b>
                                        {' — '}{verdict.distDropKm < verdict.distPickKm ? '하차가 목적지에 더 가깝다(전진)' : '하차가 상차보다 멀다(역주행)'}
                                    </div>
                                    {approachInfo && (
                                        <div className="tabular-nums">
                                            🚚 상차지까지 <b className="text-info">{approachInfo.distKm}km · {approachInfo.durMin ?? '?'}분</b>
                                            {approachInfo.failed && <b className="text-danger"> (못 쟀다 — 도로 탐색 불가)</b>}
                                            {approachInfo.durMin != null && (
                                                <> → 도착 <b className="text-info">{new Date(clockNow + approachInfo.durMin * 60000).toTimeString().slice(0, 5)}</b>
                                                <span className="text-text-muted"> (지금 출발 기준 · 통화로 확정)</span></>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* 어디서 받아온 값인가 — 누르면 보낸 값·받은 값 전문 */}
                                {uploadTag && apiLog.some(l => l.tag === uploadTag) && (
                                    <div className="flex flex-col gap-0.5">
                                        {apiLog.map((l, i) => ({ l, i })).filter(({ l }) => l.tag === uploadTag).map(({ l, i }) => (
                                            <button key={i} type="button" onClick={() => setApiPeek(i)}
                                                className={`text-left rounded-md border px-1.5 py-1 text-[10px] leading-snug ${l.ok ? 'border-border-card' : 'border-danger/55 bg-danger/10'}`}>
                                                <div className="font-black">🛰️ {l.ok ? '✅' : '❌'} {l.who} <span className="font-bold text-text-muted">{l.path} · {l.ms}ms · {l.t}</span></div>
                                                <div className="text-text-muted">↗ {l.req}</div>
                                                <div className="text-text-muted">↙ {l.res}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* ══ ② 후보콜에 대한 추가정보 요청 — 없는 것을 «없다»고 적는다 ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1.5">② 후보콜에 대한 추가정보 요청</div>
                                <div className="text-[10px] text-text-muted leading-snug">아직 못 재는 기준 — 콜에 그 재료가 없다 (지어내지 않는다). 통화로 확정한다</div>
                                <div className="flex gap-1 flex-wrap text-[10.5px]">
                                    {(['💰 돈(요금)', '📦 공간(박스)', '🧪 성질(화물)'] as const).map(t => (
                                        <span key={t} className="px-1.5 py-0.5 rounded-md bg-background border border-border-card text-text-muted font-bold">{t} —</span>
                                    ))}
                                </div>
                                {TRAP_DONGS.filter(t => t.dong === verdict.dropDong.name).map(t => (
                                    <div key={t.dong} className="text-[10.5px] text-danger font-bold leading-snug">
                                        ⛔ 가면 안 되는 지역 — {t.region} {t.dong}: {t.why}
                                        <span className="text-text-muted font-normal"> (필터는 안 자름 — 기사님 몫)</span>
                                    </div>
                                ))}

                                {/* ══ ③ 후보콜이 미치는 영향 — 콜 하나가 한 덩어리 (좌우 비교 폐기) ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1.5">③ 후보콜이 미치는 영향</div>
                                {callImpacts.length === 0
                                    ? <div className="text-[10px] text-text-muted">아직 전체 경로를 못 받았다</div>
                                    : <div className="flex flex-col gap-1">
                                        {callImpacts.map(ci => (
                                            <div key={ci.no} className={`rounded-md border p-1.5 text-[10px] tabular-nums flex flex-col gap-0.5 ${ci.isNew ? 'border-info/50 bg-info/[0.06]' : 'border-border-card'}`}>
                                                <div className="font-black text-[10.5px]">
                                                    {ci.disp} {ci.isNew ? '이 후보콜' : ci.no === '①' ? '첫짐' : `합짐${Number(ci.no.charCodeAt(0) - 0x2460)}`}
                                                    <span className="font-bold text-text-muted"> · {ci.where}</span>
                                                </div>
                                                {ci.stops.map(st => {
                                                    const hhmm = (t: number) => new Date(t).toTimeString().slice(0, 5);
                                                    // 실제로 지났으면 그것이 답, 아직이면 전체 경로가 말하는 예상
                                                    const real = st.passedAt ?? st.etaAt;
                                                    const late = real != null && st.promisedAt != null
                                                        ? Math.round((real - st.promisedAt) / 60000) : null;
                                                    return (
                                                        <div key={st.kind} className="flex flex-col">
                                                            {/* 🔴 값이 없어도 줄은 남긴다 — 없으면 «--» 로 비교할 수 있게 */}
                                                            <div className="flex justify-between gap-1 text-text-muted">
                                                                <span>{st.leg ? `${st.leg.from} → ${st.leg.to}` : `? → ${st.label}`}</span>
                                                                <span className="shrink-0">
                                                                    {st.leg?.distKm ?? '--'}km · {st.leg?.durMin ?? '--'}분
                                                                    {st.fromSaved && <span className="text-[9px]"> (저장)</span>}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between gap-1 font-bold">
                                                                <span>{st.kind} 도착</span>
                                                                <span>
                                                                    <span className="text-text-muted">{st.promisedAt != null ? hhmm(st.promisedAt) : '--:--'} → </span>
                                                                    <b className={late != null && late > 0 ? 'text-warning' : 'text-success'}>
                                                                        {real != null ? hhmm(real) : '--:--'}</b>
                                                                    {st.passedAt != null && <span className="text-success text-[9px]"> 통과</span>}
                                                                    {late != null && (late > 0
                                                                        ? <b className="text-warning"> ({late}분 늦어짐)</b>
                                                                        : late < 0 ? <b className="text-success"> ({-late}분 빨라짐)</b>
                                                                        : <span className="text-text-muted"> (그대로)</span>)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                        <div className="flex justify-between gap-1 text-[10px] font-black tabular-nums border-t border-border-card pt-1">
                                            <span>전체</span>
                                            <span>
                                                <span className="text-text-muted">{chainBefore?.totalKm ?? '--'}km · {chainBefore?.totalMin ?? '--'}분 → </span>
                                                {chainNow?.totalKm ?? '--'}km · {chainNow?.totalMin ?? '--'}분
                                            </span>
                                        </div>
                                        <div className="text-[9.5px] text-text-muted leading-snug">
                                            앞 시각 = <b>최초 약속</b>(그 콜을 확정한 순간 못 박은 것 — 안 바뀐다) · 뒤 = 이 콜을 받으면 될 시각.
                                            합짐을 얹을수록 «늦어짐»은 이 약속을 기준으로 쌓인다. 주행만 셈 (상하차 정차는 아직 안 넣었다)
                                        </div>
                                    </div>}

                                {/* ══ ④ 후보콜에 대한 심사 결론 — 잡을지 말지의 답 ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1.5">④ 후보콜에 대한 심사 결론</div>
                                {(() => {
                                    /**
                                     * 🔴 **모르면 «안 밀린다»고 하지 않는다** (기사님 2026-09-09:
                                     * *"'기존 콜은 안 밀린다'가 아니고 모른다, 카카오가 값을 잘못 줬다
                                     * … 이렇게 표시하던가 해야 하는 거지"*).
                                     *
                                     * 못 잰 구간이 하나라도 있으면 뒤 정거장의 도착을 **아무도 모른다.**
                                     * 그런데 «안 밀린다»는 초록으로 뜬다 — 기사님은 색만 보고 1~2초에 누르신다
                                     * (규칙 ⑤-3). 모르는 것을 초록으로 칠하는 것이 이 시스템의 가장 큰 사고다.
                                     */
                                    const failed = (chainNow?.legs ?? []).filter(l => l.failed || l.durMin == null);
                                    if (!chainNow || failed.length > 0 || chainNow.note) return (
                                        <div className="rounded-[8px] border border-danger/50 bg-danger/[0.08] px-2 py-1 text-[11.5px] font-black leading-snug">
                                            ❓ <b className="text-danger">모른다 — 못 잰 구간이 있다</b>
                                            {failed.length > 0 && (
                                                <div className="text-[10.5px] font-bold text-text-muted">
                                                    못 잰 구간: {failed.map(l => `${l.from} → ${l.to}`).join(' · ')}
                                                </div>
                                            )}
                                            {chainNow?.note && <div className="text-[10.5px] font-bold text-text-muted">받은 값: {chainNow.note}</div>}
                                            {!chainNow && <div className="text-[10.5px] font-bold text-text-muted">전체 경로를 아직 못 받았다</div>}
                                            <div className="text-[10px] font-bold text-text-muted">기존 콜이 밀리는지 판단할 수 없다 — 잡으시려면 통화로 시간을 확인하십시오</div>
                                        </div>
                                    );
                                    const worst = stopImpacts.reduce((w, r) => (r.delayMin > (w?.delayMin ?? -Infinity) ? r : w), null as typeof stopImpacts[number] | null);
                                    return (
                                        <div className="rounded-[8px] border border-warning/45 bg-warning/[0.07] px-2 py-1 text-[11.5px] font-black leading-snug">
                                            {worst && worst.delayMin > 0
                                                ? <>⚠️ 기존 콜 <b className="text-warning">{worst.stop}가 {worst.delayMin}분 늦어진다</b> — 약속 시각과 대보고 정한다</>
                                                : <>✅ 기존 콜은 <b className="text-success">안 밀린다</b></>}
                                        </div>
                                    );
                                })()}
                                {detourRows.length > 0 && (
                                    <div className="flex flex-col gap-0.5 text-[10.5px] tabular-nums">
                                        {detourRows.map(r => (
                                            <div key={r.name} className="flex justify-between gap-1">
                                                <span className="font-black">{r.name}</span>
                                                <span>
                                                    <b className={r.min > 0 ? 'text-warning' : 'text-success'}>{r.min > 0 ? '+' : ''}{r.min}분</b>
                                                    <span className="text-text-muted font-normal"> ({r.how})</span>
                                                    {r.budget && (r.budget.usedAt <= r.budget.limitAt
                                                        ? <b className="text-success"> · 시한 {new Date(r.budget.limitAt).toTimeString().slice(0, 5)} 안 ✅ 전화 불필요</b>
                                                        : <b className="text-danger"> · 시한 {new Date(r.budget.limitAt).toTimeString().slice(0, 5)} 초과 ☎️ 시간을 물려야 한다</b>)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ══ ⑤ 후보콜에 대한 기사 선택 — 결재는 기사님이 한다 (규칙 ①) ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1.5">⑤ 후보콜에 대한 기사 선택</div>
                                <div className="flex gap-1.5 flex-wrap">
                                    <button type="button"
                                        onClick={() => { if (pickup && drop) { pushLog('확정'); confirmCall(pickup, drop); setPickup(null); setDrop(null); resumeAfterCall(); } }}
                                        className={`px-2 py-1.5 rounded-[8px] border text-[11px] font-black ${finalPass
                                            ? 'border-success/55 bg-success/10 text-success' : 'border-warning/55 bg-warning/10 text-warning'}`}>
                                        {finalPass ? '✅ 콜 확정' : '⚠️ 탈락이지만 확정'}
                                    </button>
                                    <button type="button" onClick={() => { pushLog('버림'); setPickup(null); setDrop(null); resumeAfterCall(); }}
                                        className="px-2 py-1.5 rounded-[8px] border border-border-hover bg-background text-[11px] font-black hover:border-danger">
                                        🧹 버림
                                    </button>
                                </div>
                            </div>
                        )}
                    </FilterPanel>

                    {/* 📋 콜 리스트 — 왼쪽 사이드바 맨 아래 딱 붙임 (기사님 2026-09-07: mt-auto) + 방문 순서 */}
                    <FilterPanel title={
                        <button type="button" onClick={() => setCallsPeek(true)} className="text-left hover:underline">
                            📋 콜 리스트{confirmed.length ? ` — ${confirmed.length}` : ''}
                            <span className="font-bold text-text-muted"> · 눌러서 저장값 전부 보기</span>
                        </button>
                    }>
                        {confirmed.length === 0 && <p className="text-[10.5px] text-text-muted">확정한 콜이 여기 쌓입니다</p>}
                        {confirmed.length > 0 && (
                            <p className="text-[9.5px] text-text-muted leading-snug">
                                괄호 = (이동분 · 밀림 · <b>약속</b> · <b className="text-info">예정</b> · <b className="text-success">통과</b>) —
                                약속은 확정 순간에 못 박고, 예정은 지금 전체 경로, 통과는 GPS 로 실제 지난 시각
                            </p>
                        )}
                        {confirmed.length > 0 && (
                            <>
                                {/* 콜 = 한 덩어리 카드: 윗줄 상차→하차 · 아랫줄 거리·시간·톨비 (기사님 2026-09-08) */}
                                <ol className="flex flex-col gap-1 text-[11px]">
                                    {confirmed.map((c, i) => {
                                        const n = baseCallCount + i + 1;
                                        const color = CALL_COLORS[(n - 1) % CALL_COLORS.length];
                                        return (
                                            <li key={c.id} className="rounded-[8px] border border-border-card bg-background px-1.5 py-1 flex flex-col gap-0.5">
                                                <span className="flex items-start gap-1.5 min-w-0 flex-wrap">
                                                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: color }} />
                                                    <b className="shrink-0">{circled(n)}</b>
                                                    {/* 정거장마다 다섯 값 — 이동·밀림·약속·예정·통과 (기사님 2026-09-08) */}
                                                    {([['상차', c.pickup], ['하차', c.drop]] as const).map(([kind, pt], k) => {
                                                        const clock = stopClock.get(`${circled(n)}${kind}`);
                                                        const hhmm = (t: number | null | undefined) =>
                                                            t != null ? new Date(t).toTimeString().slice(0, 5) : '--:--';
                                                        return (
                                                            <span key={kind} className="font-black">
                                                                {k > 0 && <span className="text-text-muted font-bold"> → </span>}
                                                                {/* 🔢 앞 숫자는 «몇 번째로 들르나» — 상차/하차 표시가 아니다 (기사님 2026-09-09) */}
                                                                {clock?.seq ? circled(clock.seq) : '·'}{nearestDong(pt).name}
                                                                <span className="font-bold text-text-muted tabular-nums">
                                                                    {' ('}{clock?.legMin ?? '--'}분
                                                                    {clock?.delayMin != null && clock.delayMin !== 0
                                                                        ? <b className={clock.delayMin > 0 ? 'text-warning' : 'text-success'}>
                                                                            {' '}{clock.delayMin > 0 ? '+' : '−'}{Math.abs(clock.delayMin)}분</b>
                                                                        : ' -0분'}
                                                                    {' '}{hhmm(clock?.promisedAt)}
                                                                    {' '}<b className={clock?.etaAt ? 'text-info' : ''}>{hhmm(clock?.etaAt)}</b>
                                                                    {' '}<b className={clock?.passedAt ? 'text-success' : ''}>{hhmm(clock?.passedAt)}</b>
                                                                    {')'}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                    <span className="shrink-0 text-[9.5px] px-1 rounded bg-info/15 text-info font-black">🎯 {c.destName.replace(' 시내', '')}</span>
                                                </span>
                                                <span className="pl-4 text-[10.5px] font-bold text-text-muted tabular-nums">
                                                    {c.approachKm != null && <>상차지까지 <b className="text-info">{c.approachKm}km · {c.approachMin ?? '--'}분</b> · 배송 </>}
                                                    {c.routeComputedAt == null ? '⏳ 실측 중…'
                                                        : c.distKm == null ? '❌ 못 쟀다 (도로 탐색 불가) — 통화로 확인'
                                                        : <>{c.distKm}km · {c.durMin}분 · 톨 {(c.tollWon ?? 0).toLocaleString()}원 <span className="font-normal">· 카카오 {c.optionUsed ?? '추천'}</span></>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                                <button type="button" onClick={() => setConfirmed(confirmed.slice(0, -1))}
                                    className="self-start px-2 py-1 rounded-[8px] border border-border-hover bg-surface text-[10.5px] font-black hover:border-danger">
                                    ↩️ 마지막 콜 취소
                                </button>
                            </>
                        )}
                        {effPath.length > 1 && (
                            <ol className="mt-1 flex flex-col gap-0.5 text-[10.5px] border-t border-border-card pt-1">
                                <span className="font-black text-text-muted">🧭 방문 순서</span>
                                {effPath.slice(1).map(p => (
                                    <li key={p.seq} className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${driving && p.seq === targetSeq ? 'bg-info/15' : ''}`}>
                                        <span className="shrink-0 rounded-full grid place-items-center text-[9.5px] font-black text-white" style={{ background: p.color ?? '#111827', width: 16, height: 16 }}>{p.seq}</span>
                                        <span className="min-w-0 truncate">{p.label}</span>
                                        {driving && p.seq === targetSeq && <span className="shrink-0 text-info font-black text-[10px]">▶</span>}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </FilterPanel>
                </aside>

                {/* 🗺️ 지도 */}
                <div ref={boxRef} className="relative flex-1 min-h-0">
                <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: size.h, cursor: 'crosshair', display: 'block' }}
                    onClick={onMapClick}
                    onMouseDown={e => { dragRef.current = { sx: e.clientX, sy: e.clientY, moved: false, down: true }; }}
                    onMouseMove={e => {
                        const d = dragRef.current;
                        if (!d.down || !(e.buttons & 1)) return;
                        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
                        if (!d.moved && Math.hypot(dx, dy) < 5) return;
                        d.moved = true; d.sx = e.clientX; d.sy = e.clientY;
                        panBy(dx, dy);
                    }}
                    onMouseUp={() => { dragRef.current.down = false; }} />
                {/* 🔍 줌 조작 — 드래그·휠로도 된다. ⌖ 는 자동 맞춤 복귀 */}
                <div className="absolute right-3 top-3 flex flex-col gap-1.5">
                    {([['➕', 1], ['➖', -1]] as const).map(([label, d]) => (
                        <button key={label} type="button"
                            onClick={() => zoomAt(size.w / 2, size.h / 2, d)}
                            className="w-9 h-9 rounded-lg border border-border-hover bg-surface text-[15px] font-black shadow">{label}</button>
                    ))}
                    <button type="button" title="자동 맞춤으로"
                        onClick={() => setView(v => ({ ...v, manual: false }))}
                        className={`w-9 h-9 rounded-lg border text-[15px] font-black shadow ${view.manual ? 'border-info/55 bg-info/15 text-info' : 'border-border-hover bg-surface'}`}>⌖</button>
                </div>
                </div>

                {/* 🎛️ 오른쪽 — 필터 옵션 (기사님 2026-09-07 와이어프레임: 실물 요소만 · 값은 목업 ·
                    왼쪽과 같은 부품(FilterPanel/NumRow/TextRow)으로 조립 — 실물로 들고 가기 쉽게) */}
                <aside className="w-[400px] shrink-0 border-l border-border-card bg-surface p-3 flex flex-col gap-2 overflow-y-auto">
                    <span className="text-[12px] font-black">🎛️ 필터 옵션 <span className="text-[10px] font-bold text-text-muted">실물 요소 · 값은 목업</span></span>

                    {/* 📅 국면 5탭 (기사님 2026-09-08 «첫짐~복귀가 옵션에 필요») — 실물 필터 설정 모달의 그 탭.
                        국면마다 설정 한 벌(user_filter_phases 행)이고, ● = 지금 활성 국면(자동 파생) */}
                    <div className="flex gap-1">
                        {PHASE_KEYS.map(k => (
                            <button key={k} type="button" onClick={() => setPhaseTab(k)}
                                className={`flex-1 px-1 py-1.5 rounded-[8px] border text-[10.5px] font-black ${phaseTab === k
                                    ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                                {PHASE_LABEL[k]}{phase === k && <span className="text-success"> ●</span>}
                            </button>
                        ))}
                    </div>
                    {phaseTab !== phase && (
                        <p className="text-[10px] text-warning font-bold leading-snug">
                            ✍️ {PHASE_LABEL[phaseTab]} 벌을 미리 고치는 중 — 지금 판은 ● {PHASE_LABEL[phase]} 벌로 돕니다
                        </p>
                    )}

                    <FilterPanel title={`🎚️ ${PHASE_LABEL[phaseTab]} 옵션 (user_filter_phases 한 벌)`}>
                        <TextRow label={fieldLabel(phaseTab, 'destinationCity')} value={dst.name}
                            mode={PHASE_FIELDS[phaseTab].destinationCity} autoWhy={PHASE_AUTO_SOURCE[phaseTab]}
                            hint="← 왼쪽 🎯 목적지" />
                        <NumRow label={fieldLabel(phaseTab, 'pickupRadiusKm')} value={phaseSettings[phaseTab].pickupRadiusKm}
                            mode={PHASE_FIELDS[phaseTab].pickupRadiusKm}
                            onChange={v => patchPhase(phaseTab, { pickupRadiusKm: v })} max={100} />
                        {PHASE_FIELDS[phaseTab].pickupRadiusKm !== 'hidden' && (
                            <p className="text-[10px] text-text-muted leading-snug">
                                실물은 도달 시간에서 자동 — 상차 약속(잡은 시각+20분)에 닿는 거리 ≈ <b>{reachRadiusKm(20)}km</b> (잠정 계수 · 아직 안 거름)
                            </p>
                        )}
                        <NumRow label={fieldLabel(phaseTab, 'detourAllowKm')} value={phaseSettings[phaseTab].detourAllowKm}
                            mode={PHASE_FIELDS[phaseTab].detourAllowKm} onChange={v => patchPhase(phaseTab, { detourAllowKm: v })} max={200} />
                        <NumRow label={fieldLabel(phaseTab, 'dropoffRadiusKm')} value={phaseSettings[phaseTab].dropoffRadiusKm}
                            mode={PHASE_FIELDS[phaseTab].dropoffRadiusKm}
                            onChange={v => patchPhase(phaseTab, { dropoffRadiusKm: v })} max={100} />
                    </FilterPanel>

                    {PHASE_FIELDS[phaseTab].discountPct !== 'hidden' && (
                        <FilterPanel title={`💰 콜할인율 (${PHASE_LABEL[phaseTab]}) — 시세 대비 허용 할인`}>
                            <div className="flex gap-1">
                                {([['시세', 0], ['-10%', 10], ['-20%', 20], ['-30%', 30]] as const).map(([label, v]) => (
                                    <button key={v} type="button" onClick={() => patchPhase(phaseTab, { discountPct: v })}
                                        className={`flex-1 px-1 py-1.5 rounded-[8px] border text-[11px] font-black ${phaseSettings[phaseTab].discountPct === v
                                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {/* 하한 단가표 — shared 폴백 시세(rateFloorsFrom)에서 파생. 실물은 같은 함수를 DB 요율로 부른다 */}
                            <div className="flex flex-col gap-0.5 text-[10.5px] tabular-nums">
                                {Object.entries(NET_RATE_PER_KM).map(([v, net_]) => (
                                    <div key={v} className="flex justify-between gap-1">
                                        <span><b>{v}</b> <span className="text-text-muted">시세 {net_}원/km · 짐 {VEHICLE_CAPACITY[v] ?? '?'}박스</span></span>
                                        <b className="text-info">≥ {rateFloorsFrom(phaseSettings[phaseTab].discountPct)[v]}원/km</b>
                                    </div>
                                ))}
                            </div>
                        </FilterPanel>
                    )}

                    <FilterPanel title="🚚 차종 (allowedVehicleTypes)">
                        <ChipToggleRow options={['1t', '1t짐', '라보', '다마스']} selected={vehicles}
                            onToggle={v => setVehicles(x => x.includes(v) ? x.filter(o => o !== v) : [...x, v])} />
                    </FilterPanel>

                    <FilterPanel title="🚫 제외 단어 (excludedKeywords)">
                        <ChipToggleRow options={['착불', '수거', '까대기', '직접운반']} selected={excludedWords}
                            onToggle={v => setExcludedWords(x => x.includes(v) ? x.filter(o => o !== v) : [...x, v])} />
                    </FilterPanel>

                    <FilterPanel title={`🧊 적재 ${slotsUsed}/${TRUCK_CAPACITY_SLOTS}박스 · 남은 ${TRUCK_CAPACITY_SLOTS - slotsUsed}`}>
                        <div className="h-2 rounded bg-background border border-border-card overflow-hidden">
                            <div className="h-full bg-info/60" style={{ width: `${Math.min(100, slotsUsed / TRUCK_CAPACITY_SLOTS * 100)}%` }} />
                        </div>
                        <div className="flex items-end gap-1.5">
                            <div className="flex-1"><NumRow label="쓴 박스 수" value={slotsUsed} onChange={v => { setSlotsUsed(v); setCapacityConfirmed(false); }} max={TRUCK_CAPACITY_SLOTS} /></div>
                            <button type="button" onClick={() => setCapacityConfirmed(!capacityConfirmed)}
                                className={`px-2 py-1.5 rounded-[8px] border text-[11px] font-black ${capacityConfirmed
                                    ? 'bg-success/15 border-success/55 text-success' : 'border-border-hover bg-background text-text-muted'}`}>
                                {CAPACITY_CONFIDENCE_LABEL[capacityConfirmed ? 'CONFIRMED' : 'ESTIMATED']}
                            </button>
                        </div>
                    </FilterPanel>

                    <details className="border-t border-border-card pt-2">
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">🗂️ 영역 — 시군구별 {areaNet.count}동</summary>
                        <div className="mt-1 flex flex-col gap-1 text-[10.5px] leading-snug">
                            {areaNet.groups.map(g => {
                                const regionOut = excluded.includes(`R|${g.region}`);
                                return (
                                    <div key={g.region}>
                                        <b className={regionOut ? 'line-through text-text-muted' : ''}>{g.region} {g.names.length}</b>{' — '}
                                        {g.names.map((n, i) => (
                                            <span key={n} className={regionOut || isExcluded(g.region, n) ? 'line-through text-text-muted' : ''}>
                                                {n}{i < g.names.length - 1 ? ' · ' : ''}
                                            </span>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </details>

                    {logs.length > 0 && (
                        <details className="border-t border-border-card pt-2" open>
                            <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">📜 판정 기록 — {logs.length}</summary>
                            <button type="button" onClick={() => setLogs([])}
                                className="mt-1 text-[10px] font-black text-text-muted hover:text-danger">비우기</button>
                            <ol className="mt-1 flex flex-col gap-0.5 text-[10.5px] leading-snug">
                                {logs.map((l, i) => (
                                    <li key={i} className="flex items-start gap-1">
                                        <span className={`shrink-0 font-black ${l.pass ? 'text-success' : 'text-danger'}`}>{l.pass ? '✅' : '❌'}</span>
                                        <span className="text-text-muted tabular-nums shrink-0">{l.t}</span>
                                        <span className="min-w-0">
                                            <b>{l.from} → {l.to}</b>
                                            {l.local && <span className="text-info font-bold"> 🏘️</span>}
                                            <span className="text-text-muted"> · {l.dists} · </span>
                                            <b className={l.act === '확정' ? 'text-success' : 'text-text-muted'}>{l.act}</b>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </details>
                    )}
                    {/* 🛰️ 시스템 — 카카오를 언제·무엇으로 부르고 무엇을 받았나 (기사님 2026-09-08) */}
                    <details className="border-t border-border-card pt-2" open>
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">
                            🛰️ 시스템 — 카카오 호출 {apiLog.length}건
                        </summary>
                        {apiLog.length === 0
                            ? <p className="mt-1 text-[10px] text-text-muted">아직 호출 없음 — 길 찾기·콜 올리기·확정 때 부릅니다</p>
                            : (
                                <>
                                    <button type="button" onClick={() => setApiLog([])}
                                        className="mt-1 text-[10px] font-black text-text-muted hover:text-danger">비우기</button>
                                    <ol className="mt-1 flex flex-col gap-1 text-[10px] leading-snug">
                                        {apiLog.map((l, i) => (
                                            <li key={i} className={`rounded-md border px-1.5 py-1 ${l.ok ? 'border-border-card bg-background' : 'border-danger/45 bg-danger/5'}`}>
                                                <div className="flex items-center gap-1 flex-wrap font-black">
                                                    <span className="text-text-muted tabular-nums">{l.t}</span>
                                                    <span>{l.who}</span>
                                                    <span className="text-text-muted font-mono">{l.path}</span>
                                                    <span className="text-text-muted tabular-nums">{l.ms}ms</span>
                                                </div>
                                                <div className="text-text-muted">↗ {l.req}</div>
                                                <div className={l.ok ? 'text-info' : 'text-danger'}>↘ {l.res}</div>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                    </details>
                </aside>
            </div>

            {/* 📦 하단 — 필터로 나갈 값. 축별 6열 분류 (기사님 2026-09-07: «키우고 잘 분류해서 — 스크롤 없이») */}
            <footer className="shrink-0 border-t border-border-card bg-surface px-3 py-2 flex gap-3 h-[400px] text-[11px]">
                {/* 열 1 · 국면 축 */}
                <section className="w-[200px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                    <h2 className="text-[11px] font-black text-info mb-1">🧭 국면 축</h2>
                    <OutKv k="callTarget" v={`${appFilterOutput.callTarget} (${CALL_TARGET_LABEL[callTarget]})`} />
                    <OutKv k="dispatchPhase" v={appFilterOutput.dispatchPhase} />
                    <OutKv k="국면(파생)" v={PHASE_LABEL[phase]} />
                    <OutKv k="driverAction" v={appFilterOutput.driverAction} />
                    <OutKv k="isSharedMode" v={String(appFilterOutput.isSharedMode)} />
                    <OutKv k="isActive" v={String(appFilterOutput.isActive)} />
                </section>
                {/* 열 2 · 어디로 (지역 손잡이) */}
                <section className="w-[230px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                    <h2 className="text-[11px] font-black text-info mb-1">🎯 어디로</h2>
                    <OutKv k="destinationCity" v={appFilterOutput.destinationCity} />
                    <OutKv k="pickupRadiusKm" v={appFilterOutput.pickupRadiusKm} />
                    <OutKv k="destinationRadiusKm" v={appFilterOutput.destinationRadiusKm} />
                    <OutKv k="detourRadiusKm" v={appFilterOutput.detourRadiusKm} />
                    <OutKv k="mode" v={appFilterOutput.mode} />
                </section>
                {/* 열 3 · 돈 축 */}
                <section className="w-[230px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                    <h2 className="text-[11px] font-black text-info mb-1">💰 돈 축</h2>
                    <OutKv k="callDiscountPct" v={appFilterOutput.callDiscountPct !== undefined ? `${appFilterOutput.callDiscountPct}%` : undefined} />
                    <OutKv k="minFare" v={appFilterOutput.minFare?.toLocaleString()} />
                    <OutKv k="maxFare" v={appFilterOutput.maxFare?.toLocaleString()} />
                    <div className="mt-1 text-text-muted font-bold">ratePerKm (하한 원/km)</div>
                    {Object.entries(appFilterOutput.ratePerKm ?? {}).map(([veh, rate]) => (
                        <OutKv key={veh} k={veh} v={`≥ ${rate}`} />
                    ))}
                </section>
                {/* 열 4 · 콜 속성 축 */}
                <section className="w-[220px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                    <h2 className="text-[11px] font-black text-info mb-1">📦 콜 속성 축</h2>
                    <OutKv k="allowedVehicleTypes" v={appFilterOutput.allowedVehicleTypes?.join(' · ') || '전체'} />
                    <OutKv k="excludedKeywords" v={appFilterOutput.excludedKeywords?.join(' · ') || '없음'} />
                    <OutKv k="slotsUsed" v={`${appFilterOutput.slotsUsed} / ${TRUCK_CAPACITY_SLOTS}`} />
                    <OutKv k="capacityConfidence" v={appFilterOutput.capacityConfidence} />
                </section>
                {/* 열 5 · 지역 목록 — 제일 크다 */}
                <section className="flex-1 min-w-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                    <h2 className="text-[11px] font-black text-info mb-1">
                        🗂️ 지역 목록 — keywords {appFilterOutput.destinationKeywords.length} · 좌표 dongs {appFilterOutput.destinationDongs.length}
                        {appFilterOutput.excludedRegions.length > 0 && <span className="text-danger"> · 제외 {appFilterOutput.excludedRegions.join(' · ')}</span>}
                    </h2>
                    <div className="flex flex-col gap-1 leading-snug">
                        {Object.entries(appFilterOutput.destinationGroups).map(([region, names]) => (
                            <div key={region}>
                                <b>{region} {names.length}</b>
                                <span className="text-text-muted"> — {names.join(' · ')}</span>
                            </div>
                        ))}
                    </div>
                </section>
                {/* 열 6 · 원문 JSON — 접어 두고 복사만 바로 */}
                <section className="w-[260px] shrink-0 rounded-xl border border-warning/40 bg-background p-2.5 overflow-y-auto">
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-[11px] font-black text-warning">📦 원문 JSON</h2>
                        <button type="button"
                            onClick={() => { navigator.clipboard?.writeText(JSON.stringify(appFilterOutput, null, 2)).catch(() => { /* 클립보드 막힘 — 무시 */ }); }}
                            className="text-[10.5px] font-black text-text-muted hover:text-warning">📋 복사</button>
                    </div>
                    <details>
                        <summary className="cursor-pointer text-[10.5px] font-bold text-text-muted">펼쳐 보기 (앱 피기백 그대로)</summary>
                        <pre className="mt-1 text-[9.5px] leading-snug whitespace-pre-wrap break-all text-text-primary">{JSON.stringify(appFilterOutput, null, 1)}</pre>
                    </details>
                    <p className="mt-1 text-[10px] text-text-muted leading-snug">─ 하늘 사각형 = 동선 그물 · 파란 점 = 든 동 · 색 선 = 잡은 콜 경로 · 회색 선 = 지나온 길 · 띠 = 길 경유 띠</p>
                </section>
            </footer>
        </div>
    );
}
