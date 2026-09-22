/**
 * 📍 **픽커 상세 화면 글자에서 전체 주소를 뽑는다** (2026-09-14 폰 시험)
 *
 * ── 왜 ──
 * 픽커 콜 주소는 리스트 줄임 이름(«광주 초월읍»)이었다. 카카오는 «경기 광주시 초월읍»을 맞게 줬는데
 * 서버의 지역 불일치 방어가 첫 낱말 «광주»를 광주광역시로 보고 버렸다 — 경로도 판정도 없었다.
 * 인성은 상세 팝업의 **전체 주소**를 콜 주소로 올려서(`promoteDetailAddresses`) 늘 찾는다.
 * 픽커 상세 화면에도 전체 주소가 있다 — 그것을 인성과 **같은 칸**(`addressDetail`)에 담는다.
 *
 * ── 무엇을 읽나 ──
 * 원달앱이 보내는 상세 글자는 **띄어쓰기로 이어 붙인 한 줄**이다 (`screenTexts.joinToString(" ")`).
 * 주소 덩어리 = **시·도 + 시·군·구 + 동·읍·면…** 으로 시작하고, 그 뒤 건물명이 «픽업 7.2km» 같은 머리 전까지 온다.
 * 첫째 덩어리가 픽업지, 둘째가 배송지다.
 *
 * 🔴 **실물 픽커는 배송지를 원달앱이 읽는 글자에 안 올린다** (09-13 · `pickerScreenOcr.ts`) — 없으면 `null` 이다.
 *    지어내지 않는다 (규칙 ④). 그때 배송지는 리스트 이름 그대로 간다.
 * 🔴 실물 건물명 끝의 `kotlin.Unit` 은 픽커 앱 자체의 버그 글자다 — 뗀다.
 * 🔴 여기서 좌표를 구하지 않는다 — 글자 → 주소 하나만 한다 (검사가 폰 없이 돈다).
 */

/** 시·도 이름 — 주소 덩어리의 머리 (`pickerScreenOcr.ts` 의 목록과 같은 뜻) */
const PROVINCES = new Set([
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]);

/** 시·도 다음 토막 — 시·군·구 */
const SECOND_TIER = /(시|군|구)$/;
/** 그 뒤 행정 토막 — 구·동·읍·면·가·리 (삼성2동 · 금광2동 같은 숫자 동 포함) */
const ADMIN_TAIL = /(시|군|구|읍|면|동|가|리)$/;
/**
 * 건물명이 끝나는 자리 — 상세·수락 뒤 화면의 머리 낱말.
 * 🔴 «오더» — 수락 뒤 화면의 «오더 확인» 버튼 · «오더 확인 <번호>» 글자가 건물명에 붙었다 (2026-09-14 21:28:04 폰 시험 · 서버 장부 «… 곤지암점 오더 확인»)
 */
const STOP_WORDS = new Set([
    '픽업', '배송', '픽업지', '배송지', '물품', '최종', '넘기기', '수락하기', '뒤로가기', '오더번호', '오더',
]);

/**
 * 🔴 **주소 앞의 «픽업지»·«배송지» 표시가 칸을 정한다** (2026-09-14 리뷰).
 * 실물 수락 뒤 아래 창(실물 17)에는 **배송지 주소만** 있다 — «먼저 나온 주소 = 픽업지»로만 정하면 배송지를 픽업지로 올린다.
 * 표시가 없을 때(시뮬레이터 수락 전 상세)만 순서대로 담는다.
 */
const LABEL_SLOT: Record<string, keyof PickerDetailAddresses> = { '픽업지': 'pickup', '배송지': 'dropoff' };

export interface PickerDetailAddresses {
    /** 픽업지 전체 주소 — 못 찾으면 null */
    pickup: string | null;
    /** 배송지 전체 주소 — 실물 픽커는 글자에 없어서 대개 null */
    dropoff: string | null;
}

function readAddressAt(tokens: string[], i: number): { text: string; next: number } | null {
    if (!PROVINCES.has(tokens[i]) || !tokens[i + 1] || !SECOND_TIER.test(tokens[i + 1])) return null;
    const parts = [tokens[i], tokens[i + 1]];
    let j = i + 2;
    while (j < tokens.length && ADMIN_TAIL.test(tokens[j]) && !STOP_WORDS.has(tokens[j])) parts.push(tokens[j++]);
    if (parts.length < 3) return null;                     // «경기 광주시» 까지만이면 주소 덩어리가 아니다
    while (j < tokens.length && !STOP_WORDS.has(tokens[j]) && !/^\d/.test(tokens[j]) && !PROVINCES.has(tokens[j])) {
        parts.push(tokens[j++]);                           // 건물명 — «모다아울렛 곤지암점»
    }
    return { text: parts.join(' '), next: j };
}

export function pickerDetailAddresses(rawText: string): PickerDetailAddresses {
    const tokens = (rawText ?? '').replace(/kotlin\.Unit/g, ' ').split(/\s+/).filter(Boolean);
    const out: PickerDetailAddresses = { pickup: null, dropoff: null };
    for (let i = 0; i < tokens.length && (out.pickup === null || out.dropoff === null); i++) {
        const a = readAddressAt(tokens, i);
        if (!a) continue;
        const labeled = LABEL_SLOT[tokens[i - 1]];
        const slot = labeled ?? (out.pickup === null ? 'pickup' : 'dropoff');
        if (out[slot] === null) out[slot] = a.text;
        i = a.next - 1;
    }
    return out;
}
