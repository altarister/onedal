import { shortStopLabel } from './routeUtils';

/**
 * 🎬 **시트 상태바 문장** — 한 줄에 무엇을 담고 무엇을 버리나 (기사님 확정 2026-09-04).
 *
 * ── 왜 순수 함수로 뽑았나 ──
 * 이 줄은 **폰 한 줄(약 56칸)** 안에 들어가야 한다. 화면 안에 흩어 두면 «넘치는가»를
 * 검사할 수가 없다. 여기로 모으면 실제 값으로 길이를 잴 수 있다.
 *
 * ── 기사님이 정한 다이어트 ──
 * | | 무엇을 | 왜 |
 * |---|---|---|
 * | ㉮ | 지명을 **6자에서 자른다** | 09-03 자료 72종 중 평균 3.5자인데 `경기광주자연앤자이점`(10자)이 섞인다 |
 * | ㉯ | «이동 중»·«정차 중»을 **기호로** | ▶ · ⏸ 로 6~8칸을 던다 |
 * | ㉰ | **«어디서»를 뺀다** | 다녀온 곳은 콜 헤더의 진행 점과 지도의 흰 링이 이미 말한다 |
 * | ㉱ | 거리 대신 **카카오가 준 분** | 직선 거리는 우리가 아는 값 중 가장 부정확했다. 카카오가 `sections[0].duration` 으로 **도로 기준**을 준다 (기사님 물음으로 찾았다) |
 *
 * 🔴 **모르면 안 적는다** — 분을 못 받았으면 그 조각을 통째로 뺀다 (규칙 ④).
 *    `~` 는 «통화 전 추정»이라는 뜻이다 (규칙 ⑤-2).
 */

export interface SheetStatusInput {
    /** 진행 중인 콜이 하나도 없나 */
    idle?: boolean;
    /** 새 콜을 판정하는 중인가 */
    judging?: boolean;
    /** 달리는 중인가 (아니면 서 있다) */
    moving?: boolean;
    /** 다음 정거장 — 없으면 사이클이 끝난 것이다 */
    next?: { visitNo: number; name: string; callNo?: number | null; stop?: '상차' | '하차' } | null;
    /** 🛣️ 카카오가 준 **도로 기준** 남은 주행 분. 모르면 null — 지어내지 않는다 */
    driveMinutes?: number | null;
}

export interface SheetStatus {
    /** ▶ 또는 ⏸ — 낱말 대신 기호로 (㉯) */
    mark: string;
    /** «이동 중» / «정차 중» — 읽어 주는 말(화면에는 기호만 나갈 수도) */
    state: string;
    /** 다음 정거장 번호 (없으면 null) */
    no: number | null;
    /** 잘린 지명 (㉮) */
    name: string;
    /** «2번 콜 · 상차» — 오른쪽에 붙는 꼬리 */
    tail: string;
    /** «~30분» — 카카오 값이 없으면 빈 문자열 (㉱) */
    lead: string;
    /** 콜이 없거나 판정 중이거나 사이클이 끝났을 때의 한 문장 */
    notice: string | null;
}

export function sheetStatus(i: SheetStatusInput): SheetStatus {
    const none = { mark: '', state: '', no: null, name: '', tail: '', lead: '' };
    if (i.idle) return { ...none, notice: '진행 중인 콜 없음 · 새 콜 대기' };
    if (i.judging) return { ...none, notice: '새 콜 판정 중' };
    if (!i.next) return { ...none, notice: '이번 사이클 끝' };

    const n = i.next;
    return {
        mark: i.moving ? '▶' : '⏸',
        state: i.moving ? '이동 중' : '정차 중',
        no: n.visitNo,
        name: shortStopLabel(n.name),
        tail: [n.callNo != null ? `${n.callNo}번 콜` : null, n.stop].filter(Boolean).join(' · '),
        lead: i.driveMinutes != null ? `~${i.driveMinutes}분` : '',
        notice: null,
    };
}

/** 한글 2칸 · 그 밖 1칸으로 센 폭 — 폰 400px·13px 한 줄이 약 56칸이다 */
export function textWidth(s: string): number {
    let w = 0;
    for (const ch of s) w += ch.codePointAt(0)! > 0x1100 ? 2 : 1;
    return w;
}

/** 화면에 실제로 나가는 한 줄 (길이를 재기 위한 것 — 그리기는 화면이 한다) */
export function sheetStatusLine(s: SheetStatus): string {
    if (s.notice) return s.notice;
    return [s.mark, s.no != null ? `${s.no}` : '', s.name, s.lead, s.tail].filter(Boolean).join(' ');
}
