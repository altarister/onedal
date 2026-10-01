/**
 * 🔬 **곁 패널 — 기사님과 내가 «같은 것»을 보는 화면**.
 *
 * 기사님: *"내가 볼때 너랑 나랑 같은걸 보고 있어야 될꺼 같단 말이지."*
 *
 * 기사님과 내가 **다른 것을 보고 있으면** 어긋난다 — 서버 로그와 화면, 코드와 지도,
 * 계획과 목업. **같은 화면을 보고 있으면 30초**에 끝날 일이다.
 *
 * ─────────────────────────────────────────────────────────────
 * 🔴 **언젠가 통째로 지운다** (기사님 지시: *"나중에 한방에 지울수 있으면 더 좋겠다"*).
 *    지우는 법 — **이 폴더(`statusboard/`) + `Dashboard.tsx` 의 `<StatusBoard …/>` 한 줄.**
 *    그게 전부다. `sidePanel.test.ts` 가 그 모양(폴더 하나·호출 한 곳·무대를 안 건드림)을 잠근다.
 *
 * 🔴 **폰에서는 아예 안 만든다** (기사님 지시). 숨기는 것과 안 만드는 것은 다르다 —
 *    숨기면 훅이 돌고 구독이 붙는다. 운행 중 화면에 무게를 얹지 않는다.
 *    만드는 조건은 부르는 쪽(`Dashboard`)이 잰다.
 *
 * 🔴 **값을 여기서 만들지 않는다.** 서버가 쥔 것을 그대로 비춘다 — 패널이 제 계산을 하면
 *    «화면은 맞는데 판정은 틀린» 것을 못 잡는다. 그러면 진단 화면이 **오진을 늘린다**
 *    (루트 README.md 「무엇이 실제로 돌고 있는가」).
 * ─────────────────────────────────────────────────────────────
 *
 * 자리: 무대는 `max-w-2xl`(672px)이고 **패널이 설 때만 왼쪽에 붙는다**(`Dashboard`).
 *       패널은 그 오른쪽 전부를 쓰되 **원본과 형제**로 선다 — 겹치지 않으니 무대는 그대로다.
 *       그 안은 🧪 테스트용 구역(서버로 보내는 시험 도구)과 🚨 어긋남 한 칸이다.
 *       서버 · 앱 · 버린 콜 · 심사 중 · 폰 값 카드는 운영센터 회원 «폰 · 필터» 칸에 있다(같은 이름 · 같은 순서) — 여기 두 벌을 두지 않는다.
 */
import { useEffect, useState } from 'react';
import { haversineKm, deviceLabel, wonText } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';
/* 🌉 관제웹 안쪽은 **다리 하나**로만 본다 — 옮길 때 `bridge.ts` 만 새로 쓰면 된다 */
import { LAB_EVENING,
         useFilterConfig, useDeviceStore, apiBase,
         useMockDriveStore, MOCK_DRIVE_SPEEDS, MOCK_DRIVE_DEFAULTS, publishLocation, apiClient,
         useDriverPositionStore, ensureDriverPositionSubscribed,
         useSettingsStore, KM_PER_TICK, STOP_OFF_ROAD_KM } from './bridge';
import { callStepsOf, handmadeOrderFrom } from './handmadeCall';
import { placeFromFound, sentNoteOf, simCallBody } from './simCall';
import type { SimPlaceDraft } from './simCall';
import ScenarioCard from './ScenarioCard';
/* 🚪 시뮬 전용 문은 여기 하나로만 연다 — 라이브에서는 닫혀 있다 (`simDoor.ts`) */
import { simAsk, simFetch, useSimDoor } from './simDoor';
/* 🎚️ **눈금이 무엇을 못 보게 하나 — 판단은 순수 함수가 한다** (`dialEffect.ts` 머리 참조) */
import { dialEffectOf } from './dialEffect';
/* 🔴 서버 주소를 손으로 적지 않는다 — `apiBase()` 를 거친다.
   손으로 적으면 `/api` 가 두 번 붙어 실경로가 늘 직선으로 그려진다 */

/**
 * 한 줄(쪽) 하나의 **최소** 폭. 패널 폭이 «줄 수 × 이 폭»에 못 미치면 줄을 좌우로 세우지 않고
 * **위아래로 쌓는다** — 이보다 좁으면 값이 안 읽힌다.
 *
 * 🔴 **가로 스크롤을 두지 않는다** (기사님 지시: *"왼쪽의 모듈들이 다 보였으면
 *    좋겠어. 항상 윈도우를 풀사이즈로 하는건 힘들어"*). 가로로만 흐르면 창이 작을 때
 *    칸이 **숨는다** — 있는 줄도 모른다. 아래로 쌓으면 휠 한 번에 다 지나간다.
 */
interface Health {
    bootedAt?: string;
    git?: { commit?: string; branch?: string };
    [k: string]: unknown;
}

/**
 * 🏷️ 한 줄 — 이름과 값. 값이 없으면 «—» 로 두고 **지어내지 않는다** (규칙 ④).
 *
 * 🎨 **모양은 지도 목업의 `OutKv` 를 따른다** (기사님 지시: *"지도 목업파일이
 *    있거든 그거보고 ui / ux , 디자인을 참고해서 일관되게"*). 이름은 왼쪽에 흐리게,
 *    값은 **오른쪽 끝에 진하게** — 값이 한 줄에 맞춰 서면 «무엇이 비었나»가 훑기만 해도 보인다.
 *
 * @param empty 값이 없을 때 적을 말. 「앱에 내려갈 필터」에서는 없는 값이 곧
 *              **«안 내려간다»** 라서 목업처럼 «— 숨김» 이라고 적는다.
 */
function Row({ k, v, tone, empty = '—' }: { k: string; v: unknown; tone?: 'warn' | 'ok'; empty?: string }) {
    const blank = v === undefined || v === null || v === '';
    const text = blank
        ? empty
        : Array.isArray(v) ? (v.length ? `${v.length}개 · ${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}` : '(빈 배열)')
            : typeof v === 'object' ? JSON.stringify(v)
                : String(v);
    return (
        <div className="flex justify-between gap-2 py-0.5 border-b border-border-card/50 last:border-0">
            <span className="shrink-0 max-w-[55%] text-[10.5px] font-bold text-text-muted truncate" title={k}>{k}</span>
            <span className={`min-w-0 text-right text-[11px] break-all ${blank ? 'font-bold text-text-muted/60'
                : tone === 'warn' ? 'font-black text-warning'
                    : tone === 'ok' ? 'font-black text-success' : 'font-black text-text-primary'}`}>
                {text}
            </span>
        </div>
    );
}

/**
 * 🔴 **긴 칸이 화면을 다 먹지 않게 한다.** 「영역 — 시군구별」은 30줄이 넘어서,
 *    그냥 두면 그 칸 하나 때문에 아래 칸들이 저 밑으로 밀린다 — «다 보인다»가 깨진다.
 *    넘치는 것은 **칸 안에서** 흐르게 한다.
 */
function Card({ title, note, children, tall, fold = true, defaultOpen = true }: {
    title: string; note?: string; children: React.ReactNode;
    /** 줄이 많아 제 안에서 흘러야 하는 칸 */ tall?: boolean;
    /**
     * 🔽 **열고 닫을 수 있는 칸** (기사님 지시: *"영역 — 시군구별 도 숨겨 둘수 있음
     *    좋겠어 열고 닫을수 있게 … 폰의 내용이 다 보여야 해 그것이 더 중요하니까."*).
     *
     * 🔴 **닫아도 «몇 개인가»는 제목에 남는다** — 접어서 숫자까지 사라지면 «있는 줄도 모르는»
     *    것이 된다. 그건 이 현황판이 없애려던 바로 그 상태다.
     */
    fold?: boolean;
    defaultOpen?: boolean;
}) {
    /* 🔴 **기본이 «접을 수 있음»이다** (기사님 지시: *"모든 영역은 줄였다 폈다
       할수 있게 해줘"*). 칸마다 골라 주는 것이 아니라 **전부**가 그렇다 —
       자리가 모자랄 때 무엇을 접을지는 그때그때 기사님이 정한다. */
    const [open, setOpen] = useState(defaultOpen);
    /**
     * 🎨 **목업의 아웃풋 칸과 같은 옷** — `rounded-xl border-border-card bg-background p-2.5`
     *    에 제목은 `text-info`. 지도 실험실 하단의 「🧭 국면 축」·「💰 돈 축」 칸이 그 모양이라,
     *    같은 값을 두 화면에서 볼 때 **눈이 한 번 더 배울 게 없다** (기사님 지시).
     */
    return (
        <section className="rounded-xl border border-border-card bg-background p-2.5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="text-[11px] font-black text-info">
                    {fold
                        ? <button type="button" onClick={() => setOpen(o => !o)} className="text-left">
                              <span className="mr-1">{open ? '▾' : '▸'}</span>{title}
                          </button>
                        : title}
                </h2>
                {note && <span className="text-[9px] text-text-muted text-right leading-tight whitespace-pre-line">{note}</span>}
            </div>
            {(!fold || open) && <div className={tall ? 'max-h-[228px] overflow-y-auto' : ''}>{children}</div>}
        </section>
    );
}

/* 🗑️ **지도를 찍어 내 위치를 고르는 작은 지도는 두지 않는다** (기사님 지시: *"자리가 모자란다
   찍어서 내위치 찾기는 버리자"* · *"내 위치에서 지도만 빼라고 한거야.. 주소찾기하고 집은 그냥두고"*).

   주소로 찾기 · 「🏠 집」 · 「📍 찍기」는 테스트용 구역의 `LocationPickCard` 에 있다. 서버로 보내는 문은 `publishLocation` 하나뿐이다.
   «서버가 어디를 내 자리로 아나»를 보이는 칸(📍 내 위치)은 운영센터 회원 «폰 · 필터»에 있다 —
   여기는 «🚨 어긋남»이 «집 주소로 대신 쓰는 중»을 말하는 데 쓰는 훅(`useDriverLocation`)만 남는다. */

interface DriverLoc {
    ok: boolean;
    x?: number; y?: number;
    at?: number | null;
    isFallback?: boolean;
    source?: 'gps' | 'manual' | 'home';
    reason?: string;
}

/**
 * 📍 **내 위치 — 서버가 어디를 «지금 내 자리»로 알고 있나** (기사님 지시).
 *
 * 기사님: *"내 위치가 대전으로 박혀있나봐"* — PC 로 볼 때는 GPS 가 안 오고, 그때 서버는
 * **설정의 집 주소를 조용히 대신 쓴다.** 그 사실이 **서버 로그에만** 있으면 기사님이
 * 헤매신다. 🔴 **화면이 말해야 한다** — 「🏠 집 주소로 대신」이 이 칸의 존재 이유다.
 *
 * 🔴 **여기서 위치를 들고 있지 않는다.** 서버에 묻고 그 답을 그대로 비춘다 —
 *    화면이 제 좌표를 따로 쥐면 «화면은 분당인데 서버는 대전»이 또 생긴다 (규칙 ③).
 * 🔴 **보내는 문은 `publishLocation` 하나다** (다리 경유). 여기서 `socket.emit` 을 새로
 *    내면 두 곳에서 같은 좌표를 쏜다.
 */
/**
 * 📍 **위치는 한 곳에서 묻는다** — 칸과 「🚨 어긋남」이 **같은 답**을 본다.
 *    둘이 따로 물으면 «칸은 집인데 경보는 GPS» 가 생긴다 (규칙 ③).
 */
function useDriverLocation(): DriverLoc | null {
    const [loc, setLoc] = useState<DriverLoc | null>(null);
    /* 🔴 주소를 손으로 적지 않는다 — `apiBase()` 를 거친다 (`/api` 가 두 번 붙지 않게) */
    useEffect(() => {
        let alive = true;
        const ask = async () => {
            /* 🔴 **`ok` 를 보고 나서 본문을 위치로 믿는다** — 안 보면 라이브 404 본문이 «위치»가 된다 (규칙 ④) */
            const d = await simFetch<DriverLoc>('/driver-location');
            if (alive) setLoc(d);
        };
        void ask();
        const t = setInterval(() => { void ask(); }, 5_000);   // 위치는 자주 바뀐다 — health(10초)보다 촘촘히
        return () => { alive = false; clearInterval(t); };
    }, []);
    return loc;
}

/* ════════════════════════════════════════════════════════════════════════
   🧪 **테스트용 — 어드민에는 안 간다** (기사님 지시:
      *"모의 주행과 내 위치의 주소찾기, 집주소 이렇게 3개의 모듈은 어드민때는 없어져야
        하는것들이야.. 이것만 분리해서 최 상단에 따로 섹션을 파서 넣어 주면 좋겠다."*)

   🔴 **셋의 성질이 같다 — 전부 «서버로 보내는» 것**이다. 나머지 칸은 전부 읽기만 하는데
      이 셋만 서버의 `driverLocation` 을 바꾼다. 어드민에서 관리자가 남의 차를 움직이는
      일이 있어서는 안 되므로, **한 덩어리로 모아 두고 그날 통째로 걷는다.**
   🔴 **지우는 법 — 이 구역과 `bridge.ts` 의 🧪 테스트용 줄들**(`publishLocation` · `apiClient` ·
      `useMockDriveStore`/`MOCK_DRIVE_SPEEDS` · `KM_PER_TICK` · `LAB_EVENING`), 그리고 `<TestOnlySection/>` 한 줄.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * 🎭 **모의 주행 — 스위치만 누른다**.
 *
 * 🔴 **주행 엔진은 여기 없다.** 관제웹(`useMasterGps`)이 달리고 이 칸은 **스위치만** 민다.
 * 🔴 **`available` 을 제 손으로 계산하지 않는다** — «경로가 있나»를 여기서 다시 보면
 *    두 곳이 다른 답을 낸다.
 * 🔴 **못 쓸 때 감추지 않는다** — 흐리게 두고 **왜 못 쓰는지** 적는다.
 * ⚠️ **서버까지 GPS 가 간다** — 도착 감지·마일스톤·궤적이 실제로 돈다.
 */
/**
 * 🎚️ **연기 눈금 한 칸** — 숫자를 손으로 적는 자리.
 *    🔴 **「저장」을 두지 않는다** (*"눈금은 돌리는 것이지 결재하는 것이 아니다"*) —
 *       고치는 그 자리에서 브라우저에 남는다.
 *    🔴 **빈 칸을 0 으로 읽지 않는다** — 지우는 중일 뿐이다. 숫자가 될 때만 넘긴다 (규칙 ④).
 */
function DialInput({ label, unit, value, min, max, onChange }: {
    label: string; unit: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
    return (
        <label className="flex items-center gap-1 text-[10px] font-bold text-text-muted">
            {label}
            <input type="number" value={value} min={min} max={max}
                onChange={e => {
                    const n = Number(e.target.value);
                    if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
                }}
                className="w-12 px-1 py-0.5 rounded-[6px] border border-border-hover bg-background text-[11px] font-black text-text-primary text-right" />
            {unit}
        </label>
    );
}

/**
 * 🔎 **이 눈금으로 무엇을 못 보나** (기사님 물음: *"그럼 앞으로 그 설정을
 *    바꾸면 안되는거야?"*).
 *
 * 답은 «바꿔도 된다»다 — 눈금은 돌리는 것이다. 다만 **잘못 두면 못 보는 것이 생기고,
 * 화면이 말하지 않으면 모른다.** 예: 정차를 5초로 두면 그 주행에서는 «정차» 상태가
 * 구조적으로 한 번도 안 나온다 — 이 칸이 그 사실을 적는다.
 *
 * 🔴 **판단은 여기 없다** — `dialEffect.ts`(순수 함수)가 한다. 이 칸은 **적기만** 한다.
 *    문턱(⚙️ 굳는 시간)과 걸음식(`KM_PER_TICK`·`STOP_OFF_ROAD_KM`)은 **넘겨주는 값**이라
 *    한 곳만 고치면 둘이 같이 따라온다 (규칙 ③).
 */
function DialEffect({ dwellSec, approachKm, slowFactor, speed }: {
    dwellSec: number; approachKm: number; slowFactor: number; speed: number;
}) {
    const holdSec = useSettingsStore(st => st.motionHoldSec);
    const e = dialEffectOf({ dwellSec, approachKm, slowFactor, speed, holdSec,
                             kmPerTick: KM_PER_TICK, offRoadKm: STOP_OFF_ROAD_KM });
    return (
        <div className="pt-1 text-[10px] font-bold leading-[1.45]">
            {e.dwellShort && (
                <p className="text-warning">
                    ⚠️ 정차 {dwellSec}초로는 «정차»가 안 굳는다 — ⚙️ 굳는 시간 {holdSec}초라
                    정차는 {e.requiredDwellSec}초 이상이어야 한다
                </p>
            )}
            <p className="text-text-muted">
                한 걸음 {e.cruiseKm.toFixed(1)}km{e.slows ? ` (서행 ${e.slowKm.toFixed(2)}km)` : ' · 서행 없음'}
                {' · '}정거장에 닿는 거리 {e.reachKm.toFixed(1)}km
            </p>
        </div>
    );
}

function MockDriveCard({ phase }: { phase?: string }) {
    const { available, running, speed, start, stop, setSpeed,
            dwellSec, approachKm, slowFactor, setDwellSec, setApproachKm, setSlowFactor } = useMockDriveStore();
    return (
        <Card title={running ? '🎭 모의 주행 — 도는 중' : '🎭 모의 주행'}
              note={'서버까지 GPS 가 간다'}>
            <div className="flex items-center gap-1 pb-1.5">
                {MOCK_DRIVE_SPEEDS.map(sp => (
                    <button key={sp.value} type="button" onClick={() => setSpeed(sp.value)}
                        className={`px-2 py-1 rounded-md border text-[10.5px] font-black ${speed === sp.value
                            ? 'border-info/40 bg-info/15 text-info'
                            : 'border-border-card text-text-muted hover:border-info/40'}`}>
                        {sp.label}
                    </button>
                ))}
            </div>
            <button type="button" disabled={!available}
                onClick={() => (running ? stop() : start())}
                className={`w-full px-2 py-1.5 rounded-lg border text-[11px] font-black ${!available
                    ? 'border-border-card/50 text-text-muted/40'
                    : running
                        ? 'border-success/55 bg-success/15 text-success'
                        : 'border-border-hover bg-background text-text-primary hover:border-success hover:text-success'}`}>
                {running ? '⏸ 멈춤' : '▶️ 시작'}
            </button>
            {/**
              * 🎚️ **연기 눈금 셋**.
              *    기사님: *"모의 주행의 정차시간, 서행하는 거 오른쪽 어드민에서 설정하면 좋겠는데"*
              *
              * 🔴 **⚙️ 설정의 «굳는 시간»과 다른 층이다** — 저것은 실운행에도 쓰는 제품 규칙(DB),
              *    이것은 **시뮬이 어떻게 연기하나**(브라우저)다. 한 칸에 섞으면 «시험용 값이
              *    실운행을 바꾸는» 자리가 된다 (규칙 ⑤-4 ⑤).
              * ⚠️ **정차를 11초 아래로 줄이면 정차 규칙을 못 본다** — 기본 12초는 «5km/h↓ 가 이어져야 정차»가
              *    실제로 발화할 길이다. 줄이려면 ⚙️ 설정의 「굳는 시간」도 함께 줄여야 짝이 맞는다.
              * ⚠️ 주행 중에 돌려도 된다 — 시뮬이 매 틱 «지금 값»을 읽는다.
              */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 mt-1.5 border-t border-border-card/60">
                <DialInput label="⏸️ 정차" unit="초" value={dwellSec} min={0} max={120} onChange={setDwellSec} />
                <DialInput label="🐢 서행" unit="km" value={approachKm} min={0} max={20} onChange={setApproachKm} />
                <DialInput label="÷" unit="배" value={slowFactor} min={1} max={20} onChange={setSlowFactor} />
                {/* ↩︎ 기본으로 — 얼마가 기본인지는 관제웹이 준다 (여기 숫자를 또 적지 않는다) */}
                {(dwellSec !== MOCK_DRIVE_DEFAULTS.dwellSec
                    || approachKm !== MOCK_DRIVE_DEFAULTS.approachKm
                    || slowFactor !== MOCK_DRIVE_DEFAULTS.slowFactor) && (
                    <button type="button"
                        onClick={() => {
                            setDwellSec(MOCK_DRIVE_DEFAULTS.dwellSec);
                            setApproachKm(MOCK_DRIVE_DEFAULTS.approachKm);
                            setSlowFactor(MOCK_DRIVE_DEFAULTS.slowFactor);
                        }}
                        className="ml-auto px-1.5 py-0.5 rounded-md border border-border-card text-[10px] font-black text-text-muted hover:text-info hover:border-info/40">
                        ↩︎ 기본
                    </button>
                )}
            </div>
            <DialEffect dwellSec={dwellSec} approachKm={approachKm} slowFactor={slowFactor} speed={speed} />
            {!available && <>
                {/**
                  * ✅ **켜지는 조건은 «개발 빌드 + 경로»뿐이고 국면을 안 본다** (기사님: *"출발을 해야 상차를 하지"*).
                  * 🔴 **조건이 바뀌면 이 문구도 함께 고친다** — 화면이 지난 조건을 말하면
                  *    «문서가 코드와 다른 말을 하는» 모양이 된다.
                  */}
                <Row k="지금 국면" v={phase} empty="— 모른다" />
                <Row k="켜지는 때" v="잡은 콜의 경로가 생기면 (국면은 안 본다)" tone="warn" />
            </>}
        </Card>
    );
}

/**
 * 📍 **위치 찍기 — 주소로 찾거나 집으로** (기사님:
 *    *"내 위치에서 지도만 빼라고 한거야.. 주소찾기하고 집은 그냥두고"*).
 *
 * 🔴 **집 좌표를 여기 적어 두지 않는다** — 설정(`/settings` → `home_x`·`home_y`)이 원천이다.
 *    코드에 박으면 설정의 집과 갈린다.
 * 🔴 **주소 찾기는 설정 탭과 같은 문**(`GET /settings/geocode`)이다 — 같은 주소를 두 곳에서
 *    다르게 풀면 «설정의 집»과 «여기서 찾은 집»이 갈린다 (규칙 ③).
 * 🔴 **보내는 문은 `publishLocation` 하나** — 여기서 `socket.emit` 을 새로 내면
 *    두 곳에서 같은 좌표를 쏜다.
 */
function LocationPickCard() {
    const [home, setHome] = useState<{ lng: number; lat: number; address?: string } | null>(null);
    const [addrText, setAddrText] = useState('');
    const [finding, setFinding] = useState(false);
    const [found, setFound] = useState<{ lng: number; lat: number; address: string } | null>(null);
    /** 🔴 못 찾은 이유는 **서버가 준 말 그대로** 적는다 — 여기서 지어내지 않는다 */
    const [findError, setFindError] = useState<string | null>(null);
    /** 🔴 **보냈다고 말하기 전에 실제로 나갔는지 본다** — 같은 자리면 안 나간다 */
    const [sentNote, setSentNote] = useState<string | null>(null);

    /* 🏠 집 좌표는 한 번만 읽는다 — 자주 바뀌는 값이 아니다 */
    useEffect(() => {
        let alive = true;
        apiClient.get('/settings')
            .then(r => {
                const d = r.data as { homeX?: number | null; homeY?: number | null; homeAddress?: string };
                if (alive && d.homeX != null && d.homeY != null) {
                    setHome({ lng: d.homeX, lat: d.homeY, address: d.homeAddress });
                }
            })
            .catch(() => { /* 못 읽으면 집 버튼이 잠긴다 — 지어내지 않는다 */ });
        return () => { alive = false; };
    }, []);

    const search = async () => {
        const q = addrText.trim();
        if (q.length < 2) { setFindError('주소를 두 글자 넘게 적어 주세요'); return; }
        setFinding(true); setFindError(null);
        try {
            const { data } = await apiClient.get(`/settings/geocode?address=${encodeURIComponent(q)}`);
            setFound({ lng: data.x as number, lat: data.y as number, address: (data.address as string) ?? q });
        } catch (e) {
            setFound(null);
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setFindError(msg || '주소를 못 찾았습니다');
        } finally {
            setFinding(false);
        }
    };

    const send = (lng: number, lat: number) => {
        /**
         * 📍 **`manual` 로 나간다** — 궤적에서 «배속으로 달린 가상 좌표»(`mock`)와
         *    «손으로 찍은 자리»를 **가르기 위해서다.**
         * ⚠️ **모의 주행이 도는 동안 찍은 점은 안 나간다**(`mock-running`) — 끼워 넣어도
         *    1초 뒤 시뮬 좌표가 덮으므로 궤적에 «출처 모를 한 점»만 남는다. 아래 문구가
         *    그 사실을 말한다.
         */
        const r = publishLocation(lat, lng, 'manual');
        setSentNote(r.sent ? '보냈다 · 서버는 📍 손으로 찍음으로 적는다'
            : r.reason === 'mock-running' ? '모의 주행 중 — 안 나갔다 (먼저 멈추세요)'
                : '같은 자리 — 안 나갔다');
    };

    return (
        <Card title="📍 위치 찍기" note={'서버의 내 위치를 바꾼다'}>
            <div className="flex items-center gap-1">
                <input value={addrText}
                    onChange={e => setAddrText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void search(); }}
                    placeholder="주소로 찾기 — 예: 경기 광주시 초월읍"
                    className="min-w-0 flex-1 px-1.5 py-1 rounded-[6px] border border-border-hover bg-background text-[11px] font-black text-text-primary" />
                <button type="button" onClick={() => void search()} disabled={finding}
                    className="shrink-0 px-2 py-1 rounded-md border border-border-card text-[10.5px] font-black text-text-muted hover:text-info hover:border-info/40">
                    {finding ? '찾는 중…' : '🔎 찾기'}
                </button>
            </div>
            {findError && <Row k="못 찾음" v={findError} tone="warn" />}
            {found && <Row k="찾은 주소" v={found.address} tone="ok" />}
            {sentNote && <Row k="방금 보낸 것" v={sentNote} tone={sentNote.startsWith('보냈다') ? 'ok' : 'warn'} />}
            <div className="flex items-center gap-1 pt-1">
                <button type="button" disabled={!home}
                    title={home?.address || '설정에 집 주소가 없습니다'}
                    onClick={() => home && send(home.lng, home.lat)}
                    className={`shrink-0 px-2 py-1 rounded-md border text-[10.5px] font-black ${home
                        ? 'border-border-card text-text-muted hover:text-info hover:border-info/40'
                        : 'border-border-card/50 text-text-muted/40'}`}>
                    🏠 집
                </button>
                <button type="button" disabled={!found}
                    onClick={() => found && send(found.lng, found.lat)}
                    className={`flex-1 min-w-0 px-2 py-1 rounded-md border text-[10.5px] font-black truncate ${found
                        ? 'border-info/40 bg-info/15 text-info'
                        : 'border-border-card/50 text-text-muted/40'}`}>
                    {found ? `📍 찍기 — ${found.lng.toFixed(5)}, ${found.lat.toFixed(5)}` : '📍 주소를 먼저 찾으세요'}
                </button>
            </div>
        </Card>
    );
}

type PlaceSide = 'pickup' | 'dropoff';
const PLACE_LABEL: Record<PlaceSide, string> = { pickup: '상차', dropoff: '하차' };

/**
 * 🚚 **개별콜 — 시뮬레이터 목록에 콜 한 건을 낸다** (기사님 지시 · `simCall.ts` 머리).
 *
 * 🔴 **서버가 들고 있다가 시뮬레이터가 3초마다 가져간다** — 폰 원달앱이 그 콜을 다른 콜과 똑같이 읽고·거르고·잡는다.
 *    아래 «🖐️ 콜 생성»은 서버에 바로 넣어 원달앱을 건너뛴다. 필터를 보려면 이쪽이다.
 * 🔴 **주소 찾기는 «위치 찍기»와 같은 문**(`GET /settings/geocode`)이다 (규칙 ③).
 * 🔴 **요금 단위는 받는 배차망이 정한다** — 인성·화물24시는 원, 픽커는 P.
 */
function SimCallCard() {
    const [texts, setTexts] = useState<Record<PlaceSide, string>>({ pickup: '', dropoff: '' });
    const [places, setPlaces] = useState<Record<PlaceSide, SimPlaceDraft | null>>({ pickup: null, dropoff: null });
    /** 🔴 못 찾은 이유는 서버가 준 말 그대로 — 여기서 지어내지 않는다 */
    const [placeErrors, setPlaceErrors] = useState<Record<PlaceSide, string | null>>({ pickup: null, dropoff: null });
    const [finding, setFinding] = useState<PlaceSide | null>(null);
    const [fareText, setFareText] = useState('');
    const [sending, setSending] = useState(false);
    const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);

    const find = async (side: PlaceSide) => {
        const q = texts[side].trim();
        if (q.length < 2) { setPlaceErrors(p => ({ ...p, [side]: '주소를 두 글자 넘게 적어 주세요' })); return; }
        setFinding(side); setPlaceErrors(p => ({ ...p, [side]: null }));
        try {
            const { data } = await apiClient.get(`/settings/geocode?address=${encodeURIComponent(q)}`);
            const read = placeFromFound({ address: (data.address as string) ?? q, lon: data.x as number, lat: data.y as number });
            setPlaces(p => ({ ...p, [side]: read.ok ? read.place : null }));
            if (!read.ok) setPlaceErrors(p => ({ ...p, [side]: read.why }));
        } catch (e) {
            setPlaces(p => ({ ...p, [side]: null }));
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setPlaceErrors(p => ({ ...p, [side]: msg || '주소를 못 찾았습니다' }));
        } finally {
            setFinding(null);
        }
    };

    const send = async () => {
        const built = simCallBody(places.pickup, places.dropoff, fareText);
        if (!built.ok) { setNote({ text: `— ${built.why}`, ok: false }); return; }
        setSending(true); setNote(null);
        try {
            const r = await simAsk<{ ok?: boolean; seq?: number; simPolledAgoMs?: number | null }>('/calls', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(built.body),
            });
            if (!r.ok || !r.data?.ok || typeof r.data.seq !== 'number') {
                setNote({ text: `— 서버가 안 받았다 (${r.ok ? '답이 비었다' : r.why})`, ok: false });
                return;
            }
            setNote(sentNoteOf(r.data.seq, r.data.simPolledAgoMs ?? null));
        } finally {
            setSending(false);
        }
    };

    /* 컴포넌트가 아니라 그리는 함수다 — 컴포넌트로 두면 글자를 칠 때마다 입력칸이 새로 만들어져 커서를 잃는다 */
    const placeRow = (side: PlaceSide) => {
        const found = places[side];
        const error = placeErrors[side];
        return (
            <div key={side}>
                <div className="flex items-center gap-1">
                    <span className="shrink-0 w-7 text-[10.5px] font-black text-text-muted">{PLACE_LABEL[side]}</span>
                    <input value={texts[side]}
                        onChange={e => { const v = e.target.value; setTexts(t => ({ ...t, [side]: v })); setPlaces(p => ({ ...p, [side]: null })); }}
                        onKeyDown={e => { if (e.key === 'Enter') void find(side); }}
                        placeholder="예: 경기 광주시 초월읍 경충대로 907"
                        className="min-w-0 flex-1 px-1.5 py-1 rounded-[6px] border border-border-hover bg-background text-[11px] font-black text-text-primary" />
                    <button type="button" onClick={() => void find(side)} disabled={finding !== null}
                        className="shrink-0 px-2 py-1 rounded-md border border-border-card text-[10.5px] font-black text-text-muted hover:text-info hover:border-info/40">
                        {finding === side ? '찾는 중…' : '🔎 찾기'}
                    </button>
                </div>
                {error && <Row k="못 찾음" v={error} tone="warn" />}
                {found && <Row k={`${PLACE_LABEL[side]} 동`} v={`${found.region} · ${found.lon.toFixed(5)}, ${found.lat.toFixed(5)}`} tone="ok" />}
            </div>
        );
    };

    return (
        <Card title="🚚 개별콜" note={'시뮬레이터 «🚚 개별콜» 리스트에 한 건\n폰 원달앱이 읽고 거른다'}>
            {placeRow('pickup')}
            {placeRow('dropoff')}
            <div className="flex items-center gap-1 pt-1">
                <input value={fareText} onChange={e => setFareText(e.target.value)} inputMode="numeric"
                    placeholder="요금 — 원 (픽커는 P)"
                    className="min-w-0 flex-1 px-1.5 py-1 rounded-[6px] border border-border-hover bg-background text-[11px] font-black text-text-primary" />
                <button type="button" onClick={() => void send()} disabled={sending}
                    className={`shrink-0 px-2 py-1 rounded-md border text-[10.5px] font-black ${sending
                        ? 'border-border-card/50 text-text-muted/40'
                        : 'border-info/40 bg-info/15 text-info hover:bg-info/25'}`}>
                    {sending ? '내는 중…' : '🚚 시뮬레이터에 내기'}
                </button>
            </div>
            {note && <Row k="방금 낸 것" v={note.text} tone={note.ok ? 'ok' : 'warn'} />}
        </Card>
    );
}

/**
 * 🧹 **본 콜 기억 비우기** — 서버가 회차를 올리면 폰이 다음 보고에서 «이미 본 콜» 기억을 비운다.
 *    시나리오 «▶ 시작»은 스스로 회차를 올리므로, 이 버튼은 **시나리오 없이 판을 다시 시작할 때** 쓴다.
 *    누르지 않으면 폰이 앞 판 콜을 «이미 본 콜»로 삼킨다. 시뮬레이터는 건드리지 않는다.
 */
function CallMemoryButton() {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
    const clear = async () => {
        setBusy(true);
        try {
            const r = await simAsk<{ ok?: boolean; round?: number }>('/call-memory/round', { method: 'POST' });
            setNote(r.ok && r.data.ok
                ? { ok: true, text: `회차 ${r.data.round} — 폰이 다음 보고에서 비웁니다` }
                : { ok: false, text: r.ok ? '서버가 안 받았다' : r.why });
        } finally {
            setBusy(false);
        }
    };
    return (
        <span className="ml-auto flex items-baseline gap-1.5">
            {note && <span className={`text-[9.5px] font-bold ${note.ok ? 'text-text-muted' : 'text-warning'}`}>{note.text}</span>}
            <button type="button" disabled={busy} onClick={() => void clear()}
                title="시뮬 문제지로 판을 다시 시작하기 전에 — 폰이 앞 판 콜을 ‹이미 본 콜›로 삼키지 않게"
                className="px-2 py-0.5 rounded-md border border-border-card text-[10px] font-black text-text-muted hover:text-text-primary">
                🧹 본 콜 기억 비우기
            </button>
        </span>
    );
}

/**
 * 🖐️ **콜 생성 — 앱이 쓰는 문으로 한 건 올리는 시험 도구** (기사님 지시 *"콜 생성 하면 앱에서 콜을 서버로 올리는 것과 같은 효과를 주면 된다"*).
 *    서버로 보내는 시험 도구라 🧪 테스트용 구역에 함께 둔다. 올라간 콜은 운영센터 회원 «폰 · 필터»의 «🗑️ 버린 콜»에서 본다.
 *    🔴 값은 지어내지 않는다 — `labProblems` 의 «볼트 저녁 판», 기사님이 실제로 도신 콜이다.
 */
function HandmadeCallCard() {
    /** 🖐️ 손으로 올리는 중 · 그 결과 한 줄 */
    const [making, setMaking] = useState(false);
    const [madeNote, setMadeNote] = useState<string | null>(null);
    /** 누를 때마다 문제지의 다음 콜로 간다 — 같은 콜만 쌓이면 견줄 것이 없다 */
    const [seq, setSeq] = useState(0);
    /**
     * 🖐️ **콜 하나를 손으로 올린다** (기사님 지시:
     *    *"콜 생성 하면 앱에서 콜을 서버로 올리는 것과 같은 효과를 주면 된다"*).
     *
     * 🔴 **앱이 쓰는 문을 그대로 쓴다** — `POST /api/scrap`. 다른 문을 새로 파면
     *    «앱으로는 되는데 버튼으로는 안 된다»가 생긴다 (규칙 ③).
     * 🔴 **기기는 등록된 것을 빌린다** — 그 문은 등록된 `deviceId` 가 아니면 401 이다.
     *    없으면 **없다고 말한다** — 아무 값이나 지어 보내지 않는다 (규칙 ④).
     * ⚠️ **이것은 «콜을 잡는 것»이 아니다** — 결재 카드가 아니라 이 줄에 뜬다.
     */
    const makeOne = async () => {
        setMaking(true); setMadeNote(null);
        try {
            const { data } = await apiClient.get('/devices/registered');
            const deviceId = (data?.devices ?? [])[0]?.device_id as string | undefined;
            if (!deviceId) { setMadeNote('— 등록된 기기가 없다. ⚙️ 설정에서 PIN 연동을 먼저 한다'); return; }

            const calls = callStepsOf(LAB_EVENING);
            const order = handmadeOrderFrom(calls[seq % calls.length], new Date(), seq);
            if (!order) { setMadeNote('— 문제지 줄을 못 읽었다 (labProblems 의 꼴이 바뀌었다)'); return; }

            const r = await fetch(`${apiBase()}/scrap`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, data: [order], screenContext: 'LIST', isHolding: false }),
            });
            if (!r.ok) { setMadeNote(`— 서버가 안 받았다 (HTTP ${r.status})`); return; }

            setSeq(n => n + 1);
            setMadeNote(`✅ ${order.pickup} → ${order.dropoff} · ${wonText(order.fare)}`);
        } catch {
            setMadeNote('— 서버에 못 닿았다');
        } finally {
            setMaking(false);
        }
    };

    return (
        <Card title="🖐️ 콜 생성" note={'앱이 쓰는 문(POST /api/scrap)\n콜을 «잡는» 것은 아니다'}>
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => { void makeOne(); }} disabled={making}
                    className={`px-2 py-1 rounded-md border text-[10.5px] font-black shrink-0 ${making
                        ? 'border-border-card/50 text-text-muted/40'
                        : 'border-info/40 bg-info/10 text-info hover:bg-info/20'}`}>
                    {making ? '올리는 중…' : '🖐️ 콜 생성'}
                </button>
                <span className={`min-w-0 flex-1 truncate text-[10.5px] font-bold ${
                    madeNote?.startsWith('✅') ? 'text-success' : madeNote ? 'text-warning' : 'text-text-muted'}`}>
                    {madeNote ?? '앱이 쓰는 문으로 한 건 올린다 (콜을 «잡는» 것은 아니다)'}
                </span>
            </div>
        </Card>
    );
}


/**
 * 🧪 **테스트용 구역 — 맨 위에 따로 선다** (기사님 지시).
 *    이 구역의 셋만 **서버를 바꾸고**, 아래 줄들은 읽기만 한다 (예외: «버린 콜» 칸 아래 «🖐️ 콜 생성»).
 *    어드민으로 옮기는 날 **이 구역째** 걷는다.
 */
function TestOnlySection({ phase }: { phase?: string }) {
    /**
     * 🚪 **문이 닫힌 서버(라이브)에서는 이 구역이 통째로 없다** — 서버 `isDevBuild()` 와 짝이다.
     *    여기 칸은 **전부 시뮬 전용 문으로만 산다.** 라이브에 세워 두면 영영 못 쓰는 칸이
     *    좁은 현황판의 자리를 차지하고, 5초·1.5초마다 404 를 두드린다.
     * ⚠️ `unknown`(아직 안 물어봄) 에서는 **세운다** — 세워야 물어보고, 물어봐야 답을 안다.
     */
    if (useSimDoor() === 'closed') return null;
    return (
        <div className="shrink-0 border-b border-border-card px-2 pt-1.5 pb-2">
            <div className="flex items-baseline gap-2 px-1 pb-1">
                <h2 className="text-[11px] font-black text-warning">🧪 테스트용</h2>
                <span className="text-[9px] text-text-muted">서버를 바꾼다 · 어드민에는 안 간다</span>
                <CallMemoryButton />
            </div>
            <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[240px]"><MockDriveCard phase={phase} /></div>
                <div className="flex-1 min-w-[240px]"><LocationPickCard /></div>
                <div className="flex-1 min-w-[240px]"><SimCallCard /></div>
                <div className="flex-1 min-w-[240px]"><HandmadeCallCard /></div>
            </div>
            {/* 🎬 시나리오콜 — 줄이 길어 한 줄을 통째로 쓴다 */}
            <div className="pt-2"><ScenarioCard scenarioKey="icheonRound" title="이천 왕복 하루" /></div>
            {/* 🎬 빨리 도는 문제 — 성공하는 콜 다섯 (기사님 «이천 왕복하루 아래에») */}
            <div className="pt-2"><ScenarioCard scenarioKey="icheonFive" title="이천 성공하는 5콜" /></div>
            {/* 🎬 실전 판정 및 버그 종합 검증 — 강남 진입과 광주 복귀 5콜 */}
            <div className="pt-2"><ScenarioCard scenarioKey="gangnamFive" title="강남 진입과 광주 복귀 5콜" /></div>
        </div>
    );
}

/**
 * 🔴 **`Dashboard` 가 콜 목록을 넘기지만 안 읽는다** — 콜 목록을 쓰는 «🗑️ 버린 콜» · «⚖️ 심사 중»은 운영센터 회원 «폰 · 필터»에 있다.
 *    받는 모양만 둔다 — 걷으려면 `Dashboard.tsx` 의 한 줄을 고쳐야 하는데 이 폴더 밖이라 따로 한다.
 */
interface Props { activeRoute?: SecuredOrder[] }

export default function StatusBoard(_props: Props) {
    const { filter } = useFilterConfig();
    const devices = useDeviceStore(st => st.devices);
    const [health, setHealth] = useState<Health | null>(null);
    const driverLoc = useDriverLocation();
    /**
     * 📍 **서버가 아는 «내 자리»를 보여 준다 — 읽기만 한다**.
     *    🔴 지도·그물은 이 값을 **아직 안 쓴다** — 이으려다 모의 주행이 멈췄고, 그물 재계산
     *       위험도 걸렸다 (`useRouteDerivations` 의 🗑️ 주석). **여기서 하루 보고 나서** 잇는다.
     *    ⚠️ 구독을 여기서 건다 — 지도 쪽이 손을 뗐으므로 듣는 곳이 이 한 곳이다.
     */
    useEffect(() => { ensureDriverPositionSubscribed(); }, []);
    const driverPos = useDriverPositionStore();

    /**
     * 🖥️ **지금 무엇이 돌고 있나** — 이 레포가 반복해서 잃은 시간의 원인이다
     *    (루트 README.md). 10초마다 다시 묻는다 — 서버가 재기동되면 바로 보이게.
     */
    useEffect(() => {
        let alive = true;
        const ask = async () => {
            try {
                const r = await fetch(`${apiBase()}/health`);
                if (alive) setHealth(await r.json() as Health);
            } catch { if (alive) setHealth(null); }
        };
        ask();
        const t = setInterval(ask, 10_000);
        return () => { alive = false; clearInterval(t); };
    }, []);

    const mismatch = (() => {
        /* 📢 **고장이 아닌데 알아야 하는 것** — 빨간 줄과 섞지 않는다 (오탐이 쌓이면 아무도 안 본다) */
        const note: { k: string; v: string }[] = [];
        const bad: { k: string; v: string }[] = [];
        /**
         * 📍 **경로 기점과 내 자리가 왜 다른가**.
         *
         * 🔴 **둘이 다른 것은 고장이 아닐 수 있다.** `originOf` 는 좌표가 5분 넘게
         *    낡으면 **집**을 고른다 — 콜 없이 모의 주행을 돌리면 «기점은 집,
         *    내 자리는 이천»이 **정상**이다. 그걸 거리로 재서 빨간 줄을 띄우면
         *    **오탐이 반복되고, 그러면 진짜 어긋남이 왔을 때 아무도 안 본다.**
         * 🔴 그래서 **`isFallback` 이면 어긋남이 아니라 «알림»**으로 적는다 —
         *    «경로를 집에서 짜는 중»은 알아야 하는 사실이지 고장이 아니다.
         */
        const pos = driverPos.myPosition, org = driverPos.routeOrigin;
        if (org?.isFallback) {
            note.push({ k: '경로 기점', v: '🏠 집에서 짜는 중 — 좌표가 5분 넘게 안 왔다' });
        } else if (pos && org) {
            const km = haversineKm(pos, org);
            if (km > 1) bad.push({ k: '지도 ↔ 경로', v: `${km.toFixed(1)}km 어긋났다` });
        }
        if (pos?.isStale) {
            note.push({ k: '내 위치', v: `${Math.round(pos.ageMs / 60000)}분 전 자리 — 흐리게 그린다` });
        }
        if (!health) bad.push({ k: '서버', v: '못 붙었다 — 로그가 조용하면 다른 서버를 보는 것' });
        if (!filter) bad.push({ k: '필터', v: '소켓으로 아직 안 왔다' });
        else {
            if (filter.isActive === false) bad.push({ k: '콜 잡기', v: '꺼져 있다 (isActive=false)' });
            /* 🔴 «빈 필터는 제한 없음이 아니라 고장이다» (규칙 ④) */
            if (!filter.destinationCity) bad.push({ k: '목적지', v: '비어 있다 — 첫짐이 성립하지 않는다' });
            if (!filter.destinationKeywords?.length) bad.push({ k: '그물', v: '동이 0개다 — 빈 필터는 고장이다' });
        }
        if (driverLoc?.source === 'home') bad.push({ k: '내 위치', v: '집 주소로 대신 쓰는 중 — GPS 가 안 온다' });
        if (devices.length === 0) bad.push({ k: '폰', v: '붙은 폰이 없다' });
        /**
         * 🧭 **폰들이 같은 필터를 들고 있나** (서버가 남긴 지문으로 본다).
         *    필터는 **한 벌**인데 받는 시각은 폰마다 다르다 — 한 폰만 지난 필터를 들고 돌면
         *    그 폰은 **다른 조건으로 콜을 거른다.** 여기서 안 드러내면 화면 어디에도 안 보인다.
         */
        const versions = new Set(devices.map(d => d.filterVersion).filter(Boolean));
        if (versions.size > 1) {
            bad.push({ k: '필터 판', v: `폰마다 다르다 (${versions.size}종) — 한 폰이 옛 판으로 거른다` });
        }
        devices.forEach(d => {
            const name = deviceLabel(d);
            if (d.status === 'OFFLINE') bad.push({ k: `폰 ${name}`, v: '오프라인' });
            else {
                const quiet = Math.round((Date.now() - d.lastSeen) / 1000);
                if (quiet > 90) bad.push({ k: `폰 ${name}`, v: `${quiet}초째 조용하다` });
                if (d.screenNodeCount === 0) bad.push({ k: `폰 ${name}`, v: '화면을 못 읽는다 (노드 0)' });
                if (d.isScreenOn === false) bad.push({ k: `폰 ${name}`, v: '화면이 꺼져 있다 — 스크래핑이 멈춘다' });
            }
        });
        return (
            <Card title={bad.length ? `🚨 어긋남 — ${bad.length}건` : '✅ 어긋남 없음'}
                  note={'다른 칸의 값끼리 대조만 한다'}>
                {bad.length === 0
                    ? <Row k="지금" v="서버 · 필터 · 폰 모두 짝이 맞는다" tone="ok" />
                    : bad.map((b, i) => <Row key={`${b.k}${i}`} k={b.k} v={b.v} tone="warn" />)}
                {/* 📢 알림 — 고장은 아니지만 «왜 이런가»를 설명하는 줄 */}
                {note.map((n, i) => <Row key={`n${n.k}${i}`} k={n.k} v={n.v} />)}
            </Card>
        );
    })();

    return (
        <aside
            /**
             * 🔴 **원본과 «형제»다** (기사님 지시: *"원본에는 어떤 영향도 없어야해..
             *    div 로 완벽하게 분리해줘"*). 부모(`Dashboard`)가 좌우로 갈라 주므로
             *    여기서는 **제 칸만 채운다** — `fixed` 도 `calc(100vw…)` 도 쓰지 않는다.
             *
             * 🔴 `fixed` 로 원본 위에 얹으면 **헤더가 어긋난다** — 겹쳐 놓는 것은
             *    원본을 건드리는 것이다.
             */
            className="h-full w-full bg-background"
        >
            <div className="h-full flex flex-col">
                <div className="shrink-0 px-2.5 py-1.5 border-b border-border-card flex items-baseline gap-2">
                    <span className="text-[11px] font-black text-text-primary">🔬 같은 것을 본다</span>
                    <span className="text-[9px] text-text-muted">폰에서는 안 뜹니다</span>
                </div>
                {/* 🧪 테스트용 구역 — 어드민 이사 때 이 한 줄과 위 구역을 함께 걷는다 */}
                <TestOnlySection phase={filter?.dispatchPhase} />

                {/* 🚨 **어긋남 한 칸** — 값 카드들(서버 · 앱 · 버린 콜 · 심사 중 · 폰)은 운영센터 회원 «폰 · 필터» 칸에 있다.
                    이 칸은 관제웹에서만 볼 수 있는 대조(지도 ↔ 경로 · 이 화면의 필터 · 붙은 폰)라 남는다 */}
                <div className="flex-1 min-h-0 overflow-y-auto p-2">{mismatch}</div>
            </div>
        </aside>
    );
}
