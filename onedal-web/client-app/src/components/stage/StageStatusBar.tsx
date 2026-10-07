import { callNodeFill, callNodeText, type UiTheme } from '../../styles/callPalette';
import type { SheetStatus } from '../../lib/sheetStatus';
import type { DepartureDue } from '../dashboard/DepartureCountdown';

/**
 * 🎬 **시트 상태바** — 무대(`StageView`)가 시트 손잡이 줄(`peekBar`)에 끼우는 한 줄.
 * 이 파일은 위(`StageView`)를 가져오지 않는다 — 방향: StageView → StageStatusBar.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: 없음 — 값은 props 로 받고, 누름은 `onBarTap` · `toggleHidePast` 로 부모에게 넘긴다.
 */
interface Props {
    bar: SheetStatus;
    departure: DepartureDue | null;
    theme: UiTheme;
    pastCount: number;
    hidePast: boolean;
    toggleHidePast: () => void;
    onBarTap: () => void;
}

export default function StageStatusBar({ bar, departure, theme, pastCount, hidePast, toggleHidePast, onBarTap }: Props) {
    return (
                          /* 🔴 **버튼 안에 버튼을 넣지 않는다** — 줄 전체가 «시트를 여는 버튼»
                             이었는데 오른쪽에 숨기기 버튼이 붙으므로 형제로 나눈다 */
                          <div className="w-full flex items-center gap-1">
                            <button type="button"
                                onClick={onBarTap}
                                className="w-full flex items-center gap-1.5 text-left min-h-[30px] active:opacity-70 transition-opacity">
                                <span className="shrink-0">{bar.mark}</span>
                                {/* 📅 판정 중인 콜이 예약 콜이면 보관 날 — 줄지 않는다(shrink-0) · 넘치면 옆 글자가 먼저 줄어든다 */}
                                {bar.reservedDay && <span className="shrink-0 font-black text-info">📅 {bar.reservedDay}</span>}
                                {/* 📍 판정 중인 콜의 주소가 대략이면 — 예약 날과 같은 규칙(줄지 않고 옆 글자가 먼저 줄어든다) */}
                                {bar.approx && <span className="shrink-0 font-black text-warning">{bar.approx}</span>}
                                {bar.notice ? (
                                    <span className="min-w-0 truncate text-text-muted font-semibold">· {bar.notice}</span>
                                ) : null}
                                {!bar.notice && (
                                    <>
                                        <span className="shrink-0 w-[19px] h-[19px] rounded-full grid place-items-center text-[12px] font-black leading-none"
                                            /* 🎨 **색도 번호도 `bar` 에서 온다** — «도착» 경우엔 번호가
                                                 다녀온 정거장인데 색이 다음 콜이면 «색 = 번호»가 깨진다 (규칙 ⑤-3) */
                                            style={bar.callNo != null && bar.stopKind ? {
                                                background: callNodeFill(bar.callNo, bar.stopKind, theme),
                                                color: callNodeText(bar.stopKind, theme),
                                            } : { background: 'var(--color-info)', color: '#fff' }}>
                                            {bar.no}
                                        </span>
                                        <span className={bar.reservedDay || bar.approx ? 'min-w-0 truncate' : 'shrink-0'}>{bar.name}</span>
                                        {bar.lead && <span className="shrink-0 text-text-muted font-semibold">{bar.lead}</span>}
                                        <span className="ml-auto shrink-0 text-text-muted font-semibold truncate">{bar.tail}</span>
                                    </>
                                )}
                                {bar.due && departure && (
                                    /* 🚩 늦으면 붉게 · 15분 안이면 노랗게 — 근거 전문은 손대면 나온다 (title) */
                                    <span title={departure.title}
                                        className={`${bar.notice ? 'ml-auto ' : ''}shrink-0 tabular-nums font-black ${
                                            departure.late ? 'text-danger' : departure.tight ? 'text-warning' : 'text-info'}`}>
                                        {bar.due}
                                    </span>
                                )}
                                {!bar.notice && <span className="shrink-0 text-text-muted">›</span>}
                            </button>
                            {/**
                              * 🙈 **지나간 콜 숨기기.**
                              *    🔴 **끝난 콜이 있을 때만 뜬다** — 없을 때 떠 있으면 한 줄(56칸)을
                              *       괜히 먹는다.
                              *    ⚠️ ▾ 는 «보이는 중», ▸ 는 «접힌 중» — 아코디언과 같은 문법이다.
                              */}
                            {pastCount > 0 && (
                                <button type="button" onClick={toggleHidePast}
                                    title={hidePast ? '지나간 콜 보기' : '지나간 콜 숨기기'}
                                    className="shrink-0 ml-auto px-1.5 py-0.5 rounded-md text-[11px] font-bold text-text-muted active:opacity-70">
                                    {hidePast ? '▸' : '▾'} 지난 {pastCount}
                                </button>
                            )}
                          </div>
    );
}
