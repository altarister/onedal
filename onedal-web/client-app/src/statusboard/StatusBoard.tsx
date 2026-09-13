/**
 * 🔬 **곁 패널 — 기사님과 내가 «같은 것»을 보는 화면** (2026-09-11 신설).
 *
 * 기사님: *"내가 볼때 너랑 나랑 같은걸 보고 있어야 될꺼 같단 말이지."*
 *
 * 그날 하루에 셋이 어긋났고 **전부 다른 것을 보고 있어서**였다:
 *   · 「그물이 도는가」 — 나는 서버 로그(954개), 기사님은 화면(241개). 국면이 달랐다
 *   · 「현위치 범위가 안 보인다」 — 기사님은 지도, 나는 코드. 답은 «노선/동선 토글이 없다»
 *   · 「목업엔 국면이 없는데」 — 나는 계획서, 기사님은 목업. 계획서가 틀렸다
 * 셋 다 **같은 화면을 보고 있었으면 30초**였을 일이다.
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
 *    (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」 — 이 레포가 네 번 당한 모양).
 * ─────────────────────────────────────────────────────────────
 *
 * 자리: 무대는 `max-w-2xl`(672px)이고 **패널이 설 때만 왼쪽에 붙는다**(`Dashboard`).
 *       패널은 그 오른쪽 전부를 쓰되 **원본과 형제**로 선다 — 겹치지 않으니 무대는 그대로다.
 *       그 안은 다시 **둘**이다: 🖥️ 서버(심사·통신·저장) · 📱 앱(올라온 보고·내려갈 값).
 */
import { useEffect, useRef, useState } from 'react';
import { APP_FILTER_KEYS, FILTER_FIELDS, isEvaluating, isTerminal, workStageLabel, isModeApplying,
         DEVICE_MODE_LABEL } from '@onedal/shared';
import type { SecuredOrder, DeviceSession, DeviceModeType } from '@onedal/shared';
/* 🌉 관제웹 안쪽은 **다리 하나**로만 본다 — 옮길 때 `bridge.ts` 만 새로 쓰면 된다 */
import { LAB_EVENING,
         useFilterConfig, useDeviceStore, summarizeTally, apiBase,
         useMockDriveStore, MOCK_DRIVE_SPEEDS, MOCK_DRIVE_DEFAULTS, publishLocation, apiClient,
         useDriverPositionStore, ensureDriverPositionSubscribed,
         useSettingsStore, KM_PER_TICK, STOP_OFF_ROAD_KM } from './bridge';
/* ⚖️ **앱이 내린 판정을 읽는다** — 여기서 다시 재지 않는다 (`callVerdict.ts` 머리 참조).
   2026-09-12 에 사본(`recheck.ts`)을 지우고 이것으로 갈아탔다 */
import { viewAll, tallyMarks, MARK_SIGN } from './callVerdict';
import { callStepsOf, handmadeOrderFrom, isHandmade } from './handmadeCall';
/* 🎚️ **눈금이 무엇을 못 보게 하나 — 판단은 순수 함수가 한다** (`dialEffect.ts` 머리 참조) */
import { dialEffectOf } from './dialEffect';
/* 🔴 서버 주소를 손으로 적지 않는다 — `apiBase()` 를 거친다.
   2026-09-07 에 `/api` 가 두 번 붙어 실경로가 늘 직선으로 그려진 사고가 있었다 */

/**
 * 칸 하나의 **최소** 폭. 격자가 이 폭을 기준으로 «몇 열이 들어가나»를 정하고,
 * 남는 자리는 칸들이 나눠 갖는다. 넘치는 칸은 **아래로 흐른다.**
 *
 * 🔴 **가로 스크롤을 버렸다** (기사님 지시 2026-09-11: *"왼쪽의 모듈들이 다 보였으면
 *    좋겠어. 항상 윈도우를 풀사이즈로 하는건 힘들어"*). 가로로만 흐르면 창이 작을 때
 *    칸이 **숨는다** — 있는 줄도 모른다. 아래로 쌓으면 휠 한 번에 다 지나간다.
 *    (가로 스크롤은 «지도를 가리지 않으려고» 뒀던 것인데, 원본과 형제가 된 뒤로
 *     가릴 일이 없어져 이유가 사라졌다)
 */
const COL_MIN = 280;

/**
 * 🖥️📱 **두 쪽 — 왼쪽은 서버, 오른쪽은 앱** (기사님 지시 2026-09-11:
 * *"왼쪽은 서버랑 관련된거, 심사하고, 통신하고, 저장하고 그런것들을 담아 주고
 * 오른쪽은 앱에서 주로 일어나서 서버에게 보고하는것, 서버가 내려주는것들"*).
 *
 * ⚠️ 전에는 칸 여덟이 **한 덩어리로 흘렀다**(신문 단). 빈틈은 없었지만 기사님 말씀대로
 *    *"핀터레스트 같은 구조라 뭐가 어디 있는지 모르겠어"* — 창 폭이 바뀌면 칸이 **자리를 옮겨서**,
 *    찾던 것이 매번 다른 데 있었다. 이제 **어느 쪽인지가 먼저** 정해지고, 흐르는 것은
 *    그 쪽 **안에서만** 흐른다.
 *
 * 🔴 **가르는 축은 «누가 그 값을 만드나»다** — 서버가 제 안에서 쥔 것(심사·통신·저장) ↔
 *    앱과 **주고받는 것**(앱이 올린 보고 · 앱에 내려갈 값). 화면 자리로 가르면 칸이 늘 때마다
 *    또 흔들린다.
 */
const SIDES = [
    { key: 'server', title: '🖥️ 서버', note: '심사 · 통신 · 저장' },
    { key: 'app', title: '📱 앱', note: '앱이 올린 보고 · 앱에 내려갈 값' },
    /**
     * 🗑️ **버린 콜은 제 줄을 갖는다** (기사님 지시 2026-09-12: *"그냥 한 줄로 만들고
     *    오른쪽에 한 줄 더 파서 서버가 받은 버린콜들의 리스트를 보여주는 공간으로"*).
     *
     * 🔴 **다른 칸과 성질이 다르다** — 나머지는 «지금 한 벌»이라 몇 줄이면 끝나는데,
     *    이것은 **계속 쌓이는 목록**이다. 한 칸에 우겨 넣으면 스크롤 상자 안의 스크롤이 되고,
     *    그러면 «얼마나 올라왔나»가 눈에 안 들어온다.
     */
    { key: 'intel', title: '🗑️ 버린 콜', note: '서버가 받은 것 그대로' },
] as const;
type Side = typeof SIDES[number]['key'];

interface Health {
    bootedAt?: string;
    git?: { commit?: string; branch?: string };
    [k: string]: unknown;
}

/**
 * 🏷️ 한 줄 — 이름과 값. 값이 없으면 «—» 로 두고 **지어내지 않는다** (규칙 ④).
 *
 * 🎨 **모양은 지도 목업의 `OutKv` 를 따른다** (기사님 지시 2026-09-11: *"지도 목업파일이
 *    있거든 그거보고 ui / ux , 디자인을 참고해서 일관되게"*). 이름은 왼쪽에 흐리게,
 *    값은 **오른쪽 끝에 진하게** — 값이 한 줄에 맞춰 서면 «무엇이 비었나»가 훑기만 해도 보인다.
 *    (전에는 이름칸이 92px 고정이고 값이 왼쪽이라, 칸마다 값의 시작점이 달랐다)
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
     * 🔽 **열고 닫을 수 있는 칸** (기사님 지시 2026-09-11: *"영역 — 시군구별 도 숨겨 둘수 있음
     *    좋겠어 열고 닫을수 있게 … 폰의 내용이 다 보여야 해 그것이 더 중요하니까."*).
     *
     * 🔴 **닫아도 «몇 개인가»는 제목에 남는다** — 접어서 숫자까지 사라지면 «있는 줄도 모르는»
     *    것이 된다. 그건 이 현황판이 없애려던 바로 그 상태다.
     */
    fold?: boolean;
    defaultOpen?: boolean;
}) {
    /* 🔴 **기본이 «접을 수 있음»이다** (기사님 지시 2026-09-12: *"모든 영역은 줄였다 폈다
       할수 있게 해줘"*). 칸마다 골라 주는 것이 아니라 **전부**가 그렇다 —
       자리가 모자랄 때 무엇을 접을지는 그때그때 기사님이 정한다. */
    const [open, setOpen] = useState(defaultOpen);
    /**
     * 🎨 **목업의 아웃풋 칸과 같은 옷** — `rounded-xl border-border-card bg-background p-2.5`
     *    에 제목은 `text-info`. 지도 실험실 하단의 「🧭 국면 축」·「💰 돈 축」 칸이 그 모양이라,
     *    같은 값을 두 화면에서 볼 때 **눈이 한 번 더 배울 게 없다** (기사님 지시 2026-09-11).
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

/** 📏 두 점 사이 km — **판정이 아니라 «얼마나 다른가»를 적으려는 표시다** */
function haversineKmOf(a: { x: number; y: number }, b: { x: number; y: number }): number {
    const R = 6371, rad = (d: number) => d * Math.PI / 180;
    const dLat = rad(b.y - a.y), dLon = rad(b.x - a.x);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.y)) * Math.cos(rad(b.y)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

/** 🕐 시각을 사람이 읽는 모양으로 — **표시**일 뿐 값을 만드는 것이 아니다 */
function clockOf(ms?: number): string | undefined {
    return ms ? new Date(ms).toLocaleTimeString('ko-KR', { hour12: false }) : undefined;
}

/**
 * ⏱️ **얼마나 지났나** — 「지금 위치」라 믿을 수 있는 좌표인지는 **나이**가 답한다.
 *    2026-08-25 에 낡은 좌표를 지금 자리로 믿어 경로를 40km 뒤에서 그린 사고가 있었다.
 */
function agoOf(at?: number | null): string | undefined {
    if (!at) return undefined;
    const sec = Math.round((Date.now() - at) / 1000);
    if (sec < 60) return `${sec}초 전`;
    if (sec < 3600) return `${Math.round(sec / 60)}분 전`;
    return `${Math.round(sec / 3600)}시간 전`;
}

/**
 * 🕐 **이 나이를 넘으면 눈에 걸리게 한다** — 판정에 쓰는 값이 **아니다.**
 *    서버는 이 숫자를 모르고, 여기서 콜을 거르지도 않는다. 오직 «이 좌표를 지금 자리로
 *    믿어도 되나»를 기사님 눈에 띄게 하는 **표시 기준**이다 (규칙 ⑤-4 ①: 판정값이면 DB 로 간다).
 */
const LOCATION_STALE_SEC = 300;

/** 📍 좌표의 출처를 사람 말로 — **«대신 쓰는 중»을 반드시 적는다** */
const LOCATION_SOURCE_LABEL: Record<string, string> = {
    gps: '📡 GPS',
    /* 🧪 **모의 주행은 «GPS» 가 아니다** — 서버가 2026-09-12 에 출처를 «온 그대로» 남기기
       시작하면서 이 값이 실제로 온다 (`driverLocationSource`). 가상 좌표를 진짜로 읽으면
       경로가 통째로 헛것이 된다 (2026-08-14 파주 156km 사고). */
    mock: '🧪 모의 주행',
    manual: '📍 손으로 찍음',
    home: '🏠 집 주소로 대신',
};

/* 🗑️ **«찍어서 내 위치 찾기»는 버렸다** (기사님 지시 2026-09-12: *"자리가 모자란다
   찍어서 내위치 찾기는 버리자"*).

   여기 있던 것 — OSM 타일을 그리는 작은 지도(`PickMap`) · 지도 클릭으로 좌표 고르기 ·
   주소로 찾기(`GET /settings/geocode`) · 「🏠 집」/「📍 찍기」 두 버튼.
   ⚠️ **표시는 남긴다** — 이 칸이 생긴 이유는 «집 주소로 대신 쓰는 중»을 화면이 말하게 하는
      것이었고, 그건 찍는 기능과 무관하다. 버린 것은 **보내는 쪽**뿐이다.
   🔴 되살릴 일이 생기면 이 자리에 다시 만든다 — 서버로 보내는 문은 `publishLocation`
      하나뿐이니 그것을 다리에 다시 얹으면 된다 (2026-09-11 판 참조). */

interface DriverLoc {
    ok: boolean;
    x?: number; y?: number;
    at?: number | null;
    isFallback?: boolean;
    source?: 'gps' | 'manual' | 'home';
    reason?: string;
}

/**
 * 📍 **내 위치 — 서버가 어디를 «지금 내 자리»로 알고 있나** (기사님 지시 2026-09-11).
 *
 * 기사님: *"내 위치가 대전으로 박혀있나봐"* — PC 로 볼 때는 GPS 가 안 오는데, 그때 서버가
 * **설정의 집 주소로 조용히 대신 쓰고 있었다.** 그 사실이 **서버 로그에만** 있어서 한참을
 * 헤매셨다. 🔴 **화면이 말해야 한다** — 「🏠 집 주소로 대신」이 이 칸의 존재 이유다.
 *
 * 🔴 **여기서 위치를 들고 있지 않는다.** 서버에 묻고 그 답을 그대로 비춘다 —
 *    화면이 제 좌표를 따로 쥐면 «화면은 분당인데 서버는 대전»이 또 생긴다 (규칙 ③).
 * 🔴 **보내는 문은 `publishLocation` 하나다** (다리 경유). 여기서 `socket.emit` 을 새로
 *    내면 2026-08-14 의 «두 곳에서 쏘던» 사고가 되살아난다.
 */
/**
 * 📍 **위치는 한 곳에서 묻는다** — 칸과 「🚨 어긋남」이 **같은 답**을 본다.
 *    둘이 따로 물으면 «칸은 집인데 경보는 GPS» 가 생긴다 (규칙 ③).
 */
function useDriverLocation(): DriverLoc | null {
    const [loc, setLoc] = useState<DriverLoc | null>(null);
    /* 🔴 주소를 손으로 적지 않는다 — `apiBase()` 를 거친다 (2026-09-07 이중 접두 사고) */
    useEffect(() => {
        let alive = true;
        const ask = async () => {
            try {
                const r = await fetch(`${apiBase()}/sim/driver-location`);
                if (alive) setLoc(await r.json() as DriverLoc);
            } catch { if (alive) setLoc(null); }
        };
        void ask();
        const t = setInterval(() => { void ask(); }, 5_000);   // 위치는 자주 바뀐다 — health(10초)보다 촘촘히
        return () => { alive = false; clearInterval(t); };
    }, []);
    return loc;
}

function DriverLocationCard({ loc }: { loc: DriverLoc | null }) {
    const ago = agoOf(loc?.at);
    const stale = loc?.at != null && Date.now() - loc.at > LOCATION_STALE_SEC * 1000;
    const src = loc?.source;
    /* 🔴 출처를 모르면 «모른다»고 적는다 — 지어내지 않는다 (규칙 ④) */
    const srcText = loc?.ok === false ? undefined : src ? (LOCATION_SOURCE_LABEL[src] ?? src) : undefined;

    return (
        <Card title="📍 내 위치" note={'서버가 쥔 것\n5초마다 다시 묻는다'}>
            <Row k="출처" v={srcText} empty={loc?.reason ?? '— 서버에 못 물었다'}
                 tone={src === 'gps' ? 'ok' : 'warn'} />
            <Row k="좌표" v={loc?.x != null && loc?.y != null ? `${loc.x.toFixed(5)}, ${loc.y.toFixed(5)}` : undefined} />
            <Row k="받은 시각" v={loc?.at ? `${clockOf(loc.at)} · ${ago}` : undefined}
                 empty="— 모름 (받은 적 없다)" tone={stale ? 'warn' : loc?.at ? 'ok' : 'warn'} />
        </Card>
    );
}

/* ════════════════════════════════════════════════════════════════════════
   🧪 **테스트용 — 어드민에는 안 간다** (기사님 지시 2026-09-12:
      *"모의 주행과 내 위치의 주소찾기, 집주소 이렇게 3개의 모듈은 어드민때는 없어져야
        하는것들이야.. 이것만 분리해서 최 상단에 따로 섹션을 파서 넣어 주면 좋겠다."*)

   🔴 **셋의 성질이 같다 — 전부 «서버로 보내는» 것**이다. 나머지 칸은 전부 읽기만 하는데
      이 셋만 서버의 `driverLocation` 을 바꾼다. 어드민에서 관리자가 남의 차를 움직이는
      일이 있어서는 안 되므로, **한 덩어리로 모아 두고 그날 통째로 걷는다.**
   🔴 **지우는 법 — 이 구역과 `bridge.ts` 의 셋**(`publishLocation` · `apiClient` ·
      `useMockDriveStore`/`MOCK_DRIVE_SPEEDS`), 그리고 `<TestOnlySection/>` 한 줄.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * 🎭 **모의 주행 — 스위치만 누른다** (관제웹 의뢰서 `docs/의뢰/현황판_모의주행_버튼.md`).
 *
 * 🔴 **주행 엔진은 여기 없다.** 관제웹(`useMasterGps`)이 달리고 이 칸은 **스위치만** 민다.
 * 🔴 **`available` 을 제 손으로 계산하지 않는다** — «경로가 있나»를 여기서 다시 보면
 *    두 곳이 다른 답을 낸다 (의뢰서 🔴).
 * 🔴 **못 쓸 때 감추지 않는다** — 흐리게 두고 **왜 못 쓰는지** 적는다.
 * ⚠️ **서버까지 GPS 가 간다** — 도착 감지·마일스톤·궤적이 실제로 돈다.
 */
/**
 * 🎚️ **연기 눈금 한 칸** — 숫자를 손으로 적는 자리.
 *    🔴 **「저장」을 두지 않는다** (의뢰서: *"눈금은 돌리는 것이지 결재하는 것이 아니다"*) —
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
 * 🔎 **이 눈금으로 무엇을 못 보나** (기사님 물음 2026-09-12: *"그럼 앞으로 그 설정을
 *    바꾸면 안되는거야?"*).
 *
 * 답은 «바꿔도 된다»다 — 눈금은 돌리는 것이다. 다만 **잘못 두면 못 보는 것이 생기는데
 * 화면이 그걸 말해 주지 않았다.** 기사님이 정차 5초로 한 판을 도셨고, 그 판에서는
 * «정차» 상태가 구조적으로 한 번도 안 나온다 — 그런데 어디에도 그 사실이 없었다.
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
              * 🎚️ **연기 눈금 셋** (관제웹 의뢰서 `현황판_모의주행_눈금.md` · 2026-09-12).
              *    기사님: *"모의 주행의 정차시간, 서행하는 거 오른쪽 어드민에서 설정하면 좋겠는데"*
              *
              * 🔴 **⚙️ 설정의 «굳는 시간»과 다른 층이다** — 저것은 실운행에도 쓰는 제품 규칙(DB),
              *    이것은 **시뮬이 어떻게 연기하나**(브라우저)다. 한 칸에 섞으면 «시험용 값이
              *    실운행을 바꾸는» 자리가 된다 (규칙 ⑤-4 ⑤).
              * ⚠️ **정차를 줄이면 정차 규칙을 못 본다** — 18초는 «5km/h↓ 가 이어져야 정차»가
              *    실제로 발화할 길이다. 줄이려면 ⚙️ 설정의 「굳는 시간」도 함께 줄여야 짝이 맞는다.
              * ⚠️ 주행 중에 돌려도 된다 — 시뮬이 매 틱 «지금 값»을 읽는다 (의뢰서 4).
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
                  * ✅ **순환이 풀렸다** (관제웹 `d1a3cc0`) — 기사님이 *"출발을 해야 상차를 하지"*
                  *    라고 짚으신 자리다. 이제 조건은 «개발 빌드 + 경로»뿐이고 국면을 안 본다.
                  * 🔴 **조건이 바뀌면 이 문구도 함께 고친다** — 화면이 옛 조건을 말하면
                  *    그게 이 레포가 여러 번 당한 «문서가 코드와 다른 말을 하는» 모양이다.
                  */}
                <Row k="지금 국면" v={phase} empty="— 모른다" />
                <Row k="켜지는 때" v="잡은 콜의 경로가 생기면 (국면은 안 본다)" tone="warn" />
            </>}
        </Card>
    );
}

/**
 * 📍 **위치 찍기 — 주소로 찾거나 집으로** (기사님 2026-09-12:
 *    *"내 위치에서 지도만 빼라고 한거야.. 주소찾기하고 집은 그냥두고"*).
 *
 * 🔴 **집 좌표를 여기 적어 두지 않는다** — 설정(`/settings` → `home_x`·`home_y`)이 원천이다.
 *    2026-08-12 에 관제웹이 집 좌표를 코드에 박아 두고 «판교»라 주석을 단 적이 있다.
 * 🔴 **주소 찾기는 설정 탭과 같은 문**(`GET /settings/geocode`)이다 — 같은 주소를 두 곳에서
 *    다르게 풀면 «설정의 집»과 «여기서 찾은 집»이 갈린다 (규칙 ③).
 * 🔴 **보내는 문은 `publishLocation` 하나** — 여기서 `socket.emit` 을 새로 내면 2026-08-14 의
 *    «두 곳에서 쏘던» 사고가 되살아난다.
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
         * 📍 **`manual` 로 나간다** (2026-09-12 · 서버 지적으로 낱말이 열렸다).
         *
         * 🔴 전에는 `'mock'` 으로 보냈다 — 낱말이 없어서였다. 그래서 궤적에서 «배속으로
         *    달린 가상 좌표»와 «손으로 찍은 자리»를 **가를 수 없었다.** 화면은 그 사실을
         *    적고는 있었지만(규칙 ④), **값은 여전히 틀린 채**였다 — 적어 두는 것은
         *    고치는 것이 아니다.
         * ⚠️ **낱말을 바로잡으면서 문 하나가 닫혔다** — 모의 주행이 도는 동안 찍은 점은
         *    이제 안 나간다(`mock-running`). `'mock'` 이던 때는 열려 있었는데, 끼워 넣어도
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

/**
 * 🧪 **테스트용 구역 — 맨 위에 따로 선다** (기사님 지시 2026-09-12).
 *    이 구역의 둘만 **서버를 바꾸고**, 아래 세 줄은 전부 읽기만 한다.
 *    어드민으로 옮기는 날 **이 구역째** 걷는다.
 */
function TestOnlySection({ phase }: { phase?: string }) {
    return (
        <div className="shrink-0 border-b border-border-card px-2 pt-1.5 pb-2">
            <div className="flex items-baseline gap-2 px-1 pb-1">
                <h2 className="text-[11px] font-black text-warning">🧪 테스트용</h2>
                <span className="text-[9px] text-text-muted">서버를 바꾼다 · 어드민에는 안 간다</span>
            </div>
            <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[240px]"><MockDriveCard phase={phase} /></div>
                <div className="flex-1 min-w-[240px]"><LocationPickCard /></div>
            </div>
        </div>
    );
}

/** 🗑️ 스크랩으로 올라온 콜 한 줄 — 서버 `intel` 행 그대로 */
interface IntelRow {
    id?: number; pickup?: string; dropoff?: string; fare?: number;
    timestamp?: string; targetApp?: string;
    /** 🔴 서버는 **DB 칸 이름 그대로** 준다 — `deviceId` 가 아니라 `device_id` 다 (2026-09-12 실측) */
    device_id?: string;
    pickupDistanceKm?: number | null;
    /**
     * ⚖️ **앱이 내린 판정** — `pass` 이거나 떨어뜨린 축, `locked`(잠겨 안 봄), `null`(구앱).
     *    🔴 **이 한 칸이 사본을 없앴다** (2026-09-12).
     */
    verdict?: string | null;
    /** 🆕 2026-09-12 에 앱이 더 싣기 시작한 값들 — **판정에는 안 쓴다.** 눈으로 본다 */
    vehicleType?: string | null;
    deliveryDistanceKm?: number | null;
    scheduleText?: string | null;
    postTime?: string | null;
    rawText?: string | null;
}

/**
 * 🗑️ **버린 콜 한 줄 — 왼쪽은 콜, 오른쪽은 심사** (기사님 지시 2026-09-12:
 *    *"곤지암읍 → 송파구 · 61천 까지 왼쪽 정렬하고 심사를 오른쪽으로 하자"*).
 *
 * 🔴 **`Row` 를 쓰지 않는다.** 그것은 «이름 : 값» 한 쌍이라 값이 오른쪽에 붙는데,
 *    여기는 **콜 한 건이 왼쪽 덩어리**이고 심사는 그 판정이다. 한 칸에 이어 붙이면
 *    구간·요금·사유가 오른쪽으로 밀려 **어디까지가 주소인지** 눈이 못 가른다.
 */
function IntelLine({ sign, at, call, verdict, tone }: {
    sign: string; at: string; call: string; verdict: string; tone?: 'warn' | 'ok';
}) {
    return (
        <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-border-card/50 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[11px] font-black text-text-primary">
                <span className="mr-1">{sign}</span>
                <span className="text-text-muted font-bold mr-1 tabular-nums">{at}</span>
                {call}
            </span>
            <span className={`shrink-0 max-w-[45%] truncate text-[10.5px] font-bold text-right ${
                tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-text-muted'}`}>
                {verdict}
            </span>
        </div>
    );
}

/**
 * 🗑️ **올라온 콜 — 버린 것까지** (기사님 지시 2026-09-11:
 *    *"스크렙해서 올라온 버려진 콜들을 볼수 있으면 좋겠다."*).
 *
 * 🔴 **데이터는 이미 서버에 있다.** 앱은 리스트에서 **본 콜을 전부** 올리고
 *    (`HijackService` — 잡은 콜도 «수집»에 센다), `routes/scrap.ts` 가 그것을 통째로
 *    `intel` 테이블에 넣는다(`type='INTEL_BULK'`). **버려진 콜이 거기 다 있다.**
 * 🔴 **그런데 꺼내는 문이 없다** — 서버가 `intel` 을 읽는 곳은 `COUNT(*)` 하나뿐이다.
 *    라우트를 내는 것은 `server/src` 라 여기서 안 만든다 (영역이 다르다).
 *    그래서 **문을 두드려 보고, 없으면 없다고 화면이 말한다** — 지어내지 않는다 (규칙 ④).
 *
 * 규격은 이 칸이 기다리는 모양 그대로다:
 *   `GET /api/sim/intel?limit=40` → `{ ok: true, rows: [{ id, pickup, dropoff, fare, timestamp, targetApp, deviceId }] }`
 *   (최근 것이 먼저. 개발 빌드 전용 — `/driver-location` 과 같은 문지기)
 *
 * ⚠️ **«왜 버려졌나»는 이 표에 없다.** 사유는 앱만 알고, 서버로는 **집계**(`filterTally`)로만
 *    온다 — 콜 하나하나의 탈락 사유를 실으려면 앱이 함께 보내야 한다 (별건).
 */
function ScrapIntelCard({ activeRoute }: { activeRoute?: SecuredOrder[] }) {
    const [rows, setRows] = useState<IntelRow[] | null>(null);
    /** 🔢 서버가 함께 주는 **표 전체 크기** — 지금 보는 40건이 몇 중 몇인지 */
    const [total, setTotal] = useState<number | null>(null);
    /**
     * 🧹 **화면에서만 지운다** (기사님 지시 2026-09-12: *"서버꺼를 리셋할 필요는 없을꺼 같고
     *    화면에서 리셋할수 있게 … 많이 싸이면 화면에서 지우고 하나씩 다시 싸으면 보기 편할듯"*).
     *
     * 🔴 **서버를 안 건드린다** — `intel` 은 «무엇이 올라왔나»의 원장이다. 화면이 답답하다고
     *    원장을 지우면 나중에 «그때 그 콜이 올라왔었나»를 물을 데가 없어진다 (규칙 ①의 결).
     *    그래서 **보는 기준선**만 옮긴다 — 그 줄 뒤에 쌓이는 것만 그린다.
     * 🔴 **지운 채로 잊지 않게 한다** — 기준선이 살아 있으면 제목이 «지운 뒤»라고 계속 말하고,
     *    「전부 보기」가 늘 옆에 있다. 안 그러면 «콜이 안 올라온다»로 읽는다.
     */
    const [sinceId, setSinceId] = useState<number | null>(() => {
        try {
            const v = Number(localStorage.getItem('statusboardIntelSince'));
            return Number.isFinite(v) && v > 0 ? v : null;
        } catch { return null; }   // 저장을 막아 둔 브라우저 — 그냥 전부 본다
    });
    const setSince = (v: number | null) => {
        setSinceId(v);
        try {
            if (v == null) localStorage.removeItem('statusboardIntelSince');
            else localStorage.setItem('statusboardIntelSince', String(v));
        } catch { /* 못 남겨도 이번 판에서는 지워진다 */ }
    };
    const [why, setWhy] = useState<string | null>(null);
    /** 🔁 버튼이 올린 직후 **바로** 다시 묻는 길 — 10초를 기다리면 «안 올라갔나»로 읽힌다 */
    const [tick, setTick] = useState(0);
    /** 🖐️ 손으로 올리는 중 · 그 결과 한 줄 */
    const [making, setMaking] = useState(false);
    const [madeNote, setMadeNote] = useState<string | null>(null);
    /** 누를 때마다 문제지의 다음 콜로 간다 — 같은 콜만 쌓이면 견줄 것이 없다 */
    const [seq, setSeq] = useState(0);

    useEffect(() => {
        let alive = true;
        const ask = async () => {
            try {
                const r = await fetch(`${apiBase()}/sim/intel?limit=40`);
                if (!alive) return;
                if (!r.ok) { setRows(null); setWhy(`— 서버에 읽는 문이 없다 (HTTP ${r.status})`); return; }
                const d = await r.json() as { rows?: IntelRow[]; total?: number };
                setRows(d.rows ?? []); setTotal(d.total ?? null); setWhy(null);
            } catch { if (alive) { setRows(null); setWhy('— 서버에 못 물었다'); } }
        };
        void ask();
        const t = setInterval(() => { void ask(); }, 10_000);
        return () => { alive = false; clearInterval(t); };
    }, [tick]);

    /**
     * 🖐️ **콜 하나를 손으로 올린다** (기사님 지시 2026-09-13:
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
            setMadeNote(`✅ ${order.pickup} → ${order.dropoff} · ${order.fare.toLocaleString()}원`);
            setTick(n => n + 1);
        } catch {
            setMadeNote('— 서버에 못 닿았다');
        } finally {
            setMaking(false);
        }
    };

    /**
     * ⚖️ **판정은 앱이 했다** — 화면은 그 낱말을 한국어로 옮기고, «이미 쥔 콜인가»만 맞춰 본다
     *    (그것만은 앱이 모른다 — 앱은 제가 올린 뒤의 일을 못 본다).
     * 🔴 **여기서 다시 재지 않는다.** 2026-09-12 까지는 사본이 있었고 앱과 갈라졌다.
     */
    const shown = (rows ?? []).filter(r => sinceId == null || (r.id ?? 0) > sinceId);
    /* 🔴 **한 번에 본다** — 쥔 콜을 한 줄에만 붙이려면 목록 전체를 함께 봐야 한다 */
    const judged = viewAll(shown, activeRoute ?? []).map(({ row, v }) => ({ r: row, v }));
    const sum = tallyMarks(judged.map(j => j.v.mark));

    return (
        <Card fold
              title={rows?.length
                  ? `🗑️ 버린 콜 — ⭕${sum.missed} 🟢${sum.kept} ❌${sum.dropped}${total ? ` / 쌓인 ${total}` : ''}`
                  : '🗑️ 버린 콜 — 서버가 받은 것'}
              note={sinceId != null
                  ? '앱 → 서버 · 본 콜 전부\n🧹 지운 뒤 것만 보는 중'
                  : '앱 → 서버 · 본 콜 전부\n지금 필터로 다시 재 본다'}>
            {/* 🧹 화면에서만 지운다 — 서버 원장(`intel`)은 그대로다 */}
            <div className="flex items-center gap-1 pb-1">
                <button type="button"
                    onClick={() => setSince(Math.max(0, ...(rows ?? []).map(r => r.id ?? 0)) || null)}
                    disabled={!rows?.length}
                    className={`px-2 py-1 rounded-md border text-[10.5px] font-black ${rows?.length
                        ? 'border-border-card text-text-muted hover:text-info hover:border-info/40'
                        : 'border-border-card/50 text-text-muted/40'}`}>
                    🧹 화면에서 지우기
                </button>
                {sinceId != null && (
                    <button type="button" onClick={() => setSince(null)}
                        className="px-2 py-1 rounded-md border border-warning/40 bg-warning/10 text-warning text-[10.5px] font-black">
                        전부 보기 (지금 {shown.length}건만 보는 중)
                    </button>
                )}
            </div>
            {why && <Row k="목록" v={undefined} empty={why} tone="warn" />}
            {rows?.length === 0 && <Row k="(없음)" v={undefined} empty="— 올라온 콜이 없다" />}
            {rows?.length !== 0 && shown.length === 0 && sinceId != null && (
                <Row k="지운 뒤" v={undefined} empty="— 아직 새로 올라온 콜이 없다" />
            )}
            {judged.map(({ r, v }, i) => {
                const tone: 'warn' | 'ok' | undefined =
                    v.mark === 'missed' ? 'warn' : v.mark === 'kept' ? 'ok' : undefined;
                /* 🔴 심사 칸의 말 — 탈락이면 **사유**가, 아니면 **판정**이 그 자리에 선다 */
                const verdict = v.why ?? (v.mark === 'kept' ? '잡음'
                    : v.mark === 'missed' ? '통과인데 안 잡음' : '못 잼');
                return (
                    <IntelLine key={r.id ?? i}
                               sign={MARK_SIGN[v.mark]}
                               at={(r.timestamp ?? '').slice(11, 16) || '—'}
                               call={`${isHandmade(r.rawText) ? '🖐️ ' : ''}${r.pickup ?? '—'} → ${r.dropoff ?? '—'}${r.fare ? ` · ${Math.round(r.fare / 1000)}천` : ''}`
                                   + (r.deliveryDistanceKm != null ? ` · ${r.deliveryDistanceKm}km` : '')
                                   + (r.vehicleType ? ` · ${r.vehicleType}` : '')
                                   /* ⏱️ 급송·«낼09시» 원문 — 판정 축은 아직 아니다. 눈으로 본다 */
                                   + (r.scheduleText ? ` · ${r.scheduleText}` : '')}
                               verdict={verdict}
                               tone={tone} />
                );
            })}

            {/* 🖐️ **콜 생성 — 이 칸의 맨 아래** (기사님 지시 2026-09-13 *"오른쪽 버린콜 하단에"*).
                🔴 값은 지어내지 않는다 — `labProblems` 의 «볼트 저녁 판», 기사님이 실제로 도신 콜이다. */}
            <div className="mt-1.5 pt-1.5 border-t border-border-card flex items-center gap-2">
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
 * ⚖️ **심사 중 — 서버 쪽 «맨 아래 붙박이»** (기사님 지시 2026-09-11:
 *    *"심사중은 하단에 딱 붙여줘 프로젝트와 심사내용을 비교하기 좋을꺼 같아."*).
 *
 * 🔴 **자리가 고정이라야 견줄 수 있다.** 흐르는 칸이면 창을 넓힐 때마다 자리를 옮겨서,
 *    왼쪽 심사석과 번갈아 보려면 매번 눈으로 찾아야 했다. 무대는 판정석이 **시트 맨 아래**라
 *    같은 높이에 두면 **한 줄기 눈으로** 왼쪽 색과 오른쪽 근거를 함께 읽는다.
 * 🔴 **술어는 심사석과 같은 것**(`isEvaluating || isPreview`)이다 — 여기서 다시 지으면
 *    «심사석엔 떴는데 현황판엔 없다»가 생긴다 (규칙 ③).
 */
function JudgingSeatCard({ activeRoute }: { activeRoute?: SecuredOrder[] }) {
    const j = (activeRoute ?? []).find(r => !isTerminal(r.status ?? undefined)
        && (isEvaluating(r.status ?? undefined) || !!r.isPreview));
    return (
        <div className="shrink-0 mt-1.5 pt-1.5 border-t border-border-card">
            <Card title="⚖️ 심사 중" tall note={'집은 뒤 · 서버가 하는 일\n왼쪽 심사석과 같은 콜'}>
                {!j
                    ? <Row k="(없음)" v={undefined} empty="— 지금 심사하는 콜이 없다" />
                    : <>
                        <Row k="콜" v={`${j.pickup ?? '—'} → ${j.dropoff ?? '—'}`} />
                        <Row k="status" v={j.status} />
                        <Row k="미리보기" v={j.isPreview ? 'true' : 'false'} />
                        <Row k="요금" v={j.fare} />
                        {/* 🔴 **색이 곧 결정이다** (규칙 ⑤-3) — 그래서 «왜 그 색인가»까지 적는다.
                            막은 문(gate)이 있으면 그것부터, 없으면 축 점수를 보여 준다. */}
                        <Row k="판정" v={j.judgment ? `${j.judgment.color} ${j.judgment.score ?? '못 잼'}` : undefined}
                             tone={j.judgment ? (j.judgment.color === '사고' ? 'warn' : 'ok') : 'warn'} />
                        {j.judgment?.gates?.filter(g => !g.pass).map(g => (
                            <Row key={g.key} k={`⛔ ${g.name}`} v={g.why ?? '막혔다'} tone="warn" />
                        ))}
                        {j.judgment?.axes?.map(a => (
                            <Row key={a.key} k={a.name} v={a.score == null ? `못 잼 (${a.raw})` : `${a.score} · ${a.raw}`} />
                        ))}
                    </>}
            </Card>
        </div>
    );
}

/**
 * 📱 **폰마다 다른 것은 아래에 탭으로 겹친다** (기사님 지시 2026-09-11:
 *    *"공통으로 내려가는건 같을꺼 같고 **폰이 받는 타이밍은 다를꺼 같아.**
 *      공통은 위로 올리고 다른것들은 아래로 내려 텝처리 할까?"*).
 *
 * 🔴 **위(공통)와 아래(폰별)를 섞지 않는다.** 필터는 **한 벌**인데 그것을 **받는 시각은 폰마다
 *    다르다** — 앱은 제 `scrap` 응답 꼬리로 받는다(피기백). 한 칸에 같이 그리면
 *    «이 값이 모든 폰에게 참인가»를 매번 되물어야 한다.
 *
 * 🔴 **왼쪽 폰 패널에 이미 뜨는 것은 안 그린다** (기사님 지시 2026-09-11: *"1234 · 인성 ·
 *    알수 없는 화면 · 합짐 · 23:18 · ⏱️ 는 확인 되는거니까 그것 말고 다른것들"*).
 *    여기 담는 것은 그 줄에 **숫자로 안 나오는 것들**이다 — 읽은 노드 수 · 보고 간격(초) ·
 *    탈락 사유별 수 · 누적 · 모드가 폰에 닿았나 · 서버가 받은 좌표 · 앱 버전.
 *    ⚠️ 폰 이름만은 겹친다 — **탭을 고르는 손잡이**라 없으면 무엇을 보는지 모른다.
 */
function PhoneTabs({ devices }: { devices: DeviceSession[] }) {
    /* 🔴 **고른 폰은 id 로 기억한다** — 순서(index)로 쥐면 폰이 하나 빠질 때
       **엉뚱한 폰을 보게 된다.** 그 폰이 사라지면 첫 폰으로 떨어진다. */
    const [pickId, setPickId] = useState<string | null>(null);
    const [open, setOpen] = useState(true);
    const d = devices.find(x => x.deviceId === pickId) ?? devices[0];

    /* 🔴 **낡은 성적표는 안 그린다** — 두 시각이 같을 때만 «이번 보고에 함께 온 것»이다
       (왼쪽 폰 패널과 같은 규칙. 스캔을 안 하는 폰이 «방금 훑었다»고 말하던 자리다) */
    const fresh = d != null && d.filterTallyAt != null && d.filterTallyAt === d.lastSeen;
    const sum = fresh ? summarizeTally(d.filterTally, d.filterTallyAt) : null;
    /* ⏱️ **직전 보고와 몇 초 만인가** — 뺄셈 하나는 표시다. 판정은 여기서 안 한다 */
    const gapSec = d?.prevSeen != null ? Math.round((d.lastSeen - d.prevSeen) / 1000) : undefined;

    return (
        /**
         * 🔴 **바닥에 붙고, 짜부라지지 않는다** (기사님 지시 2026-09-12:
         *    *"폰마다 다른 것은 아직 하단에 붙어 있지 않아"*).
         *
         * ⚠️ 전에는 `flex-1` 만 줬는데, 그건 **남는 자리를 갖는다**는 뜻이지 «자리를 지킨다»가
         *    아니다. 위 칸들이 길면 남는 자리가 **0** 이라 폰 영역이 한 줄로 접히듯 사라졌다.
         *    이제 **안 줄어들고**(`shrink-0`) **최소 높이**를 쥐며, 남는 자리는 그대로 갖는다 —
         *    줄어드는 쪽은 위 칸 영역이다.
         */
        <div className="grow shrink-0 min-h-[280px] flex flex-col mt-1.5 pt-1.5 border-t border-border-card">
            <div className="shrink-0 flex items-baseline gap-2 px-1 pb-1">
                {/* 🔽 폰 영역도 접힌다 — «모든 영역» 에는 이 묶음도 든다 */}
                <h3 className="text-[11px] font-black text-text-primary">
                    <button type="button" onClick={() => setOpen(o => !o)} className="text-left">
                        <span className="mr-1">{open ? '▾' : '▸'}</span>📱 폰마다 다른 것
                    </button>
                </h3>
                <span className="text-[9px] text-text-muted">받는 타이밍은 폰마다 다르다</span>
            </div>
            {open && <>
            {devices.length === 0
                ? <div className="rounded-xl border border-border-card bg-background p-2.5">
                      <Row k="폰" v={undefined} empty="붙은 폰 없음" tone="warn" />
                  </div>
                : <>
                    {/* 🔖 탭 — 폰이 몇이든 한 줄에서 고른다. 오프라인이면 이름부터 붉다 */}
                    <div className="flex flex-wrap gap-1 px-1 pb-1.5">
                        {devices.map(x => {
                            const on = x.deviceId === d?.deviceId;
                            const off = x.status === 'OFFLINE';
                            return (
                                <button key={x.deviceId} type="button" onClick={() => setPickId(x.deviceId)}
                                    className={`px-2 py-1 rounded-md border text-[11px] font-black ${on
                                        ? 'border-info/40 bg-info/15 text-info'
                                        : off ? 'border-danger/40 text-danger' : 'border-border-card text-text-muted'}`}>
                                    {x.deviceName || x.deviceId.slice(-4)}
                                </button>
                            );
                        })}
                    </div>
                    {/* 🔴 **폰 칸도 한 줄이다** — 위쪽 줄들과 같은 규칙 (기사님 지시 2026-09-12).
                        단으로 흘리면 폰 탭 안에서도 «칸이 자리를 옮기는» 일이 생긴다 */}
                    {d && (
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <div className="flex flex-col gap-2">
                                <div>
                                    <Card title="📡 이 폰이 든 필터" note={'폰이 매 scrap 에 지문을 싣는다'}>
                                        {/* 🔴 **서버가 안 들고 있어 «모름»이다.** 앱은 `filterVersion`(지문)을 보내고
                                            서버는 지금 판과 대조해 본문 생략까지 하는데(`routes/scrap.ts`),
                                            **어디에도 남기지 않는다** — `DeviceSession` 에 칸이 없다.
                                            한 줄 얹는 것은 `server/src` 라 여기서 손대지 않는다 (영역이 다르다).
                                            🔴 지어내지 않는다 — 모르면 **왜 모르는지**를 적는다 (규칙 ④). */}
                                        {/* ✅ **2026-09-12 에 열렸다** — 서버가 `DeviceSession.filterVersion` 에
                                            폰이 든 지문을 남긴다. 폰이 여럿이면 **이 값이 서로 달라야 정상**이 아니다 —
                                            다르면 「🚨 어긋남」이 잡는다. */}
                                        <Row k="든 필터 판" v={d.filterVersion} empty="— 구앱은 안 싣는다"
                                             tone={d.filterVersion ? 'ok' : 'warn'} />
                                        <Row k="그 지문을 본 때" v={clockOf(d.filterVersionAt)} empty="— 없다" />
                                        <Row k="모드 (관제)" v={d.mode ? (DEVICE_MODE_LABEL[d.mode as DeviceModeType] ?? d.mode) : undefined} />
                                        <Row k="모드 (폰 대답)" v={d.appliedMode} empty="— 구앱은 대답 안 함" />
                                        <Row k="닿았나" v={d.appliedMode ? (isModeApplying(d) ? '아직 — 가는 중' : '닿았다') : undefined}
                                             empty="— 모른다" tone={d.appliedMode ? (isModeApplying(d) ? 'warn' : 'ok') : undefined} />
                                    </Card>
                                </div>
                                {/* 🗑️ **「🛰️ 보고」 칸을 걷었다** (기사님 확정 2026-09-12 정리안) —
                                    배차망·상태·마지막 보고는 **왼쪽 폰 줄에 이미 뜬다**
                                    (*"1234 · 인성 · 알수 없는 화면 · 합짐 · 23:18 · ⏱️ 는 확인 되는거니까"*).
                                    남길 것 둘(보고 간격 · 앱 버전)은 아래 칸으로 옮겼다. */}
                                <div>
                                    <Card title="👁️ 폰이 일하고 있나" note={'왼쪽 줄에 안 나오는 숫자들'}>
                                        <Row k="직전과 간격" v={gapSec != null ? `${gapSec}초` : undefined} empty="— 첫 보고" />
                                        <Row k="읽은 노드" v={d.screenNodeCount}
                                             tone={d.screenNodeCount === 0 ? 'warn' : d.screenNodeCount ? 'ok' : undefined} />
                                        <Row k="못 읽은 지" v={clockOf(d.blindSince)} empty="— 읽고 있다"
                                             tone={d.blindSince ? 'warn' : undefined} />
                                        <Row k="화면 켜짐" v={d.isScreenOn === undefined ? undefined : d.isScreenOn ? '켜짐' : '💤 꺼짐'}
                                             tone={d.isScreenOn === false ? 'warn' : undefined} />
                                        <Row k="작업 단계" v={workStageLabel(d) ?? undefined} empty="— 구앱은 안 보냄" />
                                        <Row k="콜 처리 중" v={d.isHolding === undefined ? undefined : d.isHolding ? 'true' : 'false'} />
                                        <Row k="앱 버전" v={d.version} />
                                    </Card>
                                </div>
                                <div>
                                    <Card title="🔍 이 폰의 성적표" tall note={'마지막 보고에 함께 온 것만'}>
                                        {sum
                                            ? <>
                                                <Row k="본 콜" v={sum.seen} />
                                                <Row k="통과" v={sum.passed} tone={sum.passed > 0 ? 'ok' : 'warn'} />
                                                {sum.rejects.map(([name, n]) => <Row key={name} k={`탈락 ${name}`} v={n} />)}
                                                <Row k="잰 시각" v={sum.at} />
                                            </>
                                            : <Row k="성적표" v={undefined} empty="— 이번 보고엔 없다" tone="warn" />}
                                    </Card>
                                </div>
                                <div>
                                    <Card title="📊 누적 · 좌표" note={'이 폰이 지금까지 한 일'}>
                                        <Row k="리스트 조회" v={d.stats?.polled} />
                                        <Row k="잡음" v={d.stats?.grabbed} />
                                        <Row k="취소 통보" v={d.stats?.canceled} />
                                        <Row k="좌표" v={d.lat != null && d.lng != null ? `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` : undefined}
                                             empty="— 안 보냈다" />
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}
                  </>}
            </>}
        </div>
    );
}

/**
 * 🔴 **콜 목록은 `Dashboard` 가 쥔 것을 그대로 받는다** — 여기서 다시 만들면
 *    «화면 둘이 다른 콜을 본다»가 된다 (규칙 ③). 지울 때 이 prop 도 함께 사라진다.
 */
interface Props { activeRoute?: SecuredOrder[] }

export default function StatusBoard({ activeRoute }: Props) {
    const { filter, baseFilter } = useFilterConfig();
    const devices = useDeviceStore(st => st.devices);
    const [health, setHealth] = useState<Health | null>(null);
    const driverLoc = useDriverLocation();
    /**
     * 📍 **서버가 아는 «내 자리»를 보여 준다 — 읽기만 한다** (2026-09-12).
     *    🔴 지도·그물은 이 값을 **아직 안 쓴다** — 이으려다 모의 주행이 멈췄고, 그물 재계산
     *       위험도 걸렸다 (`useRouteDerivations` 의 🗑️ 주석). **여기서 하루 보고 나서** 잇는다.
     *    ⚠️ 구독을 여기서 건다 — 지도 쪽이 손을 뗐으므로 듣는 곳이 이 한 곳이다.
     */
    useEffect(() => { ensureDriverPositionSubscribed(); }, []);
    const driverPos = useDriverPositionStore();

    /**
     * 📐 **두 쪽을 나란히 둘 자리가 되나** — 재는 것은 **패널 제 폭**이다.
     *    부모(`Dashboard`)가 재는 것은 «패널이 서느냐»이고, 여기서 재는 것은
     *    «그 안을 좌우로 가를 수 있느냐»라 **다른 질문이다** (규칙 ⑤-4 ⑤: 읽는 곳이 둘이면 값도 둘).
     *    한 쪽이 `COL_MIN` 보다 좁아지면 값이 안 읽히므로 그때는 위아래로 쌓는다.
     */
    const boxRef = useRef<HTMLDivElement>(null);
    const [wideEnough, setWideEnough] = useState(true);
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect.width ?? 0;
            setWideEnough(w >= COL_MIN * SIDES.length + 24);   // 24 = 줄 사이 틈과 안쪽 여백
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /**
     * 🖥️ **지금 무엇이 돌고 있나** — 이 레포가 반복해서 잃은 시간의 원인이다
     *    (루트 CLAUDE.md). 10초마다 다시 묻는다 — 서버가 재기동되면 바로 보이게.
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

    /**
     * 🗂️ **칸 목록 — 순서도 «어느 쪽인가»도 여기 한 줄로 바꾼다**
     *    (기사님: *"순서는 너가 알아서 나중에 바꿀수 있어"*).
     *    JSX 에 칸을 박아 두면 순서를 바꿀 때마다 큰 덩어리를 옮겨야 한다.
     *
     * 🔴 **`side` 가 자리를 정한다** — 칸을 옮기려면 그 한 글자만 고친다.
     *    두는 곳을 JSX 두 군데로 나누면, 옮길 때마다 **덩어리를 들어 날라야** 하고
     *    그 사이 한쪽에 두 벌이 생긴다.
     */
    const COLUMNS: Array<{ key: string; side: Side; node: React.ReactNode }> = [
        /* ── 🖥️ 서버 — 제 안에서 쥐고 하는 일 ── */
        {
            /**
             * 🚨 **어긋남 — 비교를 사람이 하지 않게** (기사님 확정 2026-09-12 정리안).
             *
             * 이 화면의 일은 «같은 것을 보는 것»인데, 여태 **값을 늘어놓기만** 했다.
             * 어긋났는지는 기사님이 칸 열둘을 눈으로 훑어 찾아야 했다 — 그러면 30초가 아니다.
             *
             * 🔴 **새 사실을 만들지 않는다.** 여기 있는 것은 전부 **다른 칸에 이미 떠 있는 값**이고,
             *    이 칸은 그중 «짝이 안 맞는 것»만 골라 올린다 (규칙 ③ — 판정은 서버가 한다).
             * 🔴 **조용할 때도 말한다** — «이상 없음»이 떠 있어야 «안 뜨는 것»과 구분된다.
             */
            key: 'mismatch',
            side: 'server',
            node: (() => {
                /* 📢 **고장이 아닌데 알아야 하는 것** — 빨간 줄과 섞지 않는다 (오탐이 쌓이면 아무도 안 본다) */
                const note: { k: string; v: string }[] = [];
                const bad: { k: string; v: string }[] = [];
                /**
                 * 📍 **경로 기점과 내 자리가 왜 다른가** (2026-09-12).
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
                    const km = haversineKmOf(pos, org);
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
                 * 🧭 **폰들이 같은 필터 판을 들고 있나** (2026-09-12 · 서버가 지문을 남기기 시작).
                 *    필터는 **한 벌**인데 받는 시각은 폰마다 다르다 — 한 폰만 옛 판을 들고 돌면
                 *    그 폰은 **다른 조건으로 콜을 거른다.** 화면 어디에도 안 드러나던 자리다.
                 */
                const versions = new Set(devices.map(d => d.filterVersion).filter(Boolean));
                if (versions.size > 1) {
                    bad.push({ k: '필터 판', v: `폰마다 다르다 (${versions.size}종) — 한 폰이 옛 판으로 거른다` });
                }
                devices.forEach(d => {
                    const name = d.deviceName || d.deviceId.slice(-4);
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
            })(),
        },
        {
            key: 'health',
            side: 'server',
            node: (
                <Card title="🖥️ 지금 무엇이 도는가" note={'10초마다 다시 묻는다'}>
                    <Row k="서버" v={health ? '붙었다' : '못 붙었다'} tone={health ? 'ok' : 'warn'} />
                    <Row k="bootedAt" v={health?.bootedAt} />
                    <Row k="git" v={health?.git?.commit ? `${health.git.branch ?? ''} ${health.git.commit}`.trim() : undefined} />
                </Card>
            ),
        },
        /* 🧪 **「🎭 모의 주행」이 여기 있었다** — 서버를 바꾸는 것이라 맨 위 테스트 구역으로
           옮겼다 (기사님 지시 2026-09-12: 어드민에서 없어져야 하는 셋). */
        {
            /* 📍 «서버가 어디를 내 자리로 아는가» — 통신 칸 바로 옆이 맞다 (같은 «지금 상태») */
            key: 'driverLocation',
            side: 'server',
            node: <DriverLocationCard loc={driverLoc} />,
        },
        /* 🔴 **「⚖️ 심사 중」이 여기 있었다** — 흐르는 칸이 아니라 **서버 쪽 맨 아래 붙박이**로
           내렸다 (기사님 지시 2026-09-11: *"심사중은 하단에 딱 붙여줘 프로젝트와 심사내용을
           비교하기 좋을꺼 같아."*). 왼쪽 무대는 판정석이 **시트 맨 아래**라 같은 높이에서 나란히 읽힌다. */
        {
            key: 'values',
            side: 'server',
            /**
             * 🔴 **«국면 다섯»이 여기 있었다** (이식 C3-3b · 2026-09-11).
             *    `user_filter_phases` 다섯 행을 그대로 비추던 칸인데, **값이 한 벌**이 되며
             *    그릇째 사라졌다. 이제 «지금 쓰는 값 한 벌»을 보여 준다.
             */
            node: (
                <Card title="🎛️ 필터설정값" tall note={'지금 쓰는 값\n평소와 다르면 옆에 적는다'}>
                    {/**
                      * 🔴 **«평소값» 칸을 걷고 여기로 합쳤다** (기사님 확정 2026-09-12 정리안).
                      *    전에는 오늘 값 칸과 평소값 칸을 **눈으로 비교**해야 했다 —
                      *    그러면 «오늘 뭘 바꿨나»에 아무도 못 답한다. 다른 줄만 **그 자리에서**
                      *    말하게 한다: `현위반경 10km (평소 15)`.
                      * 🔴 값을 만드는 것이 아니라 **서버가 준 두 벌을 나란히 놓는 것**이다 —
                      *    둘 다 서버가 쥔 값이고, 여기서는 같은지 다른지만 본다.
                      */}
                    {FILTER_FIELDS.map(f => {
                        const now = (filter as Record<string, unknown> | null)?.[f.path];
                        const base = (baseFilter as Record<string, unknown> | null)?.[f.path];
                        const differs = base !== undefined && base !== null && String(base) !== String(now ?? '');
                        return (
                            <Row key={f.path} k={f.label}
                                 v={`${now ?? '—'}${f.unit}${differs ? ` (평소 ${base}${f.unit})` : ''}`}
                                 tone={differs ? 'warn' : undefined} />
                        );
                    })}
                    <Row k="마름모" v={`${filter?.srcAngleDeg ?? '—'}° · ${filter?.dstAngleDeg ?? '—'}° · ${filter?.quadRadiusKm ?? '—'}km`} />
                    <Row k="제외 지역" v={filter?.excludedRegions} empty="— 없다" />
                    <Row k="요금" v={filter?.minFare != null || filter?.maxFare != null
                        ? `${filter?.minFare?.toLocaleString() ?? '—'} ~ ${filter?.maxFare?.toLocaleString() ?? '—'}` : undefined} />
                </Card>
            ),
        },
        {
            key: 'deck',
            side: 'server',
            node: (
                (() => {
                    /**
                     * 🔴 **끝난 콜이 화면을 먹지 않게** (기사님 확정 2026-09-12 정리안).
                     *    실측에서 9건 중 7건이 방출·취소였다 — «지금 쥔 콜»을 보러 왔는데
                     *    **끝난 것이 자리를 다 쓰고 있었다.** 진행 중을 앞에 세우고,
                     *    끝난 것은 **개수만** 제목에 남긴다 (숨겨도 있는 줄은 알게 · 규칙 ④).
                     */
                    const all = activeRoute ?? [];
                    const live = all.filter(r => !isTerminal(r.status ?? undefined));
                    const done = all.length - live.length;
                    return (
                        <Card tall title={`📋 콜 리스트 — ${live.length}건${done ? ` (끝난 것 ${done})` : ''}`}
                              note={'지금 쥔 콜\n끝난 것은 접혀 있다'}>
                            {live.length === 0 && <Row k="(없음)" v={undefined} empty="— 진행 중인 콜이 없다" />}
                            {live.map((r, i) => (
                                <Row key={r.id ?? i} k={`${i + 1} ${r.status ?? ''}`}
                                     v={`${r.pickup ?? '—'} → ${r.dropoff ?? '—'}`} />
                            ))}
                            {done > 0 && (
                                <details className="pt-1">
                                    <summary className="cursor-pointer text-[10px] font-bold text-text-muted">끝난 콜 {done}건 펼치기</summary>
                                    {all.filter(r => isTerminal(r.status ?? undefined)).map((r, i) => (
                                        <Row key={r.id ?? `t${i}`} k={r.status ?? '—'}
                                             v={`${r.pickup ?? '—'} → ${r.dropoff ?? '—'}`} />
                                    ))}
                                </details>
                            )}
                        </Card>
                    );
                })()
            ),
        },

        /* ── 📱 앱 — 주고받는 것 (올라온 보고 · 내려갈 값) ── */
        /* 🔴 **「🔍 앱이 무엇을 봤나」가 여기 있었다** — 성적표는 **폰마다 다르므로**
           아래 「📱 폰마다 다른 것」 탭으로 내려갔다 (기사님 지시 2026-09-11).
           위는 **모든 폰에 같은 것**만 둔다. */
        {
            /* 🗑️ 제 줄을 갖는다 — 쌓이는 목록이라 한 칸에 안 들어간다 */
            key: 'intel',
            side: 'intel',
            node: <ScrapIntelCard activeRoute={activeRoute} />,
        },
        {
            key: 'appFilter',
            side: 'app',
            node: (
                <Card tall fold
                      title={`📦 앱에 내려갈 필터 — ${APP_FILTER_KEYS.length}개`}
                      note={'서버 → 앱\n폰마다 같은 한 벌 (shared APP_FILTER_KEYS)'}>
                    {/* 🔴 키 목록을 여기 또 적지 않는다 — 표가 유일한 원천이다 (규칙 ③).
                        `orderKm`·`pickerAlarmMinFare` 는 서버가 조립할 때 얹으므로 여긴 «숨김» 이다. */}
                    {APP_FILTER_KEYS.map(k => (
                        <Row key={k} k={k} v={(filter as Record<string, unknown> | null)?.[k]} empty="— 숨김" />
                    ))}
                </Card>
            ),
        },
        {
            /**
             * 🚚 **필터에 있는데 어느 칸에도 없던 것들** (기사님 지적 2026-09-11:
             *    *"지금 필터 값들이 들어 왔을껀데.. 화면에 없어 … 그런걸 보려고 이 영역을 만든거야."*).
             *
             * 🔴 화면을 실제로 읽어 대조했더니 **넷이 어디에도 안 그려지고 있었다** —
             *    `slotsUsed` · `capacityConfidence` · `driverAction` · `userOverrides`.
             *    앞의 둘은 **적재**라 합짐 국면의 판정을 좌우하고(목업 하단 「📦 콜 속성 축」에는
             *    있다), `userOverrides` 는 «서버가 덮어쓰지 못하게 기사님이 손댔다»는 표시다.
             */
            key: 'load',
            side: 'app',
            node: (
                <Card title="🎛️ 지금 어떤 판인가" note={'서버 → 앱\n국면 · 적재 · 손댐'}>
                    {/**
                      * 🔴 **「🎛️ 지금 국면」과 「🚚 적재 · 손댐」을 합쳤다** (기사님 확정 2026-09-12).
                      *    국면 칸의 `isActive`·`isSharedMode` 는 「📦 앱에 내려갈 필터」에 **또 있었다** —
                      *    같은 값을 두 자리에서 보면 언젠가 «어느 쪽이 참인가»를 묻게 된다 (규칙 ③).
                      *    남는 둘(`callTarget`·`dispatchPhase`)은 적재와 **같은 질문**에 답한다:
                      *    «지금 어떤 판이고, 얼마나 찼나».
                      */}
                    <Row k="callTarget" v={filter?.callTarget} empty="— 안 고른다(파생)" />
                    <Row k="dispatchPhase" v={filter?.dispatchPhase} />
                    <Row k="slotsUsed" v={filter?.slotsUsed} />
                    <Row k="capacityConfidence" v={filter?.capacityConfidence} />
                    <Row k="driverAction" v={filter?.driverAction} />
                    <Row k="localMode" v={filter?.localMode === undefined ? undefined : filter.localMode ? '🏘️ 관내로 잰다' : '아니다'} />
                    <Row k="userOverrides" v={filter?.userOverrides === undefined ? undefined : String(filter.userOverrides)}
                         empty="— 손 안 댔다" tone={filter?.userOverrides ? 'warn' : undefined} />
                </Card>
            ),
        },
        {
            key: 'regions',
            side: 'app',
            node: (
                <Card tall fold defaultOpen={false}
                      title={(() => {
                          /* 🔴 **닫아도 숫자는 제목에 남는다** — 접어서 «있는 줄도 모르는» 것이
                             되면 안 된다 (기사님 지시 2026-09-11) */
                          const g = filter?.destinationGroups ?? {};
                          const sgg = Object.keys(g).length;
                          const dong = Object.values(g).reduce((n, v) => n + v.length, 0);
                          return sgg ? `🗂️ 영역 — ${sgg}개 시군구 · ${dong}개 동` : '🗂️ 영역 — 시군구별';
                      })()}
                      note={'서버 → 앱\n앱이 하차지를 맞춰 보는 목록'}>
                    {(() => {
                        const g = filter?.destinationGroups;
                        if (!g || Object.keys(g).length === 0) return <Row k="(없음)" v={undefined} tone="warn" />;
                        return Object.entries(g)
                            .sort((a, b) => b[1].length - a[1].length)
                            .map(([region, names]) => <Row key={region} k={region} v={`${names.length}개`} />);
                    })()}
                </Card>
            ),
        },
        {
            /**
             * 🧾 **전문 — 이 뒤로 «화면에 없는 값»이 생기지 않게** (기사님 지시 2026-09-11).
             *
             * 🔴 칸을 손으로 늘리는 한 **새 칸이 생길 때마다 또 빠진다.** 오늘이 그랬다.
             *    전문을 한 벌 두면 **빠질 자리가 없다** — 칸들은 «자주 보는 것»을 앞세우는 노릇만 한다.
             * 🎨 목업 하단의 「📦 원문 JSON」과 같은 모양이다 — 접어 두고 복사만 바로.
             */
            key: 'raw',
            side: 'app',
            node: (
                <Card title="🧾 필터 전문" tall note={'서버가 준 그대로\n칸에 없는 값은 여기 있다'}>
                    <div className="flex items-center justify-between gap-2 pb-1">
                        <span className="text-[10px] text-text-muted">
                            {filter ? `${Object.keys(filter).length}개 칸` : '아직 못 받았다'}
                        </span>
                        <button type="button" disabled={!filter}
                            onClick={() => { navigator.clipboard?.writeText(JSON.stringify(filter, null, 2)).catch(() => { /* 클립보드 막힘 — 무시 */ }); }}
                            className="text-[10px] font-black text-text-muted hover:text-info">📋 복사</button>
                    </div>
                    {filter
                        ? <details>
                              <summary className="cursor-pointer text-[10.5px] font-bold text-text-muted">펼쳐 보기</summary>
                              <pre className="mt-1 text-[9.5px] leading-snug whitespace-pre-wrap break-all text-text-primary">
                                  {JSON.stringify(filter, null, 1)}
                              </pre>
                          </details>
                        : <Row k="filter" v={undefined} empty="— 소켓으로 아직 안 왔다" tone="warn" />}
                </Card>
            ),
        },
    ];

    return (
        <aside
            /**
             * 🔴 **원본과 «형제»다** (기사님 지시 2026-09-11: *"원본에는 어떤 영향도 없어야해..
             *    div 로 완벽하게 분리해줘"*). 부모(`Dashboard`)가 좌우로 갈라 주므로
             *    여기서는 **제 칸만 채운다** — `fixed` 도 `calc(100vw…)` 도 쓰지 않는다.
             *
             * 🔴 전에는 `fixed` 로 원본 위에 얹었다가 **헤더가 어긋났다.** 겹쳐 놓고
             *    «안 건드린다»고 믿은 것이 틀렸다.
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

                {/* 🖥️📱🗑️ **세 줄 — 각각 한 단으로 곧게 내려간다** (기사님 지시 2026-09-12:
                    *"컨포넌트가 한줄로 있는 구조가 아니구나.. 그냥 한줄로 만들고"*).

                    ⚠️ 전에는 쪽 **안에서 신문 단**(`columns`)으로 흘렀다. 빈틈은 없었지만
                       창 폭에 따라 한 쪽이 2단이 되었다 풀렸다 해서 **칸이 자리를 옮겼다** —
                       찾던 것이 매번 다른 데 있는 것은 처음에 고친 그 문제와 같은 모양이다.
                       이제 **줄마다 한 단**이라 위아래 순서가 창 폭과 무관하게 고정이다.
                    ⚠️ **세 줄을 못 세우는 폭이면 위아래로 쌓는다** — 한 줄이 `COL_MIN` 보다
                       좁아지면 값이 안 읽힌다. */}
                <div ref={boxRef}
                     className={`flex-1 min-h-0 p-2 ${wideEnough ? 'flex gap-2 overflow-hidden' : 'flex flex-col gap-2 overflow-y-auto'}`}>
                    {SIDES.map(s => (
                        <section key={s.key}
                                 className={`min-w-0 rounded-xl border border-border-card bg-surface/60 p-1.5 ${wideEnough ? 'flex-1 h-full flex flex-col' : ''}`}>
                            <div className="shrink-0 flex items-baseline gap-2 px-1 pb-1.5">
                                <h2 className="text-[12px] font-black text-text-primary">{s.title}</h2>
                                <span className="text-[9px] text-text-muted">{s.note}</span>
                            </div>
                            {/* 🔴 **폰이 우선이다** (기사님 지시 2026-09-11: *"폰의 내용이 다 보여야 해
                                그것이 더 중요하니까"*). 공통 칸 쪽은 자리가 모자라면 **줄어들며 스크롤**하고,
                                남는 자리는 아래 붙박이(폰 탭 · 심사석)가 갖는다. */}
                            {/**
                              * 🔴 **아래 붙박이는 «바닥»에 붙어야 한다** (기사님 지시 2026-09-12:
                              *    *"폰 영역과 심사는 아래에 붙여줘"*).
                              *
                              * 🔴 **남는 자리를 누가 갖느냐가 줄마다 다르다** —
                              *    · 🖥️ 서버: **칸 영역**이 갖는다 → 심사석이 바닥으로 밀린다
                              *    · 📱 앱: **폰 탭**이 갖는다 (기사님: *"폰의 내용이 다 보여야 해"*)
                              *    · 🗑️ 버린 콜: 붙박이가 없으니 칸 영역이 줄을 다 쓴다
                              */}
                            <div className={wideEnough
                                ? `min-h-0 overflow-y-auto flex flex-col gap-2 ${s.key === 'app' ? 'shrink' : 'flex-1'}`
                                : 'flex flex-col gap-2'}>
                                {COLUMNS.map(c => c.side !== s.key ? null : (
                                    <div key={c.key}>{c.node}</div>
                                ))}
                            </div>
                            {/* ⚖️ 서버 쪽 붙박이 — 왼쪽 무대의 심사석과 나란히 읽는다 */}
                            {s.key === 'server' && <JudgingSeatCard activeRoute={activeRoute} />}
                            {/* 📱 **폰별은 앱 쪽 아래에만** — 서버 쪽엔 폰이 여럿일 일이 없다 */}
                            {s.key === 'app' && <PhoneTabs devices={devices} />}
                        </section>
                    ))}
                </div>
            </div>
        </aside>
    );
}
