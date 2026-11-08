import { useEffect, useRef, type ReactNode } from 'react';
import { clockText, manwonText, wonText } from '@onedal/shared';
import { useTheme } from '@onedal/ui/theme';
import JudgmentSeat from '../components/dashboard/JudgmentSeat';
import CallEvidenceDrawer from '../components/dashboard/CallEvidenceDrawer';
import {
    C1_INSUNG_COD_LIST, C1_DETAIL_READ_COLLECT, C2_INSUNG_COD_MANUAL, C3_H24_PREPAID_COD, C4_H24_RECEIPT,
    C5_PICKER_SMALL, C6_PICKER_LARGE, C7_ISFLEX_OVERLOAD, C8_DROP_DAY0, C9_DROP_DAY1, C10_DROP_DAY2,
    nowOf, lineWon, type MockCall,
} from './step6MockCalls';

/**
 * 🧭 **걸음 6 목업 — «관제웹 화면이 어떻게 바뀌나»를 커밋마다 지금 / 바뀐 뒤로 나란히** (기사님이 아침에 보고 정하시는 자료)
 *
 * 근거는 판 파일 «고칠 자리 표 걸음 6» 의 0장 🔶(A~F) · 1장 화면 칸 · 6장 목업 자료다 — 글자와 숫자를 거기서 그대로 옮겼다(지어낸 값 없음).
 *
 * 🔴 **«지금» 칸은 목업용으로 따로 그리지 않고 진짜 부품에 고정 값만 먹인다** (`/mockup/sheet` 와 같은 규약 · 규칙 ③).
 *    판정석 · 판정 근거 서랍이 그렇다. 고정 경로 칸 · 단계 요약 · 하차 완료 시트 · 끝난 콜 서랍처럼
 *    저장소 · 소켓을 함께 요구하는 부품은 고정 값으로 못 띄워 «지금 화면 글자 그대로»를 같은 클래스로 그리고 칸 머리에 «그림»이라 밝힌다.
 * 🔴 **«바뀐 뒤» 칸은 아직 코드가 없다** — 표의 «바뀐 뒤 글자 그대로»를 지금 부품과 같은 클래스 · 색으로 그린다.
 * ⚠️ 서버에 아무것도 쓰지 않는다. 판정석은 직접 갈래 콜이라 결재 단추가 없다.
 */

const NOW_REAL = '지금 (실물 부품 · 예시 콜을 먹임)';
const NOW_DRAWN = '지금 (그림 — 지금 화면 글자 그대로)';
const AFTER = '바뀐 뒤 (그림 — 걸음 6 커밋 뒤 실물이 이렇게 됨)';

/** 🔶 결정거리 — 표 0장 문장을 짧게 */
const DECISIONS: Array<{ key: string; what: string; ga: string; na: string }> = [
    { key: 'A', what: '운영센터 · 운행일지 · 시뮬레이터 현황의 요금이 무엇을 읽나 (🔴 운영센터 숫자)', ga: '장부가 옛 요금 칸을 더 적지 않고, 읽는 곳 넷이 기사님 몫 칸을 읽는다 — 기사님 몫이 빈 옛 줄만 옛 요금. 로컬 바뀜 0', na: '장부가 옛 요금 칸에 계속 같은 값을 적고 읽는 곳은 그대로 — 같은 값 사본이 둘' },
    { key: 'B', what: '시뮬레이터 콜 모양을 이번에 어디까지 맞추나', ga: '여덟 계획이 고르는 칸만 맞춘다(정거장 거리 · 공유콜 · 동 이름 · 돈 줄 · 짐 줄 · 구분 · 형태). 시각 칸 · 짝 검사는 기본 콜 계획에서', na: '시뮬레이터 콜 칸 전부를 바꾸고 짝 검사를 더한다 — 시뮬레이터 화면 70 자리 남짓이 한 번에 바뀐다' },
    { key: 'C', what: '시뮬레이터 견본 사본(기사님 파일 · git 밖)을 맞추나', ga: '건드리지 않는다 — «사본 없음(읽는 곳 0)»으로 닫는다', na: '그 파일을 고쳐 처음으로 커밋한다' },
    { key: 'D', what: '시뮬레이터 화물24시 확정 전 상세의 상차지 · 하차지를 실물 꼴(도로명 · 번지 + 상호)로 그리나', ga: '그린다 — 계획서 밖 일을 걸음 6 에 넣는 범위 확장 · 시뮬레이터 화물24시 콜에만 효과', na: '동까지 그대로 — 상세 주소 · 상호 확인 자리가 계속 빈다' },
    { key: 'E', what: '«🏁 하차» 날이 2 이상일 때의 글자', ga: '«🏁 11/11(수) 하차 14:00» — 상차 «📅 예약» 알약과 같은 날 글자', na: '날 2 이상은 «🏁» 를 그리지 않는다(원본 칸 목록에만)' },
    { key: 'F', what: '옛 장부 줄을 지키는 장치 셋(옛 줄 돈 묶음 되살리기 · 옛 요금 물러설 길 · 판 번호 1 은 옛 길)을 두나', ga: '셋 다 둔다 — 기사님이 정하신 맞춤 1장(11-08)이 «이미 정해진 것»으로 적었다', na: '셋 다 없앤다 — 로컬 시험 콜 두 줄의 관제웹 금액이 «금액미상»으로 빈다' },
];

/** 덩어리 하나 — 커밋 하나 */
function Block({ title, explain, children }: { title: string; explain: string; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-border-card bg-surface p-3 sm:p-4 flex flex-col gap-3">
            <div>
                <h2 className="text-[15px] font-black text-text-primary">{title}</h2>
                <p className="mt-1 text-[12px] text-text-muted leading-relaxed">{explain}</p>
            </div>
            {children}
        </section>
    );
}

/** 자리 하나 — «지금» / «바뀐 뒤» 두 칸 (폰 폭에서는 위아래) */
function Pair({ place, nowHead = NOW_DRAWN, afterHead = AFTER, now, after }: {
    place: string; nowHead?: string; afterHead?: string; now: ReactNode; after: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-bold text-text-primary">{place}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="min-w-0 rounded-lg border border-border-card bg-bg-base p-2">
                    <div className="mb-1.5 text-[10.5px] font-bold text-text-muted">{nowHead}</div>
                    {now}
                </div>
                <div className="min-w-0 rounded-lg border border-info/40 bg-bg-base p-2">
                    <div className="mb-1.5 text-[10.5px] font-bold text-info">{afterHead}</div>
                    {after}
                </div>
            </div>
        </div>
    );
}

const None = ({ why }: { why?: string }) => <div className="text-[11px] text-text-muted">(없음{why ? ` — ${why}` : ''})</div>;

/** 판정 근거 서랍을 펼친 채로 보이게 — 실물 부품은 접힌 채 시작한다 */
function OpenDrawer({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { const d = ref.current?.querySelector('details'); if (d) d.open = true; }, []);
    return <div ref={ref}>{children}</div>;
}

const stopsText = (c: MockCall) => {
    const p = (c.pickupDetails as Array<{ listText: string }>)[0]?.listText;
    const d = (c.dropoffDetails as Array<{ listText: string }>).at(-1)?.listText;
    return `${p} → ${d}`;
};

/** 고정 경로 칸 덱 머리 (그림) — 왼쪽 경로 · 맨 오른쪽 금액 */
const DeckHead = ({ c, won }: { c: MockCall; won: number }) => (
    <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-text-muted">
        <span className="font-bold text-text-primary truncate">{stopsText(c)}</span>
        {typeof c.vehicleType === 'string' && (
            <span className="px-1.5 rounded-[5px] text-[11px] font-black border bg-surface-alt border-border-card text-text-primary">{c.vehicleType}</span>
        )}
        <span className="ml-auto text-[17px] font-black text-text-primary tabular-nums">{manwonText(won)}원</span>
    </div>
);

/** 펼친 콜 맨 위 노란 줄 (그림) */
const CodBanner = ({ children }: { children: ReactNode }) => (
    <div className="flex items-center gap-2 bg-warning/12 border border-warning/40 rounded-md px-2 py-2">
        <span>💵</span>
        <span className="text-[12px] font-bold text-warning">{children}</span>
    </div>
);

/** 단계 하차 완료 칸의 메타 · 단추 (그림) */
const StepMeta = ({ text, buttons }: { text: string; buttons?: boolean }) => (
    <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <span className="font-bold text-text-primary">🏁 하차 완료</span>
        <span className="font-bold text-warning">{text}</span>
        {buttons && (
            <span className="ml-auto flex gap-1.5">
                <span className="px-2 py-1 rounded-md bg-success/15 text-success font-black text-[11px]">받았음</span>
                <span className="px-2 py-1 rounded-md bg-danger/15 text-danger font-black text-[11px]">못 받음</span>
            </span>
        )}
    </div>
);

/** 판정 근거 서랍 머리 줄 (그림) — 실물과 같은 « · » 잇기 */
const DrawerHead = ({ c, won, flag }: { c: MockCall; won: number; flag?: string }) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted px-0.5">
        <span>단독 {Number(c.kakaoSoloDistanceKm).toFixed(1)}km / {String(c.kakaoSoloDurationMin)}분</span>
        <span>·</span>
        <span>{wonText(won)}({c.money.paymentType})</span>
        <span>·</span><span>수수료 {c.money.feeRateText}</span>
        {flag && <><span>·</span><span className="text-warning font-bold">{flag}</span></>}
    </div>
);

/** 판정 근거 서랍 원본 칸 줄 (그림) — 실물 줄과 같은 클래스 */
const RawRows = ({ rows }: { rows: Array<[string, unknown]> }) => (
    <div className="flex flex-col gap-1 select-text font-mono">
        {rows.map(([k, v]) => (
            <div key={k} className="flex bg-surface-alt/40 p-1 rounded text-[10px]">
                <span className="w-[190px] flex-shrink-0 text-text-muted font-bold">route.{k} :</span>
                <span className="text-text-muted truncate flex-1">{v == null || v === '' ? '-' : String(v)}</span>
            </div>
        ))}
    </div>
);

const MONEY_LABEL: Record<string, string> = { income: '기사님 몫', collect: '받을 돈', consign: '탁송료' };

/** 6-3 뒤 원본 칸 — 표 6장 «바뀐 뒤» 칸 순서 그대로, 값은 예시 콜에서 읽는다 */
function afterRows(c: MockCall): Array<[string, unknown]> {
    const p = (c.pickupDetails as Array<Record<string, unknown>>)[0] ?? {};
    const d = (c.dropoffDetails as Array<Record<string, unknown>>).at(-1) ?? {};
    const load = c.load as { sizeText?: string | null } | undefined;
    return [
        ['id', c.id], ['type', c.type], ['status', c.status],
        ['stageText', c.stageText], ['requesterName', c.requesterName],
        ['dispatcherName', c.dispatcherName], ['dispatcherPhone', c.dispatcherPhone],
        ['pickup', p.listText], ['dropoff', d.listText],
        ['tripType', c.tripType], ['orderForm', c.orderForm], ['tagsText', c.tagsText],
        ['pickupPromise', p.promiseText], ['dropoffPromise', d.promiseText],
        ...c.money.lines.map(l => [`money.${l.kind}`, `${l.won.toLocaleString('ko-KR')} «${l.shown}»${MONEY_LABEL[l.kind] ? ` ${MONEY_LABEL[l.kind]}` : ''}`] as [string, unknown]),
        ['money.feeRateText', c.money.feeRateText], ['money.paymentType', c.money.paymentType], ['money.billingType', c.money.billingType],
        ['itemDescription', c.itemDescription], ['vehicleType', c.vehicleType], ['load.sizeText', load?.sizeText],
        ['distanceKm', c.distanceKm], ['approachDurationMin', c.approachDurationMin],
        ['kakaoSoloDistanceKm', c.kakaoSoloDistanceKm], ['kakaoSoloDurationMin', c.kakaoSoloDurationMin],
        ['deliveryDistance', d.distanceKm], ['detailMemo', c.detailMemo],
        ['timestamp', c.timestamp], ['postTime', c.postTime],
    ];
}

/** 시뮬레이터 · 그 밖의 자리 — 글자만 나란히 (그림) */
const Txt = ({ children, tone = 'text-text-primary' }: { children: ReactNode; tone?: string }) => (
    <div className={`text-[12px] font-bold leading-relaxed break-words ${tone}`}>{children}</div>
);

/** ③ 의 «더보기» 안 첫 줄 (그림) — 잡은 시각 · 차종 · 수수료 뒤에 🏁 */
const MoreFirstLine = ({ c, flag }: { c: MockCall; flag?: string }) => (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-text-muted tabular-nums">
        <span>잡은 시각 <b className="text-text-primary">{clockText(String(c.capturedAt)) ?? '-'}</b></span>
        <span className="px-1.5 rounded-[5px] font-black border bg-surface-alt border-border-card text-text-primary">{String(c.vehicleType)}</span>
        <span>· 수수료 {String(c.commissionRate)}</span>
        {flag && <span className="text-warning font-bold">{flag}</span>}
    </div>
);

const Chip = ({ text }: { text: string }) => (
    <span className="px-2 py-0.5 rounded-md border font-black text-[11px] bg-surface-alt/60 border-border-card text-text-primary">📦 {text}</span>
);

export default function Step6Mockup() {
    const { theme, toggleTheme } = useTheme();
    const c2Income = lineWon(C2_INSUNG_COD_MANUAL, 'income') ?? 0;
    const c3Income = lineWon(C3_H24_PREPAID_COD, 'income') ?? 0;
    const c2Collect = lineWon(C2_INSUNG_COD_MANUAL, 'collect') ?? 0;
    const c1Collect = C1_DETAIL_READ_COLLECT.won;
    const noSeatState = { processingId: null, setProcessingId: () => {} };

    return (
        <div className="min-h-dvh bg-bg-base text-text-primary px-4 py-4">
            <div className="max-w-5xl mx-auto flex flex-col gap-4">
                <header className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-[18px] font-black">걸음 6 — 관제웹 화면이 어떻게 바뀌나</h1>
                        <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
                            예시 콜은 모두 가짜(시뮬레이터 꼴)이며 금액 45,000 / 34,650 은 인성 설명 영상 · 200,000 / 180,000 은 화물24시 실물 캡처의 숫자입니다.
                        </p>
                    </div>
                    <button onClick={toggleTheme} className="shrink-0 h-8 px-3 rounded-lg bg-surface border border-border-card text-xs font-bold">
                        {theme === 'dark' ? '☀️ 밝게' : '🌙 어둡게'}
                    </button>
                </header>

                <section className="rounded-xl border border-warning/40 bg-surface p-3 sm:p-4">
                    <h2 className="text-[14px] font-black">🔶 기사님이 고르실 것 — 가 / 나</h2>
                    <ul className="mt-2 flex flex-col gap-2">
                        {DECISIONS.map(d => (
                            <li key={d.key} className="text-[12px] leading-relaxed">
                                <b className="text-text-primary">{d.key}. {d.what}</b>
                                <div className="text-text-muted"><b className="text-success">가(추천)</b> {d.ga}</div>
                                <div className="text-text-muted"><b>나</b> {d.na}</div>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-text-muted">운행(판정 · 필터 · 잡기)이 바뀌는 커밋은 없습니다. 아래는 화면이 바뀌는 커밋만 모았습니다.</p>
                </section>

                {/* ━━━ 6-3 ━━━ */}
                <Block title="6-3 판정 근거 서랍 — 🔴 관제웹 화면 바뀜"
                    explain="콜을 펼쳐 «판정 근거 · 원본 데이터»를 열면 보이는 줄이 새 칸 이름으로 바뀝니다. 하차 약속 · 화면 기록 · 돈 줄(기사님 몫 · 받을 돈 · 탁송료) · 짐 크기 원문이 한눈에 보이고, 옛 요금 · 수수료 · 결제 줄은 돈 줄로 옮겨 갑니다. 서랍은 접혀 있어 운전 중 화면은 그대로입니다.">
                    <Pair place="원본 칸 전부 — 예시 ② 인성 착불 손 확정 콜" nowHead={NOW_REAL}
                        now={<OpenDrawer><CallEvidenceDrawer route={nowOf(C2_INSUNG_COD_MANUAL)} soloKm={12.3} soloMin={25} milestoneLog={[]} /></OpenDrawer>}
                        after={<div className="flex flex-col gap-2">
                            <DrawerHead c={C2_INSUNG_COD_MANUAL} won={C2_INSUNG_COD_MANUAL.fare} />
                            <div className="text-[10.5px] text-text-muted">머리 줄은 6-3 에서 그대로 (금액은 6-4 에서 바뀜)</div>
                            <RawRows rows={afterRows(C2_INSUNG_COD_MANUAL)} />
                        </div>} />
                    <Pair place="플렉스 과적 콜 — 예시 ⑦ (구분 줄은 «-», «과적»은 화면 기록 줄에)" nowHead={NOW_REAL}
                        now={<OpenDrawer><CallEvidenceDrawer route={nowOf(C7_ISFLEX_OVERLOAD)} soloKm={null} soloMin={null} milestoneLog={[]} /></OpenDrawer>}
                        after={<RawRows rows={[['tripType', C7_ISFLEX_OVERLOAD.tripType], ['tagsText', C7_ISFLEX_OVERLOAD.tagsText]]} />} />
                </Block>

                {/* ━━━ 6-4 ━━━ */}
                <Block title="6-4 금액 · 착불 안내 — 🔴 관제웹 화면 바뀜"
                    explain="금액 자리가 판정과 같은 «기사님 몫»을 보입니다. 착불 안내는 기사님 몫이 아니라 실제로 받을 현금이고, 모르면 «금액은 앱에서 확인»입니다. 금액을 몰라도 «받았음 / 못 받음»을 눌러 미수를 남깁니다. 화물24시 선/착불 콜(시뮬레이터)에는 현장 현금 안내가 생깁니다.">
                    <Pair place="판정석 금액 — 예시 ② 인성 착불 손 확정" nowHead={NOW_REAL}
                        afterHead={`${AFTER} · 지금 판정석에 기사님 몫 ${c2Income.toLocaleString('ko-KR')} 을 넣어 그림`}
                        now={<JudgmentSeat route={nowOf(C2_INSUNG_COD_MANUAL)} confirmedActive={0} inset="0" {...noSeatState} />}
                        after={<JudgmentSeat route={{ ...nowOf(C2_INSUNG_COD_MANUAL), fare: c2Income }} confirmedActive={0} inset="0" {...noSeatState} />} />
                    <Pair place="고정 경로 칸 금액(덱 머리 맨 오른쪽) — 예시 ② 인성 착불 손 확정"
                        now={<DeckHead c={C2_INSUNG_COD_MANUAL} won={C2_INSUNG_COD_MANUAL.fare} />}
                        after={<DeckHead c={C2_INSUNG_COD_MANUAL} won={c2Income} />} />
                    <Pair place="고정 경로 칸 금액 — 예시 ③ 화물24시 선/착불"
                        now={<DeckHead c={C3_H24_PREPAID_COD} won={C3_H24_PREPAID_COD.fare} />}
                        after={<DeckHead c={C3_H24_PREPAID_COD} won={c3Income} />} />
                    <Pair place="착불 안내(펼친 콜 맨 위 노란 줄) — 예시 ② 손 확정 (같음)"
                        now={<CodBanner>착불 — 하차 시 <b>{wonText(C2_INSUNG_COD_MANUAL.fare)}</b> 직접 수령</CodBanner>}
                        after={<CodBanner>착불 — 하차 시 <b>{wonText(c2Collect)}</b> 직접 수령</CodBanner>} />
                    <Pair place="착불 안내 — 예시 ① 목록에서 잡음 · 확정 뒤 상세를 읽음"
                        now={<CodBanner>착불 — 하차 시 <b>{wonText(C1_INSUNG_COD_LIST.fare)}</b> 직접 수령</CodBanner>}
                        after={<CodBanner>착불 — 하차 시 <b>{wonText(c1Collect)}</b> 직접 수령</CodBanner>} />
                    <Pair place="착불 안내 — 예시 ① 목록에서 잡음 · 상세를 못 읽음"
                        now={<CodBanner>착불 — 하차 시 <b>{wonText(C1_INSUNG_COD_LIST.fare)}</b> 직접 수령</CodBanner>}
                        after={<CodBanner>착불 — 하차 시 직접 수령 (금액은 앱에서 확인)</CodBanner>} />
                    <Pair place="착불 안내 — 예시 ③ 화물24시 선/착불"
                        now={<None />}
                        after={<CodBanner>현장 현금 — 상차지 또는 하차지에서 직접 수령 (금액은 앱에서 확인)</CodBanner>} />
                    <Pair place="단계 하차 완료 칸 — 예시 ② 손 확정 (같음)"
                        now={<StepMeta text={`💵 착불 ${manwonText(C2_INSUNG_COD_MANUAL.fare)}`} />}
                        after={<StepMeta text={`💵 착불 ${manwonText(c2Collect)}`} />} />
                    <Pair place="단계 하차 완료 칸 — 예시 ① 상세를 못 읽음"
                        now={<StepMeta text={`💵 착불 ${manwonText(C1_INSUNG_COD_LIST.fare)}`} />}
                        after={<StepMeta text="💵 착불 — 금액 모름" />} />
                    <Pair place="단계 하차 완료 칸 — 예시 ③ 화물24시 선/착불"
                        now={<None why="단추도 없음" />}
                        after={<StepMeta text="💵 현장 현금 — 금액 모름" buttons />} />
                    <Pair place="하차 완료 시트 — 예시 ② 손 확정 (같음)"
                        now={<Txt tone="text-warning">💵 착불 {wonText(C2_INSUNG_COD_MANUAL.fare)} — 지금 받으세요</Txt>}
                        after={<Txt tone="text-warning">💵 착불 {wonText(c2Collect)} — 지금 받으세요</Txt>} />
                    <Pair place="하차 완료 시트 — 예시 ① 상세를 못 읽음"
                        now={<Txt tone="text-warning">💵 착불 {wonText(C1_INSUNG_COD_LIST.fare)} — 지금 받으세요</Txt>}
                        after={<Txt tone="text-warning">💵 착불 — 금액은 앱에서 확인 (단추 그대로)</Txt>} />
                    <Pair place="판정 근거 서랍 머리 — 예시 ②"
                        now={<DrawerHead c={C2_INSUNG_COD_MANUAL} won={C2_INSUNG_COD_MANUAL.fare} />}
                        after={<DrawerHead c={C2_INSUNG_COD_MANUAL} won={c2Income} />} />
                    <Pair place="단계 팝업 머리(초록 글자) · 끝난 콜 서랍 — 예시 ②"
                        now={<Txt tone="text-success">{manwonText(C2_INSUNG_COD_MANUAL.fare)}</Txt>}
                        after={<Txt tone="text-success">{manwonText(c2Income)}</Txt>} />
                    <Pair place="예약 줄(서랍 «예약» 칸) — 예약 콜"
                        now={<Txt>… · {manwonText(C2_INSUNG_COD_MANUAL.fare)} · …</Txt>}
                        after={<Txt>… · {manwonText(c2Income)} · …</Txt>} />
                    <Pair place="정산 탭 — 예시 ②"
                        now={<Txt>{wonText(C2_INSUNG_COD_MANUAL.fare)}</Txt>}
                        after={<Txt>{wonText(c2Income)}</Txt>} />
                </Block>

                {/* ━━━ 6-5 ━━━ */}
                <Block title="6-5 🏁 하차 · 라면박스 — 🔴 관제웹 화면 바뀜"
                    explain="하차 약속 시각이 🕒 옆에 «🏁 하차 14:00»으로 한 줄 붙습니다(🕒 와 같은 색 · 굵기, 🕒 가 없어도 🏁 만 뜸). 픽커 짐은 «라면박스 2개»로 보입니다. 크기 낱말이 있는데 박스 수를 모르면 «대형»처럼 원문을 그대로 보입니다.">
                    <Pair place="판정 근거 서랍 머리 — 예시 ⑧ 하차 약속 오늘 (바뀐 뒤 금액은 6-4 뒤 값)"
                        now={<DrawerHead c={C8_DROP_DAY0} won={C8_DROP_DAY0.fare} />}
                        after={<DrawerHead c={C8_DROP_DAY0} won={c2Income} flag="🏁 하차 14:00" />} />
                    <Pair place="«▸ 더보기» 안 첫 줄 — 예시 ⑨ 하차 약속 내일"
                        now={<MoreFirstLine c={C9_DROP_DAY1} />}
                        after={<MoreFirstLine c={C9_DROP_DAY1} flag="🏁 내일 하차 14:00" />} />
                    <Pair place="«▸ 더보기» 안 첫 줄 — 예시 ⑩ 하차 약속 모레 (🔶 E «가»일 때)"
                        now={<MoreFirstLine c={C10_DROP_DAY2} />}
                        after={<MoreFirstLine c={C10_DROP_DAY2} flag="🏁 11/11(수) 하차 14:00" />} />
                    <Pair place="짐 칩 — 예시 ⑤ 픽커 소형"
                        now={<None why="물품 글이 없어 짐 줄이 안 뜸" />}
                        after={<Chip text="라면박스 2개" />} />
                    <Pair place="짐 칩 — 예시 ⑥ 픽커 대형 (박스 수 모름)"
                        now={<None why="물품 글이 없어 짐 줄이 안 뜸" />}
                        after={<Chip text="대형" />} />
                    <Pair place="짐 칩 — 예시 ② 크기 낱말 없는 콜 (같음)"
                        now={<Chip text={String(C2_INSUNG_COD_MANUAL.itemDescription)} />}
                        after={<Chip text={String(C2_INSUNG_COD_MANUAL.itemDescription)} />} />
                </Block>

                {/* ━━━ 6-7 ━━━ */}
                <Block title="6-7 시뮬레이터 돈 줄 — 시뮬레이터 화면만 (관제웹 그대로)"
                    explain="시뮬레이터 화면의 금액을 실물 꼴로 그립니다. 관제웹 화면은 그대로이고, 원달앱이 시뮬레이터 콜에서 읽는 금액이 실물에 가까워집니다(걸음 7 설치 뒤).">
                    <Pair place="화물24시 목록 4행 — 예시 ③ 선/착불"
                        now={<Txt>독차 인수증 200,000원</Txt>}
                        after={<Txt>독차 선/착불 운 18.0 수 2.0 200,000원</Txt>} />
                    <Pair place={`화물24시 확정 전 상세 금액 표 — 예시 ④ 인수증 (${C4_H24_RECEIPT.dispatcherName as string})`}
                        now={<Txt>[수수료 = (운송료+부가세) x1.298% ] 운송료 45,000 부가세 4,500 결제방법 신용 수납금액 48,858 [산재보험료(차주부담액): 194원]</Txt>}
                        after={<Txt>운송료 140,000 수수료 0 결제방법 인수증 합계금액 140,000 [산재보험료(차주부담액): 610원]</Txt>} />
                    <Pair place="인성 확정 뒤 상세 — 예시 ②"
                        now={<None why="금액 줄 없음" />}
                        after={<Txt>실운임 : 34,650(착불) · 고객에게 받을 금액 45,000 · 수수료 : 23% · 탁송료 : 0</Txt>} />
                </Block>

                {/* ━━━ 6-9 ━━━ */}
                <Block title="6-9 시뮬레이터 표시 글자 — 시뮬레이터 화면만 (관제웹 그대로)"
                    explain="시뮬레이터 목록에 왕복 · 급송 표시를 실물처럼 붙입니다. 인성 · 플렉스는 글자 그대로입니다.">
                    <Pair place="화물24시 목록 1행 하차 — 왕복 콜"
                        now={<Txt>경기 성남 구미동</Txt>}
                        after={<Txt>경기 성남 구미동왕복</Txt>} />
                    <Pair place="픽커 목록 태그 줄 — 급송 콜"
                        now={<Txt>퀵 단거리</Txt>}
                        after={<Txt>퀵 급송 … («급송» 딱지 — 색은 실물 캡처를 보고 맞춤)</Txt>} />
                </Block>

                {/* ━━━ 6-10 ━━━ */}
                <Block title="6-10 시뮬레이터 상세 주소 · 상호 — 🔴 관제웹 화면 바뀜 (시뮬레이터 콜만 · 🔶 D «가»일 때)"
                    explain="시뮬레이터 화물24시 확정 전 상세의 상차지 · 하차지를 실물처럼 도로명 · 번지 · 상호까지 그립니다. 관제웹에서는 시뮬레이터 화물24시 콜의 하차 칸 이름 자리에 상호가 뜹니다.">
                    <Pair place="화물24시 확정 전 상세 상차지"
                        now={<Txt>경기 수원 매탄동</Txt>}
                        after={<Txt>경기 수원 매탄동 삼성로 129 (삼성전자 본사)</Txt>} />
                    <Pair place="화물24시 확정 전 상세 하차지"
                        now={<Txt>경기 성남 구미동</Txt>}
                        after={<Txt>경기 성남 구미동 성남대로43번길 11 (하나로마트 성남점)</Txt>} />
                    <Pair place="관제웹 하차 칸 이름 자리 — 시뮬레이터 화물24시 콜"
                        now={<Txt>구미동</Txt>}
                        after={<Txt>하나로마트 성남점</Txt>} />
                </Block>

                <p className="text-[11px] text-text-muted pb-6">
                    예시 콜: ① {C1_INSUNG_COD_LIST.id} · ② {C2_INSUNG_COD_MANUAL.id} · ③ {C3_H24_PREPAID_COD.id} · ④ {C4_H24_RECEIPT.id} · ⑤ {C5_PICKER_SMALL.id} · ⑥ {C6_PICKER_LARGE.id} · ⑦ {C7_ISFLEX_OVERLOAD.id} · ⑧ {C8_DROP_DAY0.id} · ⑨ {C9_DROP_DAY1.id} · ⑩ {C10_DROP_DAY2.id}
                </p>
            </div>
        </div>
    );
}
