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
         DEVICE_MODE_LABEL, TARGET_APP_LABEL, DEVICE_OFFLINE_LABEL } from '@onedal/shared';
import type { SecuredOrder, DeviceSession, DeviceModeType, TargetAppType, DeviceOfflineReason } from '@onedal/shared';
/* 🌉 관제웹 안쪽은 **다리 하나**로만 본다 — 옮길 때 `bridge.ts` 만 새로 쓰면 된다 */
import { useFilterConfig, useDeviceStore, summarizeTally, apiBase } from './bridge';
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
function Card({ title, note, children, tall }: {
    title: string; note?: string; children: React.ReactNode;
    /** 줄이 많아 제 안에서 흘러야 하는 칸 */ tall?: boolean;
}) {
    /**
     * 🎨 **목업의 아웃풋 칸과 같은 옷** — `rounded-xl border-border-card bg-background p-2.5`
     *    에 제목은 `text-info`. 지도 실험실 하단의 「🧭 국면 축」·「💰 돈 축」 칸이 그 모양이라,
     *    같은 값을 두 화면에서 볼 때 **눈이 한 번 더 배울 게 없다** (기사님 지시 2026-09-11).
     */
    return (
        <section className="rounded-xl border border-border-card bg-background p-2.5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <h2 className="text-[11px] font-black text-info">{title}</h2>
                {note && <span className="text-[9px] text-text-muted text-right leading-tight whitespace-pre-line">{note}</span>}
            </div>
            <div className={tall ? 'max-h-[228px] overflow-y-auto' : ''}>{children}</div>
        </section>
    );
}

/** 🕐 시각을 사람이 읽는 모양으로 — **표시**일 뿐 값을 만드는 것이 아니다 */
function clockOf(ms?: number): string | undefined {
    return ms ? new Date(ms).toLocaleTimeString('ko-KR', { hour12: false }) : undefined;
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
    const d = devices.find(x => x.deviceId === pickId) ?? devices[0];

    /* 🔴 **낡은 성적표는 안 그린다** — 두 시각이 같을 때만 «이번 보고에 함께 온 것»이다
       (왼쪽 폰 패널과 같은 규칙. 스캔을 안 하는 폰이 «방금 훑었다»고 말하던 자리다) */
    const fresh = d != null && d.filterTallyAt != null && d.filterTallyAt === d.lastSeen;
    const sum = fresh ? summarizeTally(d.filterTally, d.filterTallyAt) : null;
    /* ⏱️ **직전 보고와 몇 초 만인가** — 뺄셈 하나는 표시다. 판정은 여기서 안 한다 */
    const gapSec = d?.prevSeen != null ? Math.round((d.lastSeen - d.prevSeen) / 1000) : undefined;

    return (
        <div className="shrink-0 mt-1.5 pt-1.5 border-t border-border-card">
            <div className="flex items-baseline gap-2 px-1 pb-1">
                <h3 className="text-[11px] font-black text-text-primary">📱 폰마다 다른 것</h3>
                <span className="text-[9px] text-text-muted">받는 타이밍은 폰마다 다르다</span>
            </div>
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
                    {d && (
                        <div className="max-h-[260px] overflow-y-auto">
                            <div style={{ columnWidth: `${COL_MIN}px`, columnGap: 8 }}>
                                <div className="mb-2" style={{ breakInside: 'avoid' }}>
                                    <Card title="📡 이 폰이 든 필터" note={'폰이 매 scrap 에 지문을 싣는다'}>
                                        {/* 🔴 **서버가 안 들고 있어 «모름»이다.** 앱은 `filterVersion`(지문)을 보내고
                                            서버는 지금 판과 대조해 본문 생략까지 하는데(`routes/scrap.ts`),
                                            **어디에도 남기지 않는다** — `DeviceSession` 에 칸이 없다.
                                            한 줄 얹는 것은 `server/src` 라 여기서 손대지 않는다 (영역이 다르다).
                                            🔴 지어내지 않는다 — 모르면 **왜 모르는지**를 적는다 (규칙 ④). */}
                                        <Row k="든 필터 판" v={undefined} empty="— 서버가 안 남긴다" tone="warn" />
                                        <Row k="모드 (관제)" v={d.mode ? (DEVICE_MODE_LABEL[d.mode as DeviceModeType] ?? d.mode) : undefined} />
                                        <Row k="모드 (폰 대답)" v={d.appliedMode} empty="— 구앱은 대답 안 함" />
                                        <Row k="닿았나" v={d.appliedMode ? (isModeApplying(d) ? '아직 — 가는 중' : '닿았다') : undefined}
                                             empty="— 모른다" tone={d.appliedMode ? (isModeApplying(d) ? 'warn' : 'ok') : undefined} />
                                    </Card>
                                </div>
                                <div className="mb-2" style={{ breakInside: 'avoid' }}>
                                    <Card title="🛰️ 보고" note={'서버가 이 폰에게서 받은 것'}>
                                        <Row k="마지막 보고" v={clockOf(d.lastSeen)} />
                                        <Row k="직전과 간격" v={gapSec != null ? `${gapSec}초` : undefined} empty="— 첫 보고" />
                                        <Row k="배차망" v={d.targetApp ? (TARGET_APP_LABEL[d.targetApp as TargetAppType] ?? d.targetApp) : undefined} />
                                        <Row k="상태" v={d.status} tone={d.status === 'ONLINE' ? 'ok' : 'warn'} />
                                        <Row k="꺼진 이유" v={d.offlineReason ? DEVICE_OFFLINE_LABEL[d.offlineReason as DeviceOfflineReason] : undefined}
                                             empty="— 없다" tone={d.offlineReason ? 'warn' : undefined} />
                                        <Row k="앱 버전" v={d.version} />
                                    </Card>
                                </div>
                                <div className="mb-2" style={{ breakInside: 'avoid' }}>
                                    <Card title="👁️ 화면을 읽고 있나" note={'0 이면 접근성 트리가 안 온다'}>
                                        <Row k="읽은 노드" v={d.screenNodeCount}
                                             tone={d.screenNodeCount === 0 ? 'warn' : d.screenNodeCount ? 'ok' : undefined} />
                                        <Row k="못 읽은 지" v={clockOf(d.blindSince)} empty="— 읽고 있다"
                                             tone={d.blindSince ? 'warn' : undefined} />
                                        <Row k="화면 켜짐" v={d.isScreenOn === undefined ? undefined : d.isScreenOn ? '켜짐' : '💤 꺼짐'}
                                             tone={d.isScreenOn === false ? 'warn' : undefined} />
                                        <Row k="작업 단계" v={workStageLabel(d) ?? undefined} empty="— 구앱은 안 보냄" />
                                        <Row k="콜 처리 중" v={d.isHolding === undefined ? undefined : d.isHolding ? 'true' : 'false'} />
                                    </Card>
                                </div>
                                <div className="mb-2" style={{ breakInside: 'avoid' }}>
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
                                <div className="mb-2" style={{ breakInside: 'avoid' }}>
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

    /**
     * 📐 **두 쪽을 나란히 둘 자리가 되나** — 재는 것은 **패널 제 폭**이다.
     *    부모(`Dashboard`)가 재는 것은 «패널이 서느냐»이고, 여기서 재는 것은
     *    «그 안을 좌우로 가를 수 있느냐»라 **다른 질문이다** (규칙 ⑤-4 ⑤: 읽는 곳이 둘이면 값도 둘).
     *    한 쪽이 `COL_MIN` 보다 좁아지면 값이 안 읽히므로 그때는 위아래로 쌓는다.
     */
    const boxRef = useRef<HTMLDivElement>(null);
    const [twoUp, setTwoUp] = useState(true);
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect.width ?? 0;
            setTwoUp(w >= COL_MIN * 2 + 24);   // 24 = 두 쪽 사이 틈과 안쪽 여백
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
        {
            key: 'judging',
            side: 'server',
            node: (
                <Card title="⚖️ 심사 중" tall note={'집은 뒤 · 서버가 하는 일'}>
                    {/* 🔴 **덱에서 빠진 그 콜이다** — 심사석과 같은 기준(`isEvaluating || isPreview`) */}
                    {(() => {
                        const j = (activeRoute ?? []).find(r => !isTerminal(r.status ?? undefined)
                            && (isEvaluating(r.status ?? undefined) || !!r.isPreview));
                        if (!j) return <Row k="(없음)" v={undefined} />;
                        return <>
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
                        </>;
                    })()}
                </Card>
            ),
        },
        {
            key: 'deck',
            side: 'server',
            node: (
                <Card title="📋 콜 리스트" tall note={'지금 쥔 콜'}>
                    {(activeRoute ?? []).length === 0 && <Row k="(없음)" v={undefined} />}
                    {(activeRoute ?? []).map((r, i) => (
                        <Row key={r.id ?? i} k={`${i + 1} ${r.status ?? ''}`}
                             v={`${r.pickup ?? '—'} → ${r.dropoff ?? '—'}`} />
                    ))}
                </Card>
            ),
        },
        {
            key: 'values',
            side: 'server',
            /**
             * 🔴 **«국면 다섯»이 여기 있었다** (이식 C3-3b · 2026-09-11).
             *    `user_filter_phases` 다섯 행을 그대로 비추던 칸인데, **값이 한 벌**이 되며
             *    그릇째 사라졌다. 이제 «지금 쓰는 값 한 벌»을 보여 준다.
             */
            node: (
                <Card title="🎛️ 값 한 벌" tall note={'저장돼 있는 것\nDB · user_filters'}>
                    {FILTER_FIELDS.map(f => (
                        <Row key={f.path} k={f.label}
                             v={`${(filter as any)?.[f.path] ?? '—'}${f.unit}`} />
                    ))}
                    <Row k="마름모" v={`${filter?.srcAngleDeg ?? '—'}° · ${filter?.dstAngleDeg ?? '—'}° · ${filter?.quadRadiusKm ?? '—'}km`} />
                    <Row k="관내(파생)" v={filter?.localMode ? '🏘️ 지금 관내로 잰다' : '아니다'} />
                </Card>
            ),
        },
        {
            key: 'base',
            side: 'server',
            node: (
                <Card title="💾 평소값 (baseFilter)" note={'저장돼 있는 것\nDB · 매일 아침 여기서 시작'}>
                    <Row k="destinationCity" v={baseFilter?.destinationCity} />
                    <Row k="pickupRadiusKm" v={baseFilter?.pickupRadiusKm} />
                    <Row k="destinationRadiusKm" v={baseFilter?.destinationRadiusKm} />
                    <Row k="minFare" v={baseFilter?.minFare} />
                    <Row k="maxFare" v={baseFilter?.maxFare} />
                    <Row k="excludedKeywords" v={baseFilter?.excludedKeywords} />
                </Card>
            ),
        },

        /* ── 📱 앱 — 주고받는 것 (올라온 보고 · 내려갈 값) ── */
        /* 🔴 **「🔍 앱이 무엇을 봤나」가 여기 있었다** — 성적표는 **폰마다 다르므로**
           아래 「📱 폰마다 다른 것」 탭으로 내려갔다 (기사님 지시 2026-09-11).
           위는 **모든 폰에 같은 것**만 둔다. */
        {
            key: 'appFilter',
            side: 'app',
            node: (
                <Card title="📦 앱에 내려갈 필터" tall
                      note={`서버 → 앱\n표가 정한 ${APP_FILTER_KEYS.length}개 (shared APP_FILTER_KEYS)`}>
                    {/* 🔴 키 목록을 여기 또 적지 않는다 — 표가 유일한 원천이다 (규칙 ③).
                        `orderKm`·`pickerAlarmMinFare` 는 서버가 조립할 때 얹으므로 여긴 «숨김» 이다. */}
                    {APP_FILTER_KEYS.map(k => (
                        <Row key={k} k={k} v={(filter as Record<string, unknown> | null)?.[k]} empty="— 숨김" />
                    ))}
                </Card>
            ),
        },
        {
            key: 'phaseNow',
            side: 'app',
            node: (
                <Card title="🎛️ 지금 국면" note={'서버 → 앱\n평면 필터가 말하는 것'}>
                    <Row k="callTarget" v={filter?.callTarget} />
                    <Row k="dispatchPhase" v={filter?.dispatchPhase} />
                    <Row k="isSharedMode" v={filter?.isSharedMode} />
                    <Row k="isActive" v={filter?.isActive} tone={filter?.isActive ? 'ok' : 'warn'} />
                </Card>
            ),
        },
        {
            key: 'net',
            side: 'app',
            node: (
                <Card title="📐 그물의 모양" note={'서버 → 앱\n국면 밖 한 벌'}>
                    <Row k="출발각" v={filter?.srcAngleDeg} />
                    <Row k="목적각" v={filter?.dstAngleDeg} />
                    <Row k="마름모반경" v={filter?.quadRadiusKm} />
                    <Row k="제외 지역" v={filter?.excludedRegions} />
                </Card>
            ),
        },
        {
            key: 'regions',
            side: 'app',
            node: (
                <Card title="🗂️ 영역 — 시군구별" tall note={'서버 → 앱\n앱이 하차지를 맞춰 보는 목록'}>
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
                {/* 🖥️📱 **두 쪽으로 먼저 가르고, 흐르는 것은 그 안에서만** (기사님 지시 2026-09-11).
                    🔴 **신문 단처럼 흐른다** — 창이 좁아도 칸이 숨지 않고, **빈틈도 없다.**
                    ⚠️ 격자(`grid`)로 했더니 **행 높이가 그 줄에서 가장 큰 칸에 맞춰져**
                       짧은 칸 아래가 통째로 비었다 (실측 1280px 에서 세로 1192px).
                       단(`columns`)은 칸을 세로로 이어 흘리므로 그 빈틈이 안 생긴다.
                    ⚠️ **두 쪽을 억지로 나란히 두지 않는다** — 패널이 좁을 때(부모가 재는 하한은
                       346px) 반씩 가르면 한 칸이 170px 라 **값이 읽히지 않는다.** 그때는
                       위아래로 쌓는다 — 쪽 머리글이 남으니 «어느 쪽인가»는 그대로 보인다. */}
                <div ref={boxRef}
                     className={`flex-1 min-h-0 p-2 ${twoUp ? 'flex gap-2 overflow-hidden' : 'flex flex-col gap-2 overflow-y-auto'}`}>
                    {SIDES.map(s => (
                        <section key={s.key}
                                 className={`min-w-0 rounded-xl border border-border-card bg-surface/60 p-1.5 ${twoUp ? 'flex-1 h-full flex flex-col' : ''}`}>
                            <div className="shrink-0 flex items-baseline gap-2 px-1 pb-1.5">
                                <h2 className="text-[12px] font-black text-text-primary">{s.title}</h2>
                                <span className="text-[9px] text-text-muted">{s.note}</span>
                            </div>
                            <div className={twoUp ? 'flex-1 min-h-0 overflow-y-auto' : ''}>
                                <div style={{ columnWidth: `${COL_MIN}px`, columnGap: 8 }}>
                                    {COLUMNS.map(c => c.side !== s.key ? null : (
                                        /* 🔴 칸이 단 경계에서 **잘리지 않게** — 반쯤 잘린 카드는 못 읽는다 */
                                        <div key={c.key} className="mb-2" style={{ breakInside: 'avoid' }}>{c.node}</div>
                                    ))}
                                </div>
                            </div>
                            {/* 📱 **폰별은 앱 쪽 아래에만** — 서버 쪽엔 폰이 여럿일 일이 없다 */}
                            {s.key === 'app' && <PhoneTabs devices={devices} />}
                        </section>
                    ))}
                </div>
            </div>
        </aside>
    );
}
