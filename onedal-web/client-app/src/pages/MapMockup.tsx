import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
    PHASE_KEYS, PHASE_LABEL, PHASE_FIELDS, PHASE_AUTO_SOURCE, fieldLabel,
    DEFAULT_PHASE_SETTINGS, normalizePhaseSettings, rateFloorsFrom,
    reachRadiusKm, REACH_COEF_MIN_PER_KM_TEMP, NET_RATE_PER_KM, VEHICLE_CAPACITY, CAPACITY_CONFIDENCE_LABEL, CALL_TARGET_LABEL,
    type FieldMode, type PhaseKey, type PhaseSettings, type PhaseSettingsMap,
} from '@onedal/shared';
import { buildAppFilterOutput, labPhaseOf, TRUCK_CAPACITY_SLOTS } from './labFilterOutput';
import {
    buildNet, buildRoadNet, roadZoneOf, judgeTwoStage, judgeTwoTrack, nearestDong, orderStopsGrouped, cityCenter, quadTesterOf, isLocalPhase, NET_SRC, NET_DST,
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
        /** 배송(상차→하차) 실측 — 확정 순간 카카오 1회. 못 받으면 직선 km 폴백 (straight=true) */
        distKm?: number; durMin?: number | null; tollWon?: number | null; straight?: boolean; optionUsed?: string;
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
    const [heading, setHeading] = useState<'DEST' | 'HOME'>('DEST');
    const [homeCaught, setHomeCaught] = useState(false);
    const HOME_DST: NetPoint = useMemo(() => ({ ...NET_SRC, name: '복귀(집)' }), []);
    const dst = DESTS[dstIdx];   // 주 트랙 목적지 — 복귀행에서도 살아 있다 (두 마름모)
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
    const legKey = (aLng: number, aLat: number, bLng: number, bLat: number) =>
        `${aLng.toFixed(5)},${aLat.toFixed(5)}>${bLng.toFixed(5)},${bLat.toFixed(5)}|${routeCombo.priority}|${routeCombo.avoid ?? ''}`;
    /** 올린 콜의 실도로 곡선 — 필터 통과 순간 받아온다 (서버가 심사하며 보는 그 경로) */
    const [uploadedLeg, setUploadedLeg] = useState<Pt[] | null>(null);
    /** 올릴 때 받은 그 콜의 실측 — 확정하면 그대로 카드에 쓴다 (같은 구간을 두 번 묻지 않는다) */
    const uploadedInfoRef = useRef<{ distKm: number; durMin: number | null; tollWon: number | null; straight: boolean } | null>(null);
    const uploadCall = () => {
        if (!pickup || !drop) return;
        setUploaded(true); setCallSeenAt(Date.now()); setNowTick(Date.now()); setUploadedLeg(null); uploadedInfoRef.current = null;
        fetch(`${apiBase()}/sim/route`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ x: pickup.lng, y: pickup.lat }, { x: drop.lng, y: drop.lat }], priority: routeCombo.priority, avoid: routeCombo.avoid }),
        })
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(d => {
                const leg = d.legs?.[0];
                if (!leg) return;
                const line: Pt[] = leg.map((p: { x: number; y: number }) => ({ lng: p.x, lat: p.y }));
                setUploadedLeg(line);
                // 🗄️ 확정되면 이 구간이 경로에 그대로 들어간다 — 캐시에 미리 넣어 다시 안 묻는다
                legCacheRef.current.set(legKey(pickup.lng, pickup.lat, drop.lng, drop.lat),
                    { line, failed: !!d.legInfo?.[0]?.failed });
                const li = d.legInfo?.[0];
                if (li) uploadedInfoRef.current = { distKm: li.distKm, durMin: li.failed ? null : li.durMin, tollWon: li.tollWon, straight: !!li.failed };
            })
            .catch(err => console.warn('[올린 콜] 실경로 못 받음 — 직선:', err));
    };
    const [callSeenAt, setCallSeenAt] = useState<number | null>(null);
    const [nowTick, setNowTick] = useState(Date.now());
    useEffect(() => {
        if (!callSeenAt) return;
        const t = setInterval(() => setNowTick(Date.now()), 250);
        return () => clearInterval(t);
    }, [callSeenAt]);
    const safeCancelLeft = callSeenAt ? Math.max(0, 30 - Math.floor((nowTick - callSeenAt) / 1000)) : null;
    const pauseForCall = () => { if (driving) { setDriving(false); setPausedForCall(true); } };
    const resumeAfterCall = () => { setCallSeenAt(null); setUploaded(false); setUploadedLeg(null); if (pausedForCall) { setPausedForCall(false); setDriving(true); } };
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
    const callTarget: 'DEST' | 'LOCAL' | 'HOME' = heading === 'HOME' ? 'HOME' : localMode ? 'LOCAL' : 'DEST';
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
    const [detourKm, setDetourKm] = useState(5);
    /**
     * 🔍 길 찾기 결과 — **누를 때마다 카카오 실시간, 모든 옵션 그대로** (기사님 2026-09-08
     * «합하지 말고 카카오 모든 옵션을 뿌려라 — 카카오 호출하자는 이야기»).
     * 원점은 내 위치(밤에 누르면 밤의 소요시간). null = 아직/호출 중, [] = 후보 없음.
     * 서버(/api/sim/roads · 개발 전용)가 5옵션×대안을 병합 없이 준다. 못 받으면 미리 만든
     * 파일(ROADS_BY_DEST)로 폴백 — 폴백에 들어가면 반드시 소리를 낸다 (버그 대장 #101 교훈).
     */
    const [liveRoads, setLiveRoads] = useState<LabRoad[] | null>(null);
    const searchRoads = async () => {
        setRoadSearched(true); setRoadIdx(-1); setLiveRoads(null);
        try {
            const r = await fetch(`${apiBase()}/sim/roads`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origin: { x: myPos.lng, y: myPos.lat }, dest: { x: dst.lng, y: dst.lat } }),
            });
            if (!r.ok) throw new Error(String(r.status));
            const d = await r.json();
            setLiveRoads(Array.isArray(d.roads) ? d.roads : []);
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
    const callSeqRef = useRef(0);
    /** ✅ 콜 확정 — 리스트에 넣고, 그 콜의 배송 거리·시간·톨비를 실측해 카드에 붙인다 (기사님 2026-09-08).
     *  ⚠️ 옵션은 카카오 «추천» 하나다 (서버 calculateSoloRoute 기본값) — 길 찾기의 5옵션과 다르다. 카드에 표기함 */
    const confirmCall = (p: Pt, d: Pt) => {
        const id = ++callSeqRef.current;
        // 걸린 트랙이 곧 판 — 복귀 콜이면 그 순간 관내가 ∩ 로 조여진다 (자동, 입력 없음)
        const caughtDest = twoTrack && twoTrack.wonTrack === 'HOME' ? HOME_DST.name : dst.name;
        if (twoTrack?.wonTrack === 'HOME') setHomeCaught(true);
        const known = uploadedInfoRef.current;   // 🗄️ 올릴 때 이미 잰 구간 — 다시 묻지 않는다
        setConfirmed(c => [...c, { id, pickup: p, drop: d, optionUsed: routeCombo.label, destName: caughtDest, ...(known ?? {}) }]);
        if (known) return;
        fetch(`${apiBase()}/sim/route`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ x: p.lng, y: p.lat }, { x: d.lng, y: d.lat }], priority: routeCombo.priority, avoid: routeCombo.avoid }),
        })
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(res => {
                const info = res.legInfo?.[0];
                if (info) setConfirmed(c => c.map(x => x.id === id
                    ? { ...x, distKm: info.distKm, durMin: info.failed ? null : info.durMin, tollWon: info.tollWon, straight: !!info.failed }
                    : x));
            })
            .catch(err => {
                console.warn('[콜 실측] 못 받아 직선 폴백:', err);
                const straightKm = +Math.hypot((d.lng - p.lng) * 88.6, (d.lat - p.lat) * 110.574).toFixed(1);
                setConfirmed(c => c.map(x => x.id === id ? { ...x, distKm: straightKm, durMin: null, tollWon: null, straight: true } : x));
            });
    };
    /**
     * 🧅 레이어 (기사님 2026-09-07 «각각 레이어 처리 — 켜고 끄고») — 그리기 순서의 켜기/끄기.
     * 모든 레이어가 한 투영(줌·원점)을 쓰므로 켜고 꺼도 드래그·줌은 그대로다.
     */
    const [layers, setLayers] = useState({ base: true, border: true, roads: true, net: true, route: true, call: true });
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
    useEffect(() => { if (driving) setDeparted(true); }, [driving]);
    useEffect(() => { if (confirmed.length === 0) { setDeparted(false); setHomeCaught(false); } }, [confirmed.length]);
    /** 마지막으로 계산한 방문 순서 — 방문 고정(visited)의 원천 */
    const prevOrderRef = useRef<Array<{ call: number; kind: '상차' | '하차' }>>([]);
    /**
     * 🔴 «몇 정거장 지나왔나»는 targetSeq 로 읽으면 안 된다 (2026-09-08 실측 사고 · 규칙 ⑤-4 ⑤).
     * targetSeq 는 «주행 재개가 다음 향할 점»이고, 재개 로직이 지리적으로 가까운 정거장으로
     * 점프할 수 있다 — 그걸 방문 수로 읽자 안 지나간 정거장까지 잠겼다.
     * 방문 수는 **드라이브가 정거장에 실제로 도달한 순간에만** 여기서 센다.
     */
    const visitedCountRef = useRef(0);
    useEffect(() => { if (confirmed.length === 0) visitedCountRef.current = 0; }, [confirmed.length]);
    const effPath = useMemo(() => {
        const allCalls = [
            ...presetCalls.map(c => ({ ...c, destName: dst.name })),
            ...confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })),
        ];
        if (allCalls.length === 0) {
            prevOrderRef.current = [];
            return [] as Array<{ x: number; y: number; label: string; color?: string; seq?: number }>;
        }
        // 지나간 정거장은 사실 — 그 순서 그대로 고정 (주행 전엔 자유 재배치)
        const visited = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        const ordered = orderStopsGrouped(NET_SRC, allCalls, visited);
        prevOrderRef.current = ordered.map(o => ({ call: o.call, kind: o.kind }));
        return [
            { x: NET_SRC.lng, y: NET_SRC.lat, label: '출발 · 초월(집)' },
            ...ordered.map((s, i) => ({
                x: s.pt.lng, y: s.pt.lat, seq: i + 1,
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
        if (cached.every(Boolean)) {
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
            fetch(`${apiBase()}/sim/route`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ points: [{ x: m.a.x, y: m.a.y }, { x: m.b.x, y: m.b.y }], priority: routeCombo.priority, avoid: routeCombo.avoid }),
            })
                .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
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

    const net = useMemo(
        () => routeMode
            ? buildRoadNet(road ? road.line : [], dst, params.dstDiamKm, detourKm)
            : buildNet(params, anchor, dst),
        [routeMode, road, detourKm, params, anchor, dst]);
    const zone = useMemo(
        () => routeMode ? roadZoneOf(road ? road.line : [], dst, params.dstDiamKm, detourKm) : undefined,
        [routeMode, road, dst, params.dstDiamKm, detourKm]);
    /**
     * ↩️ 복귀 마름모 — 내 위치→집. 주 마름모(net)와 **둘이 함께** 양방향을 이룬다
     * (기사님 정정 2026-09-08: 관내 원이 아니라 **목적지 마름모가 계속 살아야** 한다 —
     * 콜 없는 중간 지점에서 원은 무의미. 관내는 목적지 도착 시 주 마름모가 원으로 퇴화해 충족)
     */
    const homeNet = useMemo(() => heading === 'HOME' ? buildNet(params, anchor, HOME_DST) : null,
        [heading, params, anchor, HOME_DST]);
    /** 복귀 콜을 쥔 뒤(∩) — 주 트랙을 «집 원뿔 안»으로 자르는 판정기 */
    const homeWedge = useMemo(() => heading === 'HOME' && homeCaught
        ? quadTesterOf(params, anchor, HOME_DST) : null,
        [heading, homeCaught, params, anchor, HOME_DST]);
    /** 화면·아웃풋이 읽는 영역 = 주 마름모(∩ 적용) ∪ 복귀 마름모 — 목적지행이면 net 그대로 */
    const areaNet = useMemo(() => {
        if (!homeNet) return { groups: net.groups, pass: net.pass, count: net.count };
        const mainPass = homeWedge ? net.pass.filter(pt => homeWedge({ lng: pt.x, lat: pt.y })) : net.pass;
        const seen = new Set(mainPass.map(pt => `${pt.region}|${pt.name}`));
        const pass = [...mainPass];
        for (const pt of homeNet.pass) { const k = `${pt.region}|${pt.name}`; if (!seen.has(k)) { seen.add(k); pass.push(pt); } }
        const grouped = new Map<string, string[]>();
        for (const pt of pass) grouped.set(pt.region, [...(grouped.get(pt.region) ?? []), pt.name]);
        const groups = [...grouped.entries()].map(([region, names]) => ({ region, names }))
            .sort((a, b) => b.names.length - a.names.length);
        return { groups, pass, count: pass.length };
    }, [net, homeNet, homeWedge]);
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
        modeDesc: (heading === 'HOME' ? (homeCaught ? '↩️ 복귀행(목적지 트랙은 길목 ∩) · ' : '↩️ 양방향(목적지 ∪ 복귀 마름모) · ') : '')
            + (road ? `길 ±${detourKm}km — ${road.name}` : routeMode ? '노선 (길 미선택 — 목적지 원만)' : localMode ? '관내 (목적지 원)' : `동선 사각형 ${params.srcAngleDeg}°/${params.dstAngleDeg}°`),
    }), [callTarget, dispatchPhaseSim, driving, dst, areaNet, excluded, ps, vehicles, excludedWords, slotsUsed, capacityConfirmed, road, routeMode, detourKm, localMode, params, heading, homeCaught]);
    /** ↩️ 복귀 대기의 양방향 판정 — 관내·복귀 두 트랙, 우선권은 복귀 */
    const twoTrack = useMemo(() => heading === 'HOME' && pickup && drop
        ? judgeTwoTrack(params, anchor, dst, HOME_DST, myPos, pickup, drop,
            { routeStarted, mainLocal: localMode, mainZone: zone, homeCaught })
        : null, [heading, pickup, drop, params, anchor, dst, HOME_DST, myPos, routeStarted, localMode, zone, homeCaught]);
    const verdict: TwoStageVerdict | null = useMemo(() => {
        if (twoTrack) return twoTrack.wonTrack === 'MAIN' ? twoTrack.main : twoTrack.home;
        return pickup && drop ? judgeTwoStage(params, anchor, dst, myPos, pickup, drop, routeStarted, localMode, zone) : null;
    }, [twoTrack, pickup, drop, params, anchor, dst, myPos, routeStarted, localMode, zone]);
    /**
     * 📐 우회 미리보기 — 판정 기준 «돈(우회)·약속(지연)» 축의 재료 (기사님 2026-09-08:
     * *"판단 기준 5개 중 지도·경로·시간에 맞는 것만 골라 더 보여줘"*).
     * 이 콜을 지금 경로에 붙이면 총거리가 얼마나 느나 — 직선 근사, 분 환산은 잠정 계수
     * (실물 REACH_COEF — 근거 없는 값이라 «거르는 데는 안 쓴다», 표시만).
     */
    const detourPreview = useMemo(() => {
        if (!pickup || !drop) return null;
        const km = (a: Pt, b: Pt) => Math.hypot((a.lng - b.lng) * 88.6, (a.lat - b.lat) * 110.574);
        const caughtDest = twoTrack && twoTrack.wonTrack === 'HOME' ? HOME_DST.name : dst.name;
        const base = confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName }));
        const withCall = [...base, { pickup, drop, destName: caughtDest }];
        const totalKm = (calls: typeof base) => {
            if (calls.length === 0) return 0;
            const stops = orderStopsGrouped(NET_SRC, calls, []);
            let pos: Pt = { lng: NET_SRC.lng, lat: NET_SRC.lat }, sum = 0;
            for (const st of stops) { sum += km(pos, st.pt as Pt); pos = st.pt as Pt; }
            return sum;
        };
        const deliverKm = km(pickup, drop);
        const detourKm2 = Math.max(0, totalKm(withCall) - totalKm(base) - deliverKm);
        return {
            deliverKm: +deliverKm.toFixed(1),
            detourKm: +detourKm2.toFixed(1),
            detourMin: Math.round((detourKm2 + deliverKm) * REACH_COEF_MIN_PER_KM_TEMP),
        };
    }, [pickup, drop, confirmed, twoTrack, dst.name, HOME_DST]);
    /** ⛔ 제외지역에 걸린 콜 — 필터에 그 동이 안 실리므로 실전에선 애초에 안 올라온다 */
    const exclusionHit = useMemo(() => {
        if (!verdict) return null;
        if (isExcluded(verdict.pickupDong.region, verdict.pickupDong.name)) return `상차 ${verdict.pickupDong.region} ${verdict.pickupDong.name}`;
        if (isExcluded(verdict.dropDong.region, verdict.dropDong.name)) return `하차 ${verdict.dropDong.region} ${verdict.dropDong.name}`;
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verdict, excluded]);
    /** 화면·기록이 쓰는 최종 통과 — 기하 판정(verdict.pass)에 제외지역을 겹친 값 */
    const finalPass = !!verdict && (twoTrack ? twoTrack.pass : verdict.pass) && !exclusionHit;

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
            setMyPos(pos => {
                let ti = targetIdxRef.current;
                let remain: number = STEP_KM;
                let cur = pos;
                // 실도로 점은 촘촘하다 — 한 틱 걸음이 남는 만큼 여러 점을 이어 삼킨다
                while (remain > 0 && ti < drivePath.length) {
                    const t = drivePath[ti];
                    const dx = (t.lng - cur.lng) * 88.6, dy = (t.lat - cur.lat) * 110.574;
                    const d = Math.hypot(dx, dy);
                    if (d <= remain) { cur = { lng: t.lng, lat: t.lat }; remain -= d; ti++; setTargetSeq(t.seq); visitedCountRef.current = Math.max(visitedCountRef.current, t.seq); }
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
            const pts: Array<[number, number]> = [...net.tri, [myPos.lng, myPos.lat], [dst.lng, dst.lat]];
            if (road) pts.push(...road.line);
            if (realLegs) for (const leg of realLegs) for (const p of leg) pts.push([p.lng, p.lat]);
            for (const c of net.circles) pts.push(...c.ring);
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

            // ↩️ 복귀 마름모 — 주 마름모와 **같은 급, 같은 파란 실선** (기사님 2026-09-08:
            //    «파란 마름모 2개 — 콜마다 방향이 있으니 문제없다»). ∩ 뒤엔 주 마름모만 흐려진다
            if (homeNet && layers.net) {
                ctx.beginPath();
                homeNet.tri.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                ctx.closePath();
                ctx.fillStyle = 'rgba(14,165,233,.10)'; ctx.fill();
                ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 2.5; ctx.stroke();
            }
            // 꼭짓점 원 — 주황 점선. 🔴 합짐(첫 콜 뒤)이면 내 위치 원은 **마름모와의 교집합만** 남긴다
            //    (기사님 2026-09-07 «원과 마름모의 교집합만 남도록 라인을 지워줘») — 상차 영역이 그 모양이니까
            const inQuadFn = quadTesterOf(params, anchor, dst);
            if (layers.net) net.circles.forEach((c, ci) => {
                ctx.strokeStyle = '#d97706'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
                if (ci === 0 && routeStarted) {
                    for (let i = 1; i < c.ring.length; i++) {
                        const [lng1, lat1] = c.ring[i - 1], [lng2, lat2] = c.ring[i];
                        if (!inQuadFn({ lng: lng1, lat: lat1 }) || !inQuadFn({ lng: lng2, lat: lat2 })) continue;
                        const a = S(lng1, lat1), b = S(lng2, lat2);
                        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
                    }
                } else {
                    ctx.beginPath();
                    c.ring.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            });
            // km → px 환산 (경유 띠 폭·내 반경 원을 땅 위 크기로 그린다)
            const kmBase = S(dst.lng, dst.lat);
            const kmProbe = S(dst.lng + 1 / (111.32 * Math.cos(dst.lat * Math.PI / 180)), dst.lat);
            const pxPerKm = Math.hypot(kmProbe[0] - kmBase[0], kmProbe[1] - kmBase[1]);
            if (routeMode) {
                // 내 반경(상차) 원 — 노선 모드의 그물 결과에는 없어 직접 두른다
                const [mx, my] = S(myPos.lng, myPos.lat);
                ctx.beginPath(); ctx.arc(mx, my, (params.srcDiamKm / 2) * pxPerKm, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(217,119,6,.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
            }
            // 사각형 (레이어: 그물) — 오늘의 노선이 켜지면 동선은 쉰다 (딤드)
            if (layers.net && !routeMode) {
            ctx.beginPath();
            net.tri.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
            ctx.closePath();
            ctx.fillStyle = homeCaught ? 'rgba(14,165,233,.04)' : 'rgba(14,165,233,.10)'; ctx.fill();
            ctx.strokeStyle = homeCaught ? 'rgba(2,132,199,.35)' : '#0284c7'; ctx.lineWidth = homeCaught ? 1.5 : 2.5; ctx.stroke();
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
                        ctx.lineWidth = Math.max(3, detourKm * 2 * pxPerKm);
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
            if (layers.route) for (const seg of trailRef.current) {
                if (seg.length < 2) continue;
                ctx.beginPath();
                seg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                ctx.strokeStyle = 'rgba(55,65,81,.85)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
            }
            // 잡은 콜 경로 — 구간 색 + 이름표 (레이어: 내 경로). 실도로 곡선이 오면 그걸로 잇는다
            if (layers.route) {
                if (drawLegs) {
                    drawLegs.forEach((leg, i) => {
                        ctx.beginPath();
                        const legPts = [{ lng: effPath[i].x, lat: effPath[i].y }, ...leg, { lng: effPath[i + 1].x, lat: effPath[i + 1].y }];
                        legPts.forEach((p, j) => { const [px, py] = S(p.lng, p.lat); j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                        ctx.strokeStyle = effPath[i + 1].color ?? '#e11d48'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
                        if (legFailed[i]) ctx.setLineDash([6, 5]);      // 도로 탐색 불가 — 직선 구간은 점선
                        ctx.stroke(); ctx.setLineDash([]);
                    });
                } else {
                    for (let i = 1; i < effPath.length; i++) {
                        const a = S(effPath[i - 1].x, effPath[i - 1].y), b = S(effPath[i].x, effPath[i].y);
                        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                        ctx.strokeStyle = effPath[i].color ?? '#e11d48'; ctx.lineWidth = 3.5; ctx.stroke();
                    }
                }
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
            for (const [pt, tone, mark] of [[anchor, '#111827', '📍'], [dst, '#d97706', '🎯']] as const) {
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
                const a = S(pickup.lng, pickup.lat), b = S(drop.lng, drop.lat);
                ctx.globalAlpha = blink;
                ctx.beginPath();
                if (uploadedLeg && uploadedLeg.length >= 2) {   // 올린 뒤 — 카카오 실도로
                    uploadedLeg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                } else { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
                ctx.strokeStyle = finalPass ? '#16a34a' : '#dc2626'; ctx.lineWidth = urgent ? 4.5 : 2.5;
                ctx.setLineDash(uploadedLeg ? [] : urgent ? [12, 7] : [7, 5]); ctx.stroke(); ctx.setLineDash([]);
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
    }, [net, areaNet, homeNet, homeCaught, heading, legFailed, safeCancelLeft, nowTick, finalPass, uploadedLeg, effPath, anchor, pickup, drop, verdict, size, params, dst, routeStarted, road, roadIdx, dstIdx, view, layers, routeMode, roadSearched, destRoads, detourKm, knobs, myPos, drawLegs, excluded]);

    /** 클릭 한 점을 콜/내위치로 배치 */
    const placeAt = (pt: Pt) => {
        if (clickMode === 'me') { setMyPos(pt); setClickMode('call'); return; }
        if (!pickup || (pickup && drop)) { if (pickup && drop) pushLog('버림'); pauseForCall(); setPickup(pt); setDrop(null); setUploaded(false); setUploadedLeg(null); setCallSeenAt(null); }
        else { setDrop(pt); setUploadedLeg(null); }
    };

    const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const v = viewRef.current;
        if (dragRef.current.moved) { dragRef.current.moved = false; return; }   // 드래그 끝의 클릭은 콜이 아니다
        placeAt(fromWorldPx(v.originX + (e.clientX - rect.left), v.originY + (e.clientY - rect.top), v.z));
    };

    return (
        <div className="h-screen bg-background text-text-primary flex flex-col overflow-hidden">
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
                    {([['base', '배경'], ['border', '경계'], ['roads', '길'], ['net', '그물'], ['route', '경로'], ['call', '시험콜']] as const).map(([k, label]) => (
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
                        🎯 {CALL_TARGET_LABEL[callTarget]} · {heading === 'HOME'
                            ? <>여기서 {ps.pickupRadiusKm}km → {dst.name} ∪ ↩️집 {ps.dropoffRadiusKm}km</>
                            : <>여기서 {ps.pickupRadiusKm}km → {dst.name} {ps.dropoffRadiusKm}km</>}
                        {heading === 'HOME' && <b className="text-warning">{homeCaught ? ' · 길목 ∩' : ' · +🏘️ 관내'}</b>}
                        {' · 📦 '}{slotsUsed}/{TRUCK_CAPACITY_SLOTS}
                    </div>

                    {/* ↩️ 행선 — 목적지행 ↔ 복귀 (기사님 확정 2026-09-08). 관내는 버튼이 아니라 자동 인지,
                        복귀를 켜면 관내 원 ∪ 복귀 트랙 양방향이 자동으로 선다 */}
                    <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                            <button type="button" onClick={() => { freezeView(); setHeading('DEST'); setHomeCaught(false); }}
                                className={`flex-1 px-1.5 py-1.5 rounded-[8px] border text-[11px] font-black ${heading === 'DEST'
                                    ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                                🎯 목적지행
                            </button>
                            <button type="button" onClick={() => { freezeView(); setHeading('HOME'); }}
                                className={`flex-1 px-1.5 py-1.5 rounded-[8px] border text-[11px] font-black ${heading === 'HOME'
                                    ? 'bg-warning/15 border-warning/55 text-warning' : 'border-border-hover bg-background text-text-muted'}`}>
                                ↩️ 복귀
                            </button>
                        </div>
                        {heading === 'HOME' && (
                            <p className="text-[10px] text-warning font-bold leading-snug">
                                {homeCaught
                                    ? '↩️ 복귀 콜을 쥠 — 목적지 트랙은 집 길목(∩) 조각만 남습니다'
                                    : '↩️ 복귀 대기 — 목적지행과 복귀, 마름모 둘로 양방향을 노립니다 (콜 처리 중에도)'}
                            </p>
                        )}
                        {/* 국면 = 실물 resolvePhaseKey(콜타겟 × 운행상태) — 수동 선택이 아니라 파생값 (규칙 ③) */}
                        <p className="text-[10.5px] text-text-muted leading-snug">
                            운행 상태 <b className="text-text-primary">{dispatchPhaseSim === 'STANDBY' ? '대기' : dispatchPhaseSim === 'GATHERING' ? '콜 쥠' : '주행 중'}</b>
                            {' → 국면 '}<b className="text-info">{PHASE_LABEL[phase]}</b> (자동 — 콜을 확정·주행하면 저절로 넘어갑니다)
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
                            <NumRow label="경로반경㎞" value={detourKm} onChange={setDetourKm} min={1} max={30} />
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
                                    ✅ 이 길 ±{detourKm}km 의 <b className="text-text-primary">{areaNet.count}동</b>이 필터
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
                                {twoTrack && (
                                    <div className="flex gap-1 flex-wrap items-center">
                                        <Chip ok={twoTrack.main.pass} yes="목적지 트랙" no="목적지 밖" />
                                        <Chip ok={twoTrack.home.pass} yes="복귀 트랙" no="복귀 밖" />
                                        {twoTrack.wonTrack && (
                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-warning/15 text-warning">
                                                승자 {twoTrack.wonTrack === 'HOME' ? '↩️ 복귀' : '🎯 목적지'}
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
                                            {routeStarted && <Chip ok={verdict.pickupInNet} yes={roadMode ? '상차 경유 띠 안' : '상차 사각형 안'} no={roadMode ? '상차 경유 띠 밖' : '상차 사각형 밖(뒤)'} />}
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
                            <div className="flex flex-col gap-1">
                                {detourPreview && (
                                    <>
                                        <div className="text-[10px] font-black text-text-muted">💰 돈 · ⏱️ 약속 — 이 콜을 붙이면</div>
                                        <div className="text-[11px] font-bold tabular-nums">
                                            📐 배송 {detourPreview.deliverKm}km · <b className={detourPreview.detourKm > 0 ? 'text-warning' : 'text-success'}>우회 +{detourPreview.detourKm}km</b> · 이 콜에 ≈{detourPreview.detourMin}분
                                        </div>
                                        <div className="text-[9.5px] text-text-muted leading-snug">
                                            잠정 계수 {REACH_COEF_MIN_PER_KM_TEMP}분/km · 직선 근사 — 실물은 카카오 경로로 잰다
                                        </div>
                                    </>
                                )}
                                <div className="text-[10px] font-black text-text-muted">아직 못 재는 기준 — 콜에 그 재료가 없다 (지어내지 않는다)</div>
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
                    <FilterPanel title={`📋 콜 리스트${confirmed.length ? ` — ${confirmed.length}` : ''}`}>
                        {confirmed.length === 0 && <p className="text-[10.5px] text-text-muted">확정한 콜이 여기 쌓입니다</p>}
                        {confirmed.length > 0 && (
                            <>
                                {/* 콜 = 한 덩어리 카드: 윗줄 상차→하차 · 아랫줄 거리·시간·톨비 (기사님 2026-09-08) */}
                                <ol className="flex flex-col gap-1 text-[11px]">
                                    {confirmed.map((c, i) => {
                                        const n = baseCallCount + i + 1;
                                        const color = CALL_COLORS[(n - 1) % CALL_COLORS.length];
                                        return (
                                            <li key={c.id} className="rounded-[8px] border border-border-card bg-background px-1.5 py-1 flex flex-col gap-0.5">
                                                <span className="flex items-center gap-1.5 min-w-0">
                                                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                                                    <b className="shrink-0">{circled(n)}</b>
                                                    <span className="truncate font-black">{nearestDong(c.pickup).name} → {nearestDong(c.drop).name}</span>
                                                    <span className="shrink-0 text-[9.5px] px-1 rounded bg-info/15 text-info font-black">🎯 {c.destName.replace(' 시내', '')}</span>
                                                </span>
                                                <span className="pl-4 text-[10.5px] font-bold text-text-muted tabular-nums">
                                                    {c.distKm === undefined ? '⏳ 실측 중…'
                                                        : c.straight ? `직선 ${c.distKm}km (도로 탐색 불가·실측 실패)`
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
