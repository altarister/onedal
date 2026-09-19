/**
 * 📷 **픽커 상세 화면을 «그림으로» 읽는다 — 줄을 콜로 옮기는 자리** (2026-09-13 신설)
 *
 * ── 왜 그림인가 ──
 * 접근성 트리로는 **배송지가 아예 안 온다.** 오늘 실측한 같은 화면의 두 길이다:
 *
 *   접근성 : `퀵 14.4km 퀵 16.9km 퀵 19.3km 픽업지 경기 성남시 수정구 위례동
 *             위례역푸르지오4단지아파트kotlin.Unit 물품 정보 초소형 …`
 *   이미지 : `경기 성남시 수정구 위례동 / 위례역푸르지오4단지아파트  픽업 16.9km  내일 15:00`
 *            `서울 강남구 삼성2동      / 더에스엠씨그룹            배송 10.1km  내일 16:40`
 *
 * 🔴 접근성 쪽에는 **「서울 강남구 삼성2동」이 한 글자도 없다.** 거리도 화면에 없는 셋
 *    (14.4·16.9·19.3)이 섞여 있고, 건물명 끝에는 픽커 앱 자체의 `content-desc` 버그인
 *    `kotlin.Unit` 이 붙는다 — 그 문자열로는 지오코딩이 안 된다.
 *    **우리가 고칠 수 있는 자리가 아니라서** 그림으로 우회한다.
 *
 * ── 무엇을 믿고 나누나 ──
 * 화면은 **「픽업 Nkm」 / 「배송 Nkm」 가 각 주소 덩어리의 머리**다. 그 둘을 경계로 삼아
 * 위에서 아래로 자른다. 지도(잡음이 많다)는 첫 머리 **앞**이라 저절로 잘려 나간다.
 *
 * 🔴 **여기서 좌표를 구하지 않는다.** 이 함수는 «줄 → 칸» 하나만 한다. 지오코딩·길찾기는
 *    부르는 쪽 일이다 — 섞으면 검사를 못 한다 (실측 OCR 줄만으로 돌아야 한다).
 *
 * 🔴 **`straightKm` 은 직선거리다** (기사님 실측 2026-09-12: 21.6=직선21.7 · 10.1=직선10.1).
 *    도로는 1.23~1.24 배다. 그대로 쓰면 나쁜 콜이 24% 좋아 보인다 — **이름에 박아 둔다.**
 */

/** OCR 한 줄 — `y` 는 위에서부터의 자리(위가 작다). 엔진이 무엇이든 이 둘만 주면 된다 */
export interface OcrLine {
    y: number;
    text: string;
}

export interface PickerStopFromImage {
    /** 행정동까지 — `경기 성남시 수정구 위례동` */
    admin: string;
    /** 건물·상호 — 없을 수 있다 (규칙 ④: 없으면 `null`, 지어내지 않는다) */
    place: string | null;
    /** 🔴 **직선거리다.** 도로가 아니다 */
    straightKm: number;
    /** 화면에 적힌 시각 그대로 — `내일 15:00` · `오늘 09:20`. 못 읽으면 `null` */
    at: string | null;
}

export interface PickerDetailFromImage {
    pickup: PickerStopFromImage;
    dropoff: PickerStopFromImage;
    /** `초소형 세 변의 합 70cm · 2kg 이하` 같은 줄 그대로 */
    itemSize: string | null;
    /**
     * 🔴 **예약 콜인가** — 화면에 「내일 15:00 픽업예약」이 있으면 참.
     *    2026-09-13 에 처음 봤다. 접근성 트리에는 이 줄이 **없어서** 예약 콜을
     *    «지금 콜»로 알고 판정하고 있었다 — 시각을 모르면 시급도 상차버퍼도 전부 틀린다.
     */
    reserved: boolean;
}

/** 시·도 이름 — 행정동 줄의 머리다 */
const PROVINCES = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

/** `픽업 16.9km` · `배송 10.1km` — 덩어리의 머리 */
/**
 * 🔴 **줄 처음만 보지 않는다** — 픽커 상세는 모양이 둘이다. 「픽업 2.2km …」처럼 줄 처음에 오기도 하고,
 *    「…모다아울렛 곤지암점 **픽업 2.2km** 17:48까지 픽업」처럼 **주소 뒤에** 붙기도 한다.
 *    `^` 로 묶어 두면 뒤 모양을 통째로 놓친다 — 사진에 배송지가 또렷한데 버렸다 (이상 기록 #46·#48·#39).
 *    지도 라벨과 섞이는 것은 `^` 가 아니라 «먼저 나오는 것 하나만» 이 막는다.
 */
const HEAD_RE = /(?:^|\s)(픽업|배송)\s*([0-9]+(?:\.[0-9]+)?)\s*km/;

/** `내일 15:00` · `오늘 9:20` · `15:00` */
const TIME_RE = /^(오늘|내일|모레)?\s*([0-9]{1,2}:[0-9]{2})$/;

/**
 * `10:00까지 픽업` · `12:39까지 배송` — **오늘 콜**은 시각이 이 꼴로 온다 (2026-09-19 A24 실측).
 * 🔴 이 줄을 시각으로 안 보면 **건물명 자리에 들어간다** — 첫 판에서 그랬다.
 */
const DEADLINE_RE = /^([0-9]{1,2}:[0-9]{2}까지)\s*(픽업|배송)$/;

/** 시각 줄이면 화면에 적힌 시각 그대로(`내일 15:00` · `10:00까지`), 아니면 null */
function timeOf(text: string): string | null {
    const t = TIME_RE.exec(text);
    if (t) return t[0].trim();
    const d = DEADLINE_RE.exec(text);
    return d ? d[1] : null;
}

/**
 * OCR 이 줄 앞에 붙이는 불릿(`•`·`·`·`*`)과 군더더기를 턴다.
 * ⚠️ 한글·숫자·영문이 나오는 첫 자리부터 남긴다 — 가운뎃점은 주소 안에 안 쓰인다.
 */
function stripBullet(text: string): string {
    return text.replace(/^[^0-9A-Za-z가-힣]+/, '').trim();
}

function isAdminLine(text: string): boolean {
    return PROVINCES.some(p => text.startsWith(p + ' '));
}

/**
 * 📷 **OCR 줄들을 픽커 상세 한 건으로 옮긴다.**
 *
 * 머리(`픽업 Nkm`·`배송 Nkm`) 둘이 다 없으면 **`null` 을 돌려준다** — 반쪽짜리를 만들지
 * 않는다 (규칙 ④). 상세가 아닌 화면을 잘못 찍었을 때가 그 경우다.
 */
export function parsePickerDetailOcr(lines: OcrLine[]): PickerDetailFromImage | null {
    const sorted = lines
        .map(l => ({ y: l.y, text: stripBullet(l.text) }))
        .filter(l => l.text.length > 0)
        .sort((a, b) => a.y - b.y);

    /* ① 머리 둘을 찾는다 — 먼저 나오는 것 하나씩만 본다 (지도 라벨에 같은 말이 있다) */
    let pickupHead: { y: number; km: number } | null = null;
    let dropoffHead: { y: number; km: number } | null = null;
    for (const l of sorted) {
        const m = HEAD_RE.exec(l.text);
        if (!m) continue;
        const km = Number(m[2]);
        if (!Number.isFinite(km)) continue;
        if (m[1] === '픽업' && !pickupHead) pickupHead = { y: l.y, km };
        if (m[1] === '배송' && !dropoffHead) dropoffHead = { y: l.y, km };
    }
    if (!pickupHead || !dropoffHead) return null;

    /* ② 머리를 경계로 잘라 각 덩어리를 읽는다 */
    const pickup = readStop(sorted, pickupHead, dropoffHead.y);
    const dropoff = readStop(sorted, dropoffHead, Number.POSITIVE_INFINITY);
    if (!pickup || !dropoff) return null;

    /**
     * ③ 물품 정보 — 「초소형 …」처럼 **크기 낱말로 시작하는 줄**을 그대로 싣는다.
     *    ⚠️ 칸을 더 나누지 않는다. 픽커의 크기 체계를 우리 적재 체계로 옮기는 것은
     *       별도 판이고, 지금 나누면 **근거 없는 환산**이 태어난다 (규칙 ④).
     */
    const itemSize = sorted.find(l => /^(초소형|소형|중형|대형)/.test(l.text))?.text ?? null;

    /* ④ 예약 콜인가 — 「…픽업예약」 줄 하나로 판단한다 */
    const reserved = sorted.some(l => l.text.includes('픽업예약'));

    return { pickup, dropoff, itemSize, reserved };
}

/**
 * 한 덩어리(머리 ~ 다음 머리 전)에서 행정동·건물명·시각을 뽑는다.
 *
 * 🔴 **머리 자신도 덩어리 안에 있다** — 머리 줄과 행정동 줄은 OCR 상 y 가 몇 px 차이라
 *    (오늘 실측: 574 ↔ 577) 「머리 다음부터」로 자르면 행정동이 **머리 위로 밀려 사라진다.**
 *    그래서 경계는 «머리의 y 부터»가 아니라 **«머리의 y − 여유»** 다.
 */
function readStop(
    sorted: Array<{ y: number; text: string }>,
    head: { y: number; km: number },
    nextHeadY: number,
): PickerStopFromImage | null {
    const SLACK = 20;   // 같은 줄로 볼 위아래 여유 (실측 3px, 넉넉히 잡는다)
    const block = sorted.filter(l => l.y >= head.y - SLACK && l.y < nextHeadY - SLACK);

    const admin = block.find(l => isAdminLine(l.text))?.text ?? null;
    if (!admin) return null;

    const at = block.map(l => timeOf(l.text)).find(t => t != null) ?? null;

    /* 건물명 — 머리·행정동·시각을 뺀 나머지 첫 줄 */
    const place = block.find(l =>
        l.text !== admin
        && !HEAD_RE.test(l.text)
        && timeOf(l.text) == null,
    )?.text ?? null;

    return { admin, place, straightKm: head.km, at };
}
