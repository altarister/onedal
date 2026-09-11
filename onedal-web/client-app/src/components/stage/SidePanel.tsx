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
 *    지우는 법 — **이 파일 + `Dashboard.tsx` 의 `<SidePanel …/>` 한 줄.** 그게 전부다.
 *    `sidePanel.test.ts` 가 그 모양(파일 하나·호출 한 곳·무대를 안 건드림)을 잠근다.
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
 * 자리: 무대는 `max-w-2xl`(672px) 가운데 고정이라 **왼쪽 여백이 늘 비어 있다.**
 *       거기에 `fixed` 로 띄우므로 지도·시트는 한 픽셀도 안 움직인다.
 */
import { useEffect, useState } from 'react';
import { APP_FILTER_KEYS } from '@onedal/shared';
import { useFilterConfig } from '../../hooks/useFilterConfig';
/* 🔴 서버 주소를 손으로 적지 않는다 — `apiBase()` 를 거친다.
   2026-09-07 에 `/api` 가 두 번 붙어 실경로가 늘 직선으로 그려진 사고가 있었다 */
import { apiBase } from '../../lib/serverTarget';

/**
 * 칸 하나의 폭. 🔴 **한 칸이 온전히 보이게** 잡는다 (1440px 에서 왼쪽 여백은 384px).
 *    두 칸을 억지로 밀어 넣으면 둘 다 잘려서 **읽을 수가 없다** — 잘린 글자는 없는 것과 같다.
 *    둘째 칸부터는 **가로로 흘러** 밀어서 본다 (기사님 지시: *"왼쪽 영역만 가로스크롤"*).
 */
const COL_W = 352;

interface Health {
    bootedAt?: string;
    git?: { commit?: string; branch?: string };
    [k: string]: unknown;
}

/** 🏷️ 한 줄 — 이름과 값. 값이 없으면 «—» 로 두고 **지어내지 않는다** (규칙 ④) */
function Row({ k, v, tone }: { k: string; v: unknown; tone?: 'warn' | 'ok' }) {
    const text = v === undefined || v === null || v === ''
        ? '—'
        : Array.isArray(v) ? (v.length ? `${v.length}개 · ${v.slice(0, 6).join(', ')}${v.length > 6 ? ' …' : ''}` : '(빈 배열)')
            : typeof v === 'object' ? JSON.stringify(v)
                : String(v);
    return (
        <div className="flex items-baseline gap-2 py-[3px] border-b border-border/40 last:border-0">
            <span className="shrink-0 w-[104px] text-[10px] font-bold text-text-muted truncate" title={k}>{k}</span>
            <span className={`flex-1 min-w-0 text-[11px] font-black break-all ${tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : 'text-text-primary'}`}>
                {text}
            </span>
        </div>
    );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-border bg-surface/70 p-2 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-black text-text-primary">{title}</span>
                {note && <span className="text-[9px] text-text-muted text-right leading-tight">{note}</span>}
            </div>
            <div>{children}</div>
        </section>
    );
}

export default function SidePanel() {
    const { filter, baseFilter, phaseSettings } = useFilterConfig();
    const [health, setHealth] = useState<Health | null>(null);

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
     * 🗂️ **칸 목록 — 순서를 여기 한 줄로 바꾼다** (기사님: *"순서는 너가 알아서 나중에 바꿀수 있어"*).
     *    JSX 에 칸을 박아 두면 순서를 바꿀 때마다 큰 덩어리를 옮겨야 한다.
     *
     * 🔴 **맨 왼쪽이 「앱에 내려갈 값」이다** (기사님 지시: *"왼쪽 맨 끝에는 필터로 내려갈 값도 표시해줘"*).
     */
    const COLUMNS: Array<{ key: string; node: React.ReactNode }> = [
        {
            key: 'app',
            node: (
                <Card title="📦 앱에 내려갈 필터"
                      note={`표가 정한 ${APP_FILTER_KEYS.length}개\n(shared APP_FILTER_KEYS)`}>
                    {/* 🔴 키 목록을 여기 또 적지 않는다 — 표가 유일한 원천이다 (규칙 ③).
                        `orderKm`·`pickerAlarmMinFare` 는 서버가 조립할 때 얹으므로 여기선 «—» 다. */}
                    {APP_FILTER_KEYS.map(k => (
                        <Row key={k} k={k} v={(filter as Record<string, unknown> | null)?.[k]} />
                    ))}
                </Card>
            ),
        },
        {
            key: 'runtime',
            node: (
                <div className="space-y-2">
                    <Card title="🖥️ 지금 무엇이 도는가" note={'10초마다 다시 묻는다'}>
                        <Row k="서버" v={health ? '붙었다' : '못 붙었다'} tone={health ? 'ok' : 'warn'} />
                        <Row k="bootedAt" v={health?.bootedAt} />
                        <Row k="git" v={health?.git?.commit ? `${health.git.branch ?? ''} ${health.git.commit}`.trim() : undefined} />
                    </Card>
                    <Card title="🎛️ 지금 국면" note={'평면 필터가 말하는 것'}>
                        <Row k="callTarget" v={filter?.callTarget} />
                        <Row k="dispatchPhase" v={filter?.dispatchPhase} />
                        <Row k="isSharedMode" v={filter?.isSharedMode} />
                        <Row k="isActive" v={filter?.isActive} tone={filter?.isActive ? 'ok' : 'warn'} />
                    </Card>
                    <Card title="📐 그물의 모양" note={'국면 밖 한 벌'}>
                        <Row k="출발각" v={filter?.srcAngleDeg} />
                        <Row k="목적각" v={filter?.dstAngleDeg} />
                        <Row k="마름모반경" v={filter?.quadRadiusKm} />
                        <Row k="제외 지역" v={filter?.excludedRegions} />
                    </Card>
                </div>
            ),
        },
        {
            key: 'phases',
            node: (
                <Card title="🗂️ 국면 다섯" note={'user_filter_phases 행'}>
                    {phaseSettings
                        ? Object.entries(phaseSettings).map(([k, s]) => (
                            <Row key={k} k={k}
                                 v={`${s.destinationCity || '—'} · 상차 ${s.pickupRadiusKm} · 우회 ${s.detourAllowKm} · 하차 ${s.dropoffRadiusKm} · 할인 ${s.discountPct}%`} />
                        ))
                        : <Row k="(없음)" v={undefined} />}
                </Card>
            ),
        },
        {
            key: 'base',
            node: (
                <Card title="💾 평소값 (baseFilter)" note={'DB · 매일 아침 여기서 시작'}>
                    <Row k="destinationCity" v={baseFilter?.destinationCity} />
                    <Row k="pickupRadiusKm" v={baseFilter?.pickupRadiusKm} />
                    <Row k="destinationRadiusKm" v={baseFilter?.destinationRadiusKm} />
                    <Row k="minFare" v={baseFilter?.minFare} />
                    <Row k="maxFare" v={baseFilter?.maxFare} />
                    <Row k="excludedKeywords" v={baseFilter?.excludedKeywords} />
                </Card>
            ),
        },
    ];

    return (
        <aside
            /* 🔴 무대(가운데 672px)를 한 픽셀도 안 건드린다 — 왼쪽 빈 자리에 얹을 뿐이다 */
            className="fixed left-0 top-0 h-screen z-30 border-r border-border bg-background/95 backdrop-blur-sm"
            style={{ width: `calc((100vw - 42rem) / 2)` }}
        >
            <div className="h-full flex flex-col">
                <div className="shrink-0 px-2 py-1.5 border-b border-border flex items-baseline gap-2">
                    <span className="text-[11px] font-black text-text-primary">🔬 같은 것을 본다</span>
                    <span className="text-[9px] text-text-muted">폰에서는 안 뜹니다 · 옆으로 밀면 더 있습니다 →</span>
                </div>
                {/* 🔴 **가로로 흐른다** (기사님: *"왼쪽 영역만 가로스크롤을 주면 항상 프로젝트 화면을 볼수 있겠다"*) —
                    칸이 늘어도 지도를 덮지 않는다. 칸 **안**은 세로로 흐른다. */}
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
                    <div className="h-full flex gap-2 p-2">
                        {COLUMNS.map(c => (
                            <div key={c.key} className="h-full shrink-0 overflow-y-auto" style={{ width: COL_W }}>
                                {c.node}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
}
