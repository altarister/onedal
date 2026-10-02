import type { TargetAppType } from './index';
import { NETWORK_PAGES, type NetworkPageSpec } from './networkPages';

type Screen = NetworkPageSpec['screens'][number];
type Overlay = Screen['overlays'][number];

/** 📸 모을 것 한 줄 — 페이지 자체(overlay 없음) 또는 그 위에 뜨는 것 */
export interface CollectRow {
    network: TargetAppType;
    page: string;
    overlay?: string;
    kind: 'PAGE' | Overlay['kind'];
    /** 무엇을 모으나 — 표의 toCollect · 없으면 «캡처» */
    what: string;
    /** 어디서 여나 — 위에 뜨는 것은 그 페이지 · 페이지는 toCollect 괄호 글 · 없으면 자리 모름 */
    openAt: string;
    seen: Screen['seen'];
}

/** 근거가 비었거나 아직 모을 것이 적혔으면 «모을 것» */
const needsCollect = (x: { evidence: string[]; toCollect?: string }) => x.evidence.length === 0 || !!x.toCollect;

/** 표 toCollect 의 괄호 글(«캡처 · 알아보는 글자 (확정 뒤 상세 ‹카드 승인› 버튼 뒤)» → 괄호 안) */
const placeIn = (toCollect: string | undefined) => toCollect?.match(/\(([^()]+)\)\s*$/)?.[1];

/**
 * 📸 **배차망 화면 — 모을 것** (reviews/35 1-2단계 · 기사님 «모든 페이지 모든 팝업을 인지»).
 * 배차망 정의 표(NETWORK_PAGES)의 페이지 · 그 위에 뜨는 것에서 표 차례대로 뽑는다 — 손으로 적은 목록이 아니다.
 * 이 목록이 0 이 되면 그 배차망 화면을 다 아는 것이다. 운영센터 점검 «이상 기록»이 읽는다.
 */
export function collectListOf(pages: Record<TargetAppType, NetworkPageSpec> = NETWORK_PAGES): CollectRow[] {
    return (Object.keys(pages) as TargetAppType[]).flatMap(network => pages[network].screens.flatMap(s => {
        const own: CollectRow[] = needsCollect(s) ? [{
            network, page: s.name, kind: 'PAGE', what: s.toCollect ?? '캡처',
            openAt: placeIn(s.toCollect) ?? '배차망 메뉴에서(자리 모름)', seen: s.seen,
        }] : [];
        const above = s.overlays.filter(needsCollect).map((o): CollectRow => ({
            network, page: s.name, overlay: o.name, kind: o.kind, what: o.toCollect ?? '캡처',
            openAt: `«${s.name}»에서`, seen: o.seen,
        }));
        return [...own, ...above];
    }));
}

/** 배차망마다 남은 수 — 목록에서 센다 */
export function collectCountOf(rows: CollectRow[]): Record<TargetAppType, number> {
    const counts = Object.fromEntries(Object.keys(NETWORK_PAGES).map(n => [n, 0])) as Record<TargetAppType, number>;
    for (const r of rows) counts[r.network] += 1;
    return counts;
}
